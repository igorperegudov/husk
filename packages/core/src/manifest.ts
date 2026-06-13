import { parse as parseYaml } from 'yaml';
import { DEFAULT_TIMEOUT_MS } from './executor';
import type {
  HttpMethod,
  LlmSpec,
  ProxySpec,
  SkillInputKind,
  SkillManifest,
  SkillMode,
  SkillOutputKind,
  SkillTool,
} from './types';

/** Thrown when a SKILL.md manifest is missing required fields or malformed. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/** Largest accepted `timeout_ms`: setTimeout/AbortSignal.timeout overflow a 32-bit
 * signed int beyond this and silently collapse to a 1ms delay. (~24.8 days.) */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Default LLM output token cap for `mode: llm` skills. */
export const DEFAULT_MAX_TOKENS = 4096;
/** Default cap on LLM-to-tools rounds for `mode: llm` skills. */
export const DEFAULT_MAX_TOOL_ROUNDS = 10;

const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const INPUT_KINDS: readonly SkillInputKind[] = ['text', 'file', 'none'];
const OUTPUT_KINDS: readonly SkillOutputKind[] = ['text', 'json', 'file'];

/** Frontmatter keys HUSK consumes; everything else is preserved in `extra`. */
const KNOWN_KEYS = new Set([
  'name',
  'description',
  'run',
  'serve',
  'input',
  'output',
  'timeout_ms',
  'method',
  'route',
  'input_mime',
  'output_mime',
  // LLM mode:
  'mode',
  'tools',
  'tool_env',
  'provider',
  'model',
  'max_tokens',
  'max_tool_rounds',
  // proxy mode:
  'proxy',
  'proxy_url',
  'proxy_method',
  'headers',
  'forward_headers',
]);

/** Lowercase kebab-case slug from a human name. */
export function toSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Split a SKILL.md file into its YAML frontmatter and markdown body. */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const normalized = content.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(normalized);
  if (!match) {
    throw new ManifestError(
      'SKILL.md is missing YAML frontmatter (a block delimited by leading and trailing `---` lines)',
    );
  }
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(match[1]);
  } catch (err) {
    throw new ManifestError(`SKILL.md frontmatter is not valid YAML: ${(err as Error).message}`);
  }
  if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new ManifestError('SKILL.md frontmatter must be a YAML mapping');
  }
  return { frontmatter: frontmatter as Record<string, unknown>, body: (match[2] ?? '').trim() };
}

/**
 * Strip C0/C1 control characters (including the ANSI ESC byte, 0x1b) from a
 * single-line manifest string. These have no legitimate place in a name,
 * description, or route; left intact, a hostile SKILL.md could inject terminal
 * escape sequences that execute when the field is printed (`husk list`/`serve`)
 * or break out of a header/HTML context downstream.
 */
export function stripControlChars(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    if (!isControl) {
      out += ch;
    }
  }
  return out;
}

/**
 * Sanitize a manifest MIME value. `output_mime` becomes the `content-type`
 * response header for file output, so a stray CR/LF would otherwise allow
 * response-header injection. Empty-after-strip collapses to undefined.
 */
function sanitizeMime(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return stripControlChars(value.trim()) || undefined;
}

function requireString(fm: Record<string, unknown>, key: string): string {
  const value = fm[key];
  // Re-check emptiness AFTER stripping control chars: `trim()` removes only
  // whitespace, so a value of all control characters (e.g. `name: ""`)
  // would pass a `trim() !== ''` check yet strip to empty, breaking the
  // non-empty guarantee this function's error message promises.
  const cleaned = typeof value === 'string' ? stripControlChars(value.trim()) : '';
  if (!cleaned) {
    throw new ManifestError(`SKILL.md: \`${key}\` is required and must be a non-empty string`);
  }
  return cleaned;
}

/**
 * Turn a `run` value into an argv array. Accepts either a YAML list (used
 * verbatim) or a string (split on whitespace). For commands with quoted/spaced
 * arguments, prefer the list form in YAML.
 */
