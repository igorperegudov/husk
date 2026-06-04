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
  'command',
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
  // elisym fallbacks, recognized for drop-in compatibility:
  'script',
  'script_timeout_ms',
  'max_execution_secs',
  'input_text',
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

function requireString(fm: Record<string, unknown>, key: string): string {
  const value = fm[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ManifestError(`SKILL.md: \`${key}\` is required and must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Turn a `run`/`command`/`script` value into an argv array. Accepts either a
 * YAML list (used verbatim) or a string (split on whitespace). For commands
 * with quoted/spaced arguments, prefer the list form in YAML.
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
 * Parse and normalize a SKILL.md manifest. HUSK-native fields win; elisym
 * fields (`script`, `mode`, `script_timeout_ms`, `input_mime`, ...) are used as
 * fallbacks so an existing skill folder serves over HTTP with no edits.
 */
export function parseManifest(content: string, slug: string): SkillManifest {
  const { frontmatter: fm } = parseFrontmatter(content);

  const name = requireString(fm, 'name');
  const description = requireString(fm, 'description');

  const runValue = fm.run ?? fm.command ?? fm.script;
  const serveValue = fm.serve ?? (fm.mode === 'static-file' ? fm.output_file : undefined);
  const hasRun = runValue !== undefined;
  const hasServe = serveValue !== undefined;
  const hasProxy = typeof fm.proxy === 'string' || typeof fm.proxy_url === 'string';
  const modeField = typeof fm.mode === 'string' ? fm.mode : undefined;

  // Decide the executor. `proxy` is explicit (`mode: proxy` or a `proxy:` URL).
  // An LLM skill is explicit (`mode: llm` or a `tools` list) or the implicit
  // default when nothing else is declared - matching elisym, whose default is
  // `llm`.
  let mode: SkillMode;
  if (modeField === 'proxy' || hasProxy) {
    mode = 'proxy';
  } else if (modeField === 'llm' || fm.tools !== undefined || (!hasRun && !hasServe)) {
    mode = 'llm';
  } else if (hasServe && !hasRun) {
    mode = 'static-file';
  } else {
    mode = 'script';
  }

  let runSource = 'script';
  if (fm.run !== undefined) {
    runSource = 'run';
  } else if (fm.command !== undefined) {
    runSource = 'command';
  }
  const argv = mode === 'script' ? toArgv(runValue, runSource) : [];
  const serveFile =
    mode === 'static-file' && typeof serveValue === 'string' ? serveValue : undefined;

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
    };
  }

  const proxy = mode === 'proxy' ? parseProxy(fm) : undefined;

  const inputMime = typeof fm.input_mime === 'string' ? fm.input_mime : undefined;
  const outputMime = typeof fm.output_mime === 'string' ? fm.output_mime : undefined;

  // Resolve input kind: explicit field, then elisym mode/mime heuristics.
  let input = coerceEnum<SkillInputKind>(fm.input, INPUT_KINDS, 'input');
  if (!input) {
    const mode = typeof fm.mode === 'string' ? fm.mode : undefined;
    if (
      serveFile ||
      mode === 'static-script' ||
      mode === 'static-file' ||
      fm.input_text === 'none'
    ) {
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

  // Resolve timeout: husk `timeout_ms`, then elisym equivalents.
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (typeof fm.timeout_ms === 'number') {
    timeoutMs = fm.timeout_ms;
  } else if (typeof fm.script_timeout_ms === 'number') {
    timeoutMs = fm.script_timeout_ms;
  } else if (typeof fm.max_execution_secs === 'number') {
    timeoutMs = fm.max_execution_secs * 1000;
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ManifestError('SKILL.md: `timeout_ms` must be a positive number');
  }

  const method = coerceEnum<HttpMethod>(fm.method, HTTP_METHODS, 'method') ?? 'POST';

  let route = typeof fm.route === 'string' && fm.route.trim() ? fm.route.trim() : `/skills/${slug}`;
  if (!route.startsWith('/')) {
    route = `/${route}`;
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!KNOWN_KEYS.has(key) && key !== 'output_file') {
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
