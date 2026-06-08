import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { runProcess, type RunOptions } from './executor';
import { runLlm } from './llm';
import { mimeFromPath } from './mime';
import { proxyRequest } from './proxy';
import type { InvokeInput, InvokeOptions, InvokeResult, OutputFile, Skill } from './types';

const NOOP_CLEANUP = async (): Promise<void> => {};

/** Default cap on a buffered `mode: proxy` upstream response (100 MB). */
const DEFAULT_PROXY_MAX_BYTES = 100 * 1024 * 1024;

/** Read a fetch Response body fully, aborting once it exceeds `max` bytes. */
async function readResponseCapped(res: Response, max: number): Promise<Uint8Array> {
  const body = res.body;
  if (!body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > max) {
      throw new Error(`upstream response exceeds ${max} bytes`);
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
      throw new Error(`upstream response exceeds ${max} bytes`);
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

/** A human-readable explanation for a failed {@link InvokeResult}. */
export function kernelErrorMessage(result: InvokeResult): string {
  if (result.errorMessage) {
    return result.errorMessage;
  }
  if (result.spawnError) {
    return `failed to start kernel: ${result.spawnError}`;
  }
  if (result.timedOut) {
    return 'kernel timed out';
  }
  if (result.exitCode !== null) {
    return `kernel exited with code ${result.exitCode}`;
  }
  return 'kernel failed';
}

/** Resolve `cmd`/`args` from a skill's argv, expanding a local script path. */
function resolveCommand(skill: Skill): { cmd: string; args: string[] } {
  const [first, ...rest] = skill.manifest.argv;
  const isLocal = first.startsWith('.') || first.startsWith('/') || first.includes('/');
  if (!isLocal) {
    return { cmd: first, args: rest };
  }
  const abs = isAbsolute(first) ? first : resolve(skill.dir, first);
  return { cmd: abs, args: rest };
}

/**
 * Real path of `p`, or - when `p` does not exist yet - the real path of its
 * nearest existing ancestor with the missing tail re-attached. Resolving the
 * ancestor catches a symlinked intermediate directory even when the final
 * component is absent.
 */
function realpathWithTail(p: string): string {
  let current = p;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = realpathSync(current);
      return tail.length === 0 ? real : join(real, ...tail.reverse());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      const parent = dirname(current);
      if (parent === current) {
        return p;
      }
      tail.push(basename(current));
      current = parent;
    }
  }
}