function toArgv(value: unknown, source: string): string[] {
  if (Array.isArray(value)) {
    const argv = value.map((v) => {
      if (typeof v !== 'string') {
        throw new ManifestError(`SKILL.md: every entry of \`${source}\` must be a string`);
      }
      return v;
    });
    if (argv.length === 0) {
      throw new ManifestError(`SKILL.md: \`${source}\` must not be empty`);
    }
    return argv;
  }
  if (typeof value === 'string') {
    const argv = value.trim().split(/\s+/).filter(Boolean);
    if (argv.length === 0) {
      throw new ManifestError(`SKILL.md: \`${source}\` must not be empty`);
    }
    return argv;
  }
  throw new ManifestError(`SKILL.md: \`${source}\` must be a string or a list of strings`);
}

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  key: string,
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ManifestError(`SKILL.md: \`${key}\` must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function isTextMime(mime: string | undefined): boolean {
  if (!mime) {
    return false;
  }
  return /^text\//.test(mime) || mime === 'application/json';
}

function asMapping(value: unknown, where: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManifestError(`SKILL.md: ${where} must be a mapping`);
  }
  return value as Record<string, unknown>;
}

function parseToolParams(value: unknown, toolName: string): SkillTool['parameters'] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ManifestError(`SKILL.md: tool "${toolName}" \`parameters\` must be a list`);
  }
  return value.map((raw, index) => {
    const p = asMapping(raw, `tool "${toolName}" parameters[${index}]`);
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!name) {
      throw new ManifestError(`SKILL.md: tool "${toolName}" parameters[${index}] needs a \`name\``);
    }
    const description = typeof p.description === 'string' ? p.description : '';
    const required = p.required === undefined ? true : Boolean(p.required);
    return { name, description, required };
  });
}

/** Parse the `tools` list of a `mode: llm` skill. */
function parseTools(value: unknown): SkillTool[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ManifestError('SKILL.md: `tools` must be a list');
  }
  return value.map((raw, index) => {
    const t = asMapping(raw, `tools[${index}]`);
    const name = typeof t.name === 'string' ? t.name.trim() : '';
    if (!name) {
      throw new ManifestError(`SKILL.md: tools[${index}] needs a \`name\``);
    }
    const description = typeof t.description === 'string' ? t.description.trim() : '';
    if (!description) {
      throw new ManifestError(`SKILL.md: tool "${name}" needs a \`description\``);
    }
    const command = toArgv(t.command, `tool "${name}" command`);
    return { name, description, command, parameters: parseToolParams(t.parameters, name) };
  });
}

function parsePositiveInt(value: unknown, key: string, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ManifestError(`SKILL.md: \`${key}\` must be a positive integer`);
  }
  return value;
}

/** Parse a YAML mapping of header name -> string value. */
function parseHeaders(value: unknown): Record<string, string> {
  if (value === undefined || value === null) {
    return {};
  }
  const map = asMapping(value, '`headers`');
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(map)) {
    if (typeof raw !== 'string') {
      throw new ManifestError(`SKILL.md: header "${key}" must be a string`);
    }
    out[key] = raw;
  }
  return out;
}

function parseStringList(value: unknown, key: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ManifestError(`SKILL.md: \`${key}\` must be a list of strings`);
  }
  return value.map((v, index) => {
    if (typeof v !== 'string') {
      throw new ManifestError(`SKILL.md: ${key}[${index}] must be a string`);
    }
    return v;
  });
}

/** Build the {@link ProxySpec} for a `mode: proxy` skill. */
function parseProxy(fm: Record<string, unknown>): ProxySpec {
  let url = '';
  if (typeof fm.proxy === 'string') {
    url = fm.proxy.trim();
  } else if (typeof fm.proxy_url === 'string') {
    url = fm.proxy_url.trim();
  }
  if (!url) {
    throw new ManifestError('SKILL.md: `proxy` requires an upstream URL');
  }
  if (!/^https?:\/\//.test(url)) {
    throw new ManifestError('SKILL.md: `proxy` URL must start with http:// or https://');
  }
  const method =
    typeof fm.proxy_method === 'string' ? fm.proxy_method.trim().toUpperCase() : undefined;
  return {
    url,
    method,
    headers: parseHeaders(fm.headers),
    forwardHeaders: parseStringList(fm.forward_headers, 'forward_headers').map((h) =>
      h.toLowerCase(),
    ),
  };
}

