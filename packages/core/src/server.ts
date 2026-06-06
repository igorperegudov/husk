import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { invokeSkill, kernelErrorMessage } from './invoke';
import { generateOpenApi } from './openapi';
import { ProxyError, proxyRequest } from './proxy';
import type { HttpMethod, InvokeInput, InvokeResult, Skill, StreamEvent } from './types';

export interface HuskServerOptions {
  skills: Skill[];
  /** Service name shown on the index page and in OpenAPI. */
  serviceName?: string;
  version?: string;
  /**
   * Emit permissive CORS headers (`Access-Control-Allow-Origin: *`). Default
   * false - opt in only when a browser app on another origin must read
   * responses, since with no auth it lets any page do so.
   */
  cors?: boolean;
  /** Reject request bodies larger than this many bytes. Default 50 MB. */
  maxBodyBytes?: number;
  /** Max concurrent kernel invocations. 0 (default) means unlimited. */
  concurrency?: number;
  /**
   * If set, the request `Host` header's hostname must be one of these (port
   * ignored). Rejects others with 403. Defeats DNS rebinding against a
   * loopback bind - a page on evil.com that rebinds to 127.0.0.1 still sends
   * `Host: evil.com`. Leave unset when a gateway/proxy already fixes the Host.
   */
  allowedHosts?: string[];
  /**
   * Per-request gate. Return false to reject with 401. Runs before any kernel
   * is spawned. Use it for API keys, bearer tokens, etc.
   */
  auth?: (req: Request) => boolean | Promise<boolean>;
}

/** The public, JSON-safe description of a skill. */
export interface SkillCard {
  name: string;
  slug: string;
  description: string;
  mode: Skill['manifest']['mode'];
  method: HttpMethod;
  route: string;
  input: Skill['manifest']['input'];
  output: Skill['manifest']['output'];
  inputMime?: string;
  outputMime?: string;
  /** Names of the tools an LLM skill can call (omitted for non-LLM skills). */
  tools?: string[];
  doc: string;
}

export type FetchHandler = (req: Request) => Promise<Response>;

const DEFAULT_MAX_BODY = 50 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function toCard(skill: Skill): SkillCard {
  const m = skill.manifest;
  return {
    name: m.name,
    slug: skill.slug,
    description: m.description,
    mode: m.mode,
    method: m.method,
    route: m.route,
    input: m.input,
    output: m.output,
    inputMime: m.inputMime,
    outputMime: m.outputMime,
    tools: m.llm ? m.llm.tools.map((t) => t.name) : undefined,
    doc: skill.doc,
  };
}

interface Limiter {
  acquire: () => Promise<() => void>;
}

function createLimiter(max: number): Limiter {
  if (!max || max <= 0) {
    return { acquire: async () => () => {} };
  }
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = async (): Promise<() => void> => {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    return () => {
      active -= 1;
      const next = queue.shift();
      if (next) {
        next();
      }
    };
  };
  return { acquire };
}

function corsHeaders(enabled: boolean): Record<string, string> {
  if (!enabled) {
    return {};
  }
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
}

function json(body: unknown, status: number, cors: boolean): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(cors) },
  });
}

/** Escape a string for safe interpolation into HTML text/attribute context. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Extract the bare hostname from a `Host` header (strip the port; unwrap IPv6). */
function hostName(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end === -1 ? h : h.slice(1, end);
  }
  const colon = h.indexOf(':');
  return colon === -1 ? h : h.slice(0, colon);
}