/** Guard that a manifest-declared path stays inside the skill folder. */
function resolveInside(skillDir: string, relPath: string): string {
  const abs = isAbsolute(relPath) ? relPath : resolve(skillDir, relPath);
  const root = resolve(skillDir);
  // Lexical pre-check rejects an obvious `../` escape before touching disk.
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path "${relPath}" escapes the skill directory`);
  }
  // A lexical check alone is defeated by a symlink inside the skill folder whose
  // target is outside it (e.g. `serve: data.txt` where `data.txt -> /etc/passwd`):
  // stat()/readFile() follow symlinks, so resolve the real paths and re-check
  // containment - the same defense loader.ts's ensureExecutable applies.
  const realRoot = realpathWithTail(root);
  const realAbs = realpathWithTail(abs);
  if (realAbs !== realRoot && !realAbs.startsWith(realRoot + sep)) {
    throw new Error(`path "${relPath}" escapes the skill directory`);
  }
  return abs;
}

/** Serve a static file (no kernel process) - the `serve:` manifest path. */
async function invokeStaticFile(skill: Skill, startedAt: number): Promise<InvokeResult> {
  const filePath = resolveInside(skill.dir, skill.manifest.serveFile as string);
  const st = await stat(filePath).catch(() => null);
  if (!st || !st.isFile()) {
    return {
      ok: false,
      stdout: '',
      stderr: `serve file not found: ${skill.manifest.serveFile}`,
      exitCode: null,
      timedOut: false,
      spawnError: 'ENOENT',
      outputKind: skill.manifest.output,
      files: [],
      durationMs: Date.now() - startedAt,
      cleanup: NOOP_CLEANUP,
    };
  }

  if (skill.manifest.output === 'file') {
    const file: OutputFile = {
      path: filePath,
      mime: skill.manifest.outputMime ?? mimeFromPath(filePath),
      filename: basename(filePath),
      size: st.size,
    };
    return {
      ok: true,
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      outputKind: 'file',
      files: [file],
      durationMs: Date.now() - startedAt,
      // The served file lives in the skill dir; never delete it.
      cleanup: NOOP_CLEANUP,
    };
  }

  const content = await readFile(filePath, 'utf-8');
  return {
    ok: true,
    stdout: content,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    outputKind: skill.manifest.output,
    files: [],
    durationMs: Date.now() - startedAt,
    cleanup: NOOP_CLEANUP,
  };
}

/** Collect non-empty files a kernel wrote to the output dir / output file. */
async function collectOutputFiles(
  outputDir: string,
  outputFile: string,
  outputMime: string | undefined,
): Promise<OutputFile[]> {
  const files: OutputFile[] = [];

  const entries = await readdir(outputDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) {
      continue;
    }
    const path = join(outputDir, entry.name);
    const st = await stat(path).catch(() => null);
    if (st && st.size > 0) {
      files.push({
        path,
        mime: outputMime ?? mimeFromPath(entry.name),
        filename: entry.name,
        size: st.size,
      });
    }
  }
  if (files.length > 0) {
    return files;
  }

  const st = await stat(outputFile).catch(() => null);
  if (st && st.size > 0) {
    files.push({
      path: outputFile,
      mime: outputMime ?? 'application/octet-stream',
      filename: 'output',
      size: st.size,
    });
  }
  return files;
}

/** Run a `mode: llm` skill: the LLM answers, calling the declared tools. */
async function invokeLlm(
  skill: Skill,
  input: InvokeInput,
  options: InvokeOptions,
  startedAt: number,
): Promise<InvokeResult> {
  const spec = skill.manifest.llm;
  const base = {
    files: [] as OutputFile[],
    outputKind: skill.manifest.output,
    cleanup: NOOP_CLEANUP,
  };
  if (!spec) {
    return {
      ok: false,
      stdout: '',
      stderr: 'internal: llm spec missing',
      exitCode: null,
      timedOut: false,
      errorMessage: 'internal: llm spec missing',
      durationMs: Date.now() - startedAt,
      ...base,
    };
  }
  try {
    const text = await runLlm({
      spec,
      systemPrompt: skill.doc,
      userInput: input.text ?? '',
      skillDir: skill.dir,
      toolTimeoutMs: skill.manifest.timeoutMs,
      signal: options.signal,
      env: { ...process.env, ...options.env },
    });
    if (options.onData && text) {
      options.onData({ stream: 'stdout', chunk: text });
    }
    return {
      ok: true,
      stdout: text,
      stderr: '',
      exitCode: 0,
      timedOut: false,
      durationMs: Date.now() - startedAt,
      ...base,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: null,
      timedOut: false,
      errorMessage: message,
      durationMs: Date.now() - startedAt,
      ...base,
    };
  }
}

/** Run a `mode: proxy` skill (buffered) - forward to the upstream and capture it. */
async function invokeProxy(
  skill: Skill,
  input: InvokeInput,
  options: InvokeOptions,
  startedAt: number,
): Promise<InvokeResult> {
  const spec = skill.manifest.proxy;
  if (!spec) {
    return {
      ok: false,
      stdout: '',
      stderr: 'internal: proxy spec missing',
      exitCode: null,
      timedOut: false,
      errorMessage: 'internal: proxy spec missing',
      outputKind: skill.manifest.output,
      files: [],
      durationMs: Date.now() - startedAt,
      cleanup: NOOP_CLEANUP,
    };
  }

  const text = input.text ?? '';
  const trimmed = text.trimStart();
  const contentType =
    trimmed.startsWith('{') || trimmed.startsWith('[') ? 'application/json' : 'text/plain';

  let res: Response;
  try {
    res = await proxyRequest(
      spec,
      {
        method: skill.manifest.method,
        headers: { 'content-type': contentType },
        body: text,
        signal: options.signal,
        timeoutMs: skill.manifest.timeoutMs,
      },
      { ...process.env, ...options.env },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: null,
      timedOut: false,
      errorMessage: message,
      outputKind: skill.manifest.output,
      files: [],
      durationMs: Date.now() - startedAt,
      cleanup: NOOP_CLEANUP,
    };
  }

  const upstreamType = res.headers.get('content-type') ?? '';
  const ok = res.ok;
  const upstreamError = ok ? undefined : `upstream returned HTTP ${res.status}`;
  const isText =
    upstreamType === '' ||
    /^(text\/|application\/(json|xml)|application\/[\w.+-]*\+json)/.test(upstreamType);

  // Cap the buffered upstream read so a multi-GB body delivered within the skill
  // timeout cannot OOM the host - the same bound the request body, kernel output,
  // and SSE stream already enforce. (The HTTP server streams proxy responses and
  // never reaches here; this guards the CLI/library buffered path.)
  const maxBytes = options.maxOutputBytes ?? DEFAULT_PROXY_MAX_BYTES;
  let raw: Uint8Array;
  try {
    raw = await readResponseCapped(res, maxBytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: null,
      timedOut: false,
      errorMessage: message,
      outputKind: skill.manifest.output,
      files: [],
      durationMs: Date.now() - startedAt,
      cleanup: NOOP_CLEANUP,
    };
  }

  if (isText) {
    const body = new TextDecoder().decode(raw);
    return {
      ok,
      stdout: body,
      stderr: ok ? '' : body.slice(0, 8000),
      exitCode: ok ? 0 : null,
      timedOut: false,
      errorMessage: upstreamError,
      outputKind: /json/.test(upstreamType) ? 'json' : skill.manifest.output,
      files: [],
      durationMs: Date.now() - startedAt,
      cleanup: NOOP_CLEANUP,
    };
  }

  const bytes = raw;
  const workdir = await mkdtemp(join(tmpdir(), 'husk-proxy-'));
  const filePath = join(workdir, 'output');
  await writeFile(filePath, bytes);
  return {
    ok,
    stdout: '',
    stderr: '',
    exitCode: ok ? 0 : null,
    timedOut: false,
    errorMessage: upstreamError,
    outputKind: 'file',
    files: [{ path: filePath, mime: upstreamType, filename: 'output', size: bytes.length }],
    durationMs: Date.now() - startedAt,
    cleanup: async (): Promise<void> => {
      await rm(workdir, { recursive: true, force: true });
    },
  };
}

/**
 * Invoke a skill's kernel with the given input and return a structured result.
 *
 * I/O contract handed to the kernel:
 * - `text` input  -> piped to stdin.
 * - `file` input  -> staged at `HUSK_INPUT_FILE` (+ `ELISYM_INPUT_FILE` alias).
 * - `text`/`json` output -> read from stdout.
 * - `file` output -> kernel writes `HUSK_OUTPUT_FILE` (single) or files into
 *   `HUSK_OUTPUT_DIR` (many). Aliased as `ELISYM_OUTPUT_*` for compatibility.
 *
 * The caller owns any staged input file; `result.cleanup()` removes only the
 * temp output workspace this call created. Always await `cleanup()`.
 */
export async function invokeSkill(
  skill: Skill,
  input: InvokeInput,
  options: InvokeOptions = {},
): Promise<InvokeResult> {
  const startedAt = Date.now();

  if (skill.manifest.mode === 'llm') {
    return invokeLlm(skill, input, options, startedAt);
  }

  if (skill.manifest.mode === 'proxy') {
    return invokeProxy(skill, input, options, startedAt);
  }

  if (skill.manifest.mode === 'static-file' && skill.manifest.serveFile) {
    return invokeStaticFile(skill, startedAt);
  }

  const { cmd, args } = resolveCommand(skill);

  const env: NodeJS.ProcessEnv = { ...process.env, ...options.env };
  let workdir: string | undefined;
  let outputFile = '';
  let outputDir = '';

  if (input.file) {
    env.HUSK_INPUT_FILE = input.file.path;
    env.ELISYM_INPUT_FILE = input.file.path;
    if (input.file.mime) {
      env.HUSK_INPUT_MIME = input.file.mime;
    }
    if (input.file.filename) {
      // The upload filename is untrusted, client-controlled input. A kernel may
      // naively build an output path from it (e.g. `$HUSK_OUTPUT_DIR/$HUSK_INPUT_FILENAME`),
      // so collapse path separators and reject `.`/`..` to a single safe segment -
      // matching how the staged input path is sanitized in server.ts.
      const stripped = input.file.filename.replace(/[\\/]/g, '_').trim();
      env.HUSK_INPUT_FILENAME =
        stripped && stripped !== '.' && stripped !== '..' ? stripped : 'input';
    }
  }

  if (skill.manifest.output === 'file') {
    workdir = await mkdtemp(join(tmpdir(), 'husk-out-'));
    outputFile = join(workdir, 'output');
    outputDir = join(workdir, 'files');
    await mkdir(outputDir, { recursive: true });
    env.HUSK_OUTPUT_FILE = outputFile;
    env.HUSK_OUTPUT_DIR = outputDir;
    env.ELISYM_OUTPUT_FILE = outputFile;
    env.ELISYM_OUTPUT_DIR = outputDir;
  }

  const cleanup = workdir
    ? async (): Promise<void> => {
        await rm(workdir as string, { recursive: true, force: true });
      }
    : NOOP_CLEANUP;

  const runOpts: RunOptions = {
    cwd: skill.dir,
    stdin: skill.manifest.input === 'none' ? '' : (input.text ?? ''),
    signal: options.signal,
    timeoutMs: skill.manifest.timeoutMs,
    env,
    onData: options.onData,
  };

  const run = await runProcess(cmd, args, runOpts);

  const files =
    skill.manifest.output === 'file'
      ? await collectOutputFiles(outputDir, outputFile, skill.manifest.outputMime)
      : [];

  const ok = run.spawnError === undefined && run.code === 0;

  return {
    ok,
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.code,
    timedOut: run.timedOut,
    spawnError: run.spawnError?.message,
    outputKind: skill.manifest.output,
    files,
    durationMs: Date.now() - startedAt,
    cleanup,
  };
}