/**
 * Parse and normalize a SKILL.md manifest into a {@link SkillManifest}.
 */
export function parseManifest(content: string, slug: string): SkillManifest {
  const { frontmatter: fm } = parseFrontmatter(content);

  const name = requireString(fm, 'name');
  const description = requireString(fm, 'description');

  const runValue = fm.run;
  const serveValue = fm.serve;
  const hasRun = runValue !== undefined;
  const hasServe = serveValue !== undefined;
  const hasProxy = typeof fm.proxy === 'string' || typeof fm.proxy_url === 'string';
  const modeField = typeof fm.mode === 'string' ? fm.mode : undefined;

  // `tools:` is an LLM-only concept. Declaring it alongside an explicit non-llm
  // mode (`script`/`static-file`/`proxy`) is contradictory:
  // honoring it would coerce the skill into an unintended, token-spending llm
  // endpoint and silently drop the declared `run:`/`serve:`. Reject it loudly
  // rather than let `tools:` override the operator's explicit `mode:` - the same
  // anti-coercion invariant the cascade below upholds for a missing target.
  if (fm.tools !== undefined && modeField !== undefined && modeField !== 'llm') {
    throw new ManifestError(
      `SKILL.md: \`tools\` only applies to \`mode: llm\`, but \`mode: ${modeField}\` was set`,
    );
  }

  // Same anti-coercion guard for `proxy:`/`proxy_url:`: it is proxy-mode-only, so
  // declaring it under an explicit non-proxy `mode:` is contradictory and would
  // silently drop the declared executor (a `mode: script` skill becoming a
  // reverse proxy). Reject it rather than let the URL override the operator's
  // explicit mode.
  if (hasProxy && modeField !== undefined && modeField !== 'proxy') {
    throw new ManifestError(
      `SKILL.md: \`proxy\` only applies to \`mode: proxy\`, but \`mode: ${modeField}\` was set`,
    );
  }

  // Decide the executor. `proxy` is explicit (`mode: proxy` or a `proxy:` URL).
  // An LLM skill is explicit (`mode: llm` or a `tools` list) or the implicit
  // default when nothing else is declared. Crucially, both the `tools:` inference
  // and the implicit `llm` default apply ONLY when no `mode:` was set: an
  // explicitly-declared non-llm mode whose
  // target is missing (a typo in `run:`/`serve:`) must reach its own error below,
  // never get silently coerced into an unintended, unauthenticated,
  // token-spending llm endpoint.
  let mode: SkillMode;
  if (modeField === 'proxy' || (modeField === undefined && hasProxy)) {
    mode = 'proxy';
  } else if (modeField === 'static-file') {
    // Explicit `mode: static-file` with no serve target falls through to the
    // missing-target guard below (clear error) rather than the `llm` default.
    mode = 'static-file';
  } else if (
    modeField === 'llm' ||
    (modeField === undefined && (fm.tools !== undefined || (!hasRun && !hasServe)))
  ) {
    mode = 'llm';
  } else if (modeField === undefined && hasServe && !hasRun) {
    // Implicit static-file: a bare `serve:` with no `mode:` and no `run:`. Gated
    // on `modeField === undefined` so an explicit `mode: script` (etc.) with a
    // stray `serve:` but a missing `run:` is NOT silently rerouted to
    // static-file - it falls through to the missing-target guard below instead.
    mode = 'static-file';
  } else {
    // Includes an explicit `mode: script` with a missing `run`: `toArgv` below
    // throws a ManifestError instead of silently defaulting to `llm` or
    // static-file.
    mode = 'script';
  }

  const argv = mode === 'script' ? toArgv(runValue, 'run') : [];
  const serveFile =
    mode === 'static-file' && typeof serveValue === 'string' ? serveValue.trim() : undefined;
  if (mode === 'static-file' && !serveFile) {
    // Caught here rather than crashing at invoke when `resolveInside` gets a
    // non-string path (e.g. `mode: static-file` with a numeric `serve`).
    throw new ManifestError(
      'SKILL.md: a `static-file` skill needs `serve` set to a non-empty file path',
    );
  }

  let llm: LlmSpec | undefined;
  if (mode === 'llm') {
    const provider =
      typeof fm.provider === 'string' && fm.provider.trim() ? fm.provider.trim() : 'anthropic';
    const model = typeof fm.model === 'string' && fm.model.trim() ? fm.model.trim() : undefined;
    llm = {
      provider,
      model,
      maxTokens: parsePositiveInt(fm.max_tokens, 'max_tokens', DEFAULT_MAX_TOKENS),
      maxToolRounds: parsePositiveInt(
        fm.max_tool_rounds,
        'max_tool_rounds',
        DEFAULT_MAX_TOOL_ROUNDS,
      ),
      tools: parseTools(fm.tools),
      // Extra env var names a tool subprocess is allowed to see. Tools otherwise
      // receive an allowlisted, secret-free environment (see scopedToolEnv), so
      // an operator opts in only the vars their own tool scripts genuinely need.
      toolEnv: parseStringList(fm.tool_env, 'tool_env'),
    };
  }

  const proxy = mode === 'proxy' ? parseProxy(fm) : undefined;

  const inputMime = sanitizeMime(fm.input_mime);
  const outputMime = sanitizeMime(fm.output_mime);

  // Resolve input kind: explicit field, then a static-file/MIME heuristic.
  let input = coerceEnum<SkillInputKind>(fm.input, INPUT_KINDS, 'input');
  if (!input) {
    if (mode === 'static-file') {
      input = 'none';
    } else if (inputMime && inputMime !== 'none' && !isTextMime(inputMime)) {
      input = 'file';
    } else {
      input = 'text';
    }
  }

  // Resolve output kind: explicit field, then output_mime heuristic.
  let output = coerceEnum<SkillOutputKind>(fm.output, OUTPUT_KINDS, 'output');
  if (!output) {
    output = outputMime && !isTextMime(outputMime) ? 'file' : 'text';
  }

  // Resolve timeout: explicit `timeout_ms`, else the default.
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (typeof fm.timeout_ms === 'number') {
    timeoutMs = fm.timeout_ms;
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ManifestError('SKILL.md: `timeout_ms` must be a positive number');
  }
  if (timeoutMs > MAX_TIMEOUT_MS) {
    // setTimeout / AbortSignal.timeout cap at a 32-bit signed int; a larger delay
    // silently overflows to 1ms, which would SIGKILL the kernel almost instantly -
    // the opposite of the operator's intent. Reject it loudly instead.
    throw new ManifestError(
      `SKILL.md: \`timeout_ms\` must not exceed ${MAX_TIMEOUT_MS} (~24.8 days)`,
    );
  }

  const method = coerceEnum<HttpMethod>(fm.method, HTTP_METHODS, 'method') ?? 'POST';

  // Derive the default route from the manifest name's slug - the SAME slug the
  // loader uses as the skill's identity (`toSlug(name) || folderSlug`) - so the
  // invoke route, the canonical card route, and the identity never diverge when
  // the folder name and `name:` slugify differently. Fall back to the folder
  // slug when `toSlug(name)` is empty.
  const routeSlug = toSlug(name) || slug;
  let route =
    typeof fm.route === 'string' && fm.route.trim()
      ? stripControlChars(fm.route.trim())
      : `/skills/${routeSlug}`;
  if (!route.startsWith('/')) {
    route = `/${route}`;
  }
  // Normalize trailing slashes so `/healthz/` can't slip past the reserved-route
  // and duplicate checks yet collapse to `/healthz` at request time (the server
  // strips them).
  if (route.length > 1) {
    route = route.replace(/\/+$/, '') || '/';
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!KNOWN_KEYS.has(key)) {
      extra[key] = value;
    }
  }

  return {
    name,
    description,
    argv,
    serveFile,
    input,
    output,
    timeoutMs,
    method,
    route,
    inputMime,
    outputMime,
    mode,
    llm,
    proxy,
    extra,
  };
}