/** Collapse CR/LF (illegal in HTTP header values) to spaces; trim and cap. */
function singleLineHeader(value: string, max: number): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function indexHtml(serviceName: string, cards: SkillCard[]): string {
  const rows = cards
    .map(
      (c) =>
        `<tr><td><code>${escapeHtml(c.method)}</code></td><td><code>${escapeHtml(c.route)}</code></td>` +
        `<td><strong>${escapeHtml(c.name)}</strong><br><span>${escapeHtml(c.description)}</span></td>` +
        `<td>${escapeHtml(c.input)} &rarr; ${escapeHtml(c.output)}</td></tr>`,
    )
    .join('\n');
  const title = escapeHtml(serviceName);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 920px; margin: 3rem auto; padding: 0 1rem; color: #111; }
  h1 { margin-bottom: 0.2rem; }
  p.sub { color: #666; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
  td, th { text-align: left; padding: 0.6rem 0.5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  code { background: #f5f5f5; padding: 0.1rem 0.35rem; border-radius: 4px; }
  span { color: #666; font-size: 0.92em; }
  a { color: #2b6cb0; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="sub">${cards.length} skill(s) served by HUSK &middot;
  <a href="/skills">/skills</a> &middot;
  <a href="/openapi.json">/openapi.json</a> &middot;
  <a href="/healthz">/healthz</a>
</p>
<table>
<thead><tr><th>Method</th><th>Route</th><th>Skill</th><th>I/O</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
}

function assertBodyWithinLimit(req: Request, max: number): void {
  const len = req.headers.get('content-length');
  if (len && Number(len) > max) {
    throw new HttpError(413, `request body exceeds ${max} bytes`);
  }
}

/**
 * Read the full request body, aborting once it exceeds `max` bytes. Unlike the
 * `content-length` check (which a chunked or header-spoofing client bypasses),
 * this counts the bytes actually delivered, so memory use is truly bounded.
 */
async function readBodyCapped(req: Request, max: number): Promise<Uint8Array> {
  const body = req.body;
  if (!body) {
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength > max) {
      throw new HttpError(413, `request body exceeds ${max} bytes`);
    }
    return buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, `request body exceeds ${max} bytes`);
    }
    chunks.push(value);
  }
  if (chunks.length === 1) {
    return chunks[0];
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Stage an uploaded blob to a temp dir; returns the file path and its dir. */
async function stageFile(
  bytes: ArrayBuffer | Uint8Array,
  filename: string,
): Promise<{ path: string; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'husk-in-'));
  const safeName = filename.replace(/[\\/]/g, '_') || 'input';
  const path = join(dir, safeName);
  await writeFile(path, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return { path, dir };
}

/** Parse an HTTP request into a skill {@link InvokeInput}. */
async function readInput(
  req: Request,
  skill: Skill,
  max: number,
): Promise<{ input: InvokeInput; stagedDir?: string }> {
  if (skill.manifest.input === 'none') {
    return { input: {} };
  }

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const text =
      url.searchParams.get('input') ??
      url.searchParams.get('q') ??
      url.searchParams.get('text') ??
      undefined;
    return { input: { text: text ?? undefined } };
  }

  assertBodyWithinLimit(req, max);
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    // Buffer the multipart body through the byte cap before parsing, so a
    // chunked or content-length-spoofing upload cannot exhaust memory here the
    // way a direct `req.formData()` (unbounded) would.
    const form = await new Request(req.url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: await readBodyCapped(req, max),
    }).formData();
    let file: InvokeInput['file'];
    let stagedDir: string | undefined;
    for (const [, value] of form.entries()) {
      if (typeof value !== 'string') {
        const blob = value as File;
        const staged = await stageFile(await blob.arrayBuffer(), blob.name || 'input');
        stagedDir = staged.dir;
        file = { path: staged.path, mime: blob.type || undefined, filename: blob.name || 'input' };
        break;
      }
    }
    const textField = form.get('text') ?? form.get('input') ?? form.get('prompt');
    const text = typeof textField === 'string' ? textField : undefined;
    return { input: { file, text }, stagedDir };
  }

  if (contentType.includes('application/json')) {
    const raw = new TextDecoder().decode(await readBodyCapped(req, max));
    let text = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'string') {
        text = parsed;
      } else if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as Record<string, unknown>).input === 'string'
      ) {
        text = (parsed as Record<string, string>).input;
      }
    } catch {
      // Not valid JSON despite the header; fall back to the raw body as text.
    }
    return { input: { text } };
  }

  if (skill.manifest.input === 'file') {
    const bytes = await readBodyCapped(req, max);
    const staged = await stageFile(bytes, 'input');
    return {
      input: { file: { path: staged.path, mime: contentType || undefined } },
      stagedDir: staged.dir,
    };
  }

  const text = new TextDecoder().decode(await readBodyCapped(req, max));
  return { input: { text } };
}

function errorStatus(result: InvokeResult): number {
  if (result.timedOut) {
    return 504;
  }
  if (result.spawnError) {
    return 500;
  }
  return 500;
}

async function buildResponse(result: InvokeResult, cors: boolean): Promise<Response> {
  const base = {
    'x-husk-duration-ms': String(result.durationMs),
    ...corsHeaders(cors),
  };

  if (!result.ok) {
    return json(
      {
        error: kernelErrorMessage(result),
        stderr: result.stderr.slice(0, 8000),
        exitCode: result.exitCode,
      },
      errorStatus(result),
      cors,
    );
  }

  if (result.outputKind === 'file') {
    if (result.files.length === 0) {
      return json(
        { error: 'skill produced no file output', stderr: result.stderr.slice(0, 8000) },
        500,
        cors,
      );
    }
    if (result.files.length === 1) {
      const file = result.files[0];
      const bytes = await readFile(file.path);
      const note = singleLineHeader(result.stdout, 1000);
      const filename = singleLineHeader(file.filename, 255).replace(/"/g, "'");
      return new Response(bytes, {
        status: 200,
        headers: {
          ...base,
          'content-type': file.mime,
          'content-disposition': `inline; filename="${filename}"`,
          ...(note ? { 'x-husk-note': note } : {}),
        },
      });
    }
    const files = await Promise.all(
      result.files.map(async (f) => ({
        filename: f.filename,
        mime: f.mime,
        size: f.size,
        dataBase64: (await readFile(f.path)).toString('base64'),
      })),
    );
    return json({ note: result.stdout.trim() || undefined, files }, 200, cors);
  }

  if (result.outputKind === 'json') {
    return new Response(result.stdout || '{}', {
      status: 200,
      headers: { ...base, 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(result.stdout, {
    status: 200,
    headers: { ...base, 'content-type': 'text/plain; charset=utf-8' },
  });
}

function sseLine(event: string, data: string): string {
  // EventSource treats CR, LF, and CRLF as line terminators, so split on all
  // three: a bare `\r` in kernel output (often echoed request input) would
  // otherwise let a chunk forge `event:`/`data:` fields inside one `data:` line.
  const payload = data
    .split(/\r\n|\r|\n/)
    .map((l) => `data: ${l}`)
    .join('\n');
  return `event: ${event}\n${payload}\n\n`;
}

function streamResponse(
  req: Request,
  skill: Skill,
  max: number,
  cors: boolean,
  limiter: Limiter,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let stagedDir: string | undefined;
      const ac = new AbortController();
      const onAbort = (): void => ac.abort();
      req.signal.addEventListener('abort', onAbort);
      // Streaming kernels count against the same concurrency cap as buffered
      // invocations, acquired before the body is read - so `Accept:
      // text/event-stream` cannot bypass the limit during ingestion either.
      const release = await limiter.acquire();
      try {
        const parsed = await readInput(req, skill, max);
        stagedDir = parsed.stagedDir;
        const onData = (event: StreamEvent): void => {
          controller.enqueue(encoder.encode(sseLine(event.stream, event.chunk)));
        };
        const result = await invokeSkill(skill, parsed.input, { signal: ac.signal, onData });
        await result.cleanup();
        controller.enqueue(
          encoder.encode(
            sseLine('done', JSON.stringify({ ok: result.ok, exitCode: result.exitCode })),
          ),
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(sseLine('error', err instanceof Error ? err.message : String(err))),
        );
      } finally {
        release();
        req.signal.removeEventListener('abort', onAbort);
        if (stagedDir) {
          await rm(stagedDir, { recursive: true, force: true });
        }
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      ...corsHeaders(cors),
    },
  });
}

/**
 * Build a Web-standard `fetch` handler that serves a set of skills over HTTP.
 *
 * The returned function maps a {@link Request} to a {@link Response}, so it runs
 * unchanged under `Bun.serve`, Deno, Cloudflare Workers, or a Node adapter -
 * which is what lets the same skill folder run as a long-lived server, a
 * container, or a serverless function with no redesign.
 *
 * Endpoints:
 * - `GET /`            HTML index of skills
 * - `GET /skills`      JSON array of skill cards
 * - `GET /skills/:slug` one skill card
 * - `GET /openapi.json` generated OpenAPI 3.1 spec
 * - `GET /healthz`     liveness probe
 * - `<method> <route>` invoke a skill (`Accept: text/event-stream` to stream)
 */
export function createFetchHandler(options: HuskServerOptions): FetchHandler {
  const skills = options.skills;
  const cors = options.cors ?? false;
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const serviceName = options.serviceName ?? 'HUSK skills';
  const version = options.version ?? '0.1.0';
  const allowedHosts = options.allowedHosts?.map((h) => h.toLowerCase());
  const limiter = createLimiter(options.concurrency ?? 0);

  const cards = skills.map(toCard);
  const bySlug = new Map<string, Skill>();
  const invokeRoutes = new Map<string, Skill>();
  const cardRoutes = new Map<string, Skill>();
  const knownPaths = new Set<string>(['/', '/skills', '/openapi.json', '/healthz']);

  for (const skill of skills) {
    bySlug.set(skill.slug, skill);
    const canonical = `/skills/${skill.slug}`;
    cardRoutes.set(canonical, skill);
    invokeRoutes.set(`${skill.manifest.method} ${skill.manifest.route}`, skill);
    knownPaths.add(canonical);
    knownPaths.add(skill.manifest.route);
    if (skill.manifest.route !== canonical) {
      cardRoutes.set(skill.manifest.route, skill);
    }
  }

  async function invoke(req: Request, skill: Skill): Promise<Response> {
    const url = new URL(req.url);

    // Proxy skills forward the live request and stream the upstream response
    // straight through - no buffering, so SSE and large bodies pass intact.
    if (skill.manifest.mode === 'proxy' && skill.manifest.proxy) {
      assertBodyWithinLimit(req, maxBody);
      // Count proxy invocations against the same `concurrency` cap as kernels -
      // proxy spends the operator's injected ${VAR} key and holds a long-lived
      // upstream connection, so it must not be able to fan out without limit.
      // The slot is held for the FULL streamed lifetime (released on the body's
      // close, error, or client cancel), not just until the headers arrive.
      const release = await limiter.acquire();
      let released = false;
      const releaseOnce = (): void => {
        if (!released) {
          released = true;
          release();
        }
      };
      const start = Date.now();
      let upstream: Response;
      try {
        upstream = await proxyRequest(skill.manifest.proxy, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          query: url.search,
          signal: req.signal,
          timeoutMs: skill.manifest.timeoutMs,
        });
      } catch (err) {
        releaseOnce();
        const status = err instanceof ProxyError ? 502 : 500;
        return json({ error: err instanceof Error ? err.message : String(err) }, status, cors);
      }
      const headers = new Headers(upstream.headers);
      for (const [key, value] of Object.entries(corsHeaders(cors))) {
        headers.set(key, value);
      }
      headers.set('x-husk-duration-ms', String(Date.now() - start));
      if (!upstream.body) {
        releaseOnce();
        return new Response(null, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
      }
      // Forward the upstream body while holding the slot until the stream ends.
      const reader = upstream.body.getReader();
      const monitored = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              releaseOnce();
              controller.close();
              return;
            }
            controller.enqueue(value);
          } catch (err) {
            releaseOnce();
            controller.error(err);
          }
        },
        cancel(reason) {
          releaseOnce();
          return reader.cancel(reason);
        },
      });
      return new Response(monitored, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    }

    const wantsStream =
      skill.manifest.output !== 'file' &&
      (url.searchParams.get('stream') === '1' ||
        (req.headers.get('accept') ?? '').includes('text/event-stream'));
    if (wantsStream) {
      return streamResponse(req, skill, maxBody, cors, limiter);
    }

    // Acquire the concurrency slot BEFORE reading/buffering the body, so body
    // ingestion is bounded by the same cap as kernel execution - otherwise an
    // attacker could open unlimited concurrent uploads the `concurrency` knob
    // never gated.
    const release = await limiter.acquire();
    try {
      const { input, stagedDir } = await readInput(req, skill, maxBody);
      try {
        const ac = new AbortController();
        const onAbort = (): void => ac.abort();
        req.signal.addEventListener('abort', onAbort);
        let result: InvokeResult;
        try {
          result = await invokeSkill(skill, input, { signal: ac.signal });
        } finally {
          req.signal.removeEventListener('abort', onAbort);
        }
        try {
          return await buildResponse(result, cors);
        } finally {
          await result.cleanup();
        }
      } finally {
        if (stagedDir) {
          await rm(stagedDir, { recursive: true, force: true });
        }
      }
    } finally {
      release();
    }
  }

  return async function handler(req: Request): Promise<Response> {
    try {
      // Reject mismatched Host first (DNS-rebinding defense), before CORS
      // preflight or any routing - a rebound attacker host never gets served.
      if (allowedHosts && !allowedHosts.includes(hostName(req.headers.get('host') ?? ''))) {
        return json({ error: 'host not allowed' }, 403, cors);
      }

      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(cors) });
      }

      if (options.auth) {
        const ok = await options.auth(req);
        if (!ok) {
          return json({ error: 'unauthorized' }, 401, cors);
        }
      }

      const url = new URL(req.url);
      let path = url.pathname;
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      const method = req.method;

      // Invoke routes take precedence (so a GET-invoke skill still works).
      const invokeSkillForRoute = invokeRoutes.get(`${method} ${path}`);
      if (invokeSkillForRoute) {
        return await invoke(req, invokeSkillForRoute);
      }

      if (method === 'GET') {
        if (path === '/') {
          return new Response(indexHtml(serviceName, cards), {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8', ...corsHeaders(cors) },
          });
        }
        if (path === '/healthz') {
          return json({ status: 'ok', skills: skills.length }, 200, cors);
        }
        if (path === '/skills') {
          return json(cards, 200, cors);
        }
        if (path === '/openapi.json') {
          return json(generateOpenApi(skills, { title: serviceName, version }), 200, cors);
        }
        const card = cardRoutes.get(path);
        if (card) {
          return json(toCard(card), 200, cors);
        }
      }

      if (knownPaths.has(path)) {
        return json({ error: `method ${method} not allowed for ${path}` }, 405, cors);
      }
      return json({ error: `not found: ${path}` }, 404, cors);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, err.status, cors);
      }
      return json({ error: err instanceof Error ? err.message : String(err) }, 500, cors);
    }
  };
}

export { toCard };
