/**
 * Core type contracts for HUSK.
 *
 * A *skill* is a folder with a `SKILL.md` manifest and (usually) a script - the
 * *kernel*. HUSK is the *husk* that wraps the kernel and publishes it over HTTP.
 * These types describe a skill on disk, how it is invoked, and what comes back.
 */

/** How a skill receives its request payload. */
export type SkillInputKind =
  /** Request body (text) is piped to the kernel's stdin. The default. */
  | 'text'
  /** Request body (binary/upload) is written to a file at `HUSK_INPUT_FILE`. */
  | 'file'
  /** The kernel takes no input - it is invoked with an empty stdin. */
  | 'none';

/** How a skill's result is interpreted and served back over HTTP. */
export type SkillOutputKind =
  /** stdout is returned verbatim as `text/plain`. The default. */
  | 'text'
  /** stdout is returned as `application/json` (passed through untouched). */
  | 'json'
  /** The kernel writes a file to `HUSK_OUTPUT_FILE` / `HUSK_OUTPUT_DIR`. */
  | 'file';

/** HTTP verb used to *invoke* a skill. Describe endpoints are always GET. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Which executor handles a skill. */
export type SkillMode =
  /** Run a kernel command (the default). */
  | 'script'
  /** Return the contents of a static file. */
  | 'static-file'
  /** Let an LLM run the skill, calling the declared tools. */
  | 'llm'
  /** Forward the request to an upstream HTTP endpoint. */
  | 'proxy';

/** Reverse-proxy configuration for a `mode: proxy` skill. */
export interface ProxySpec {
  /** Upstream URL to forward to (http:// or https://). */
  url: string;
  /** Override the upstream HTTP method; defaults to the invocation method. */
  method?: string;
  /**
   * Headers to send upstream. Values may reference environment variables with
   * `${VAR}` - resolved at request time, so secrets stay server-side.
   */
  headers: Record<string, string>;
  /** Incoming request header names (lowercased) to forward upstream. */
  forwardHeaders: string[];
}

/** A tool an LLM skill can call - an external script described to the model. */
export interface SkillTool {
  name: string;
  description: string;
  /** Command argv. `command[0]` is an interpreter or a path in the skill dir. */
  command: string[];
  /**
   * Parameters the model fills in. The first declared parameter is passed as a
   * positional argument when it is `required`; every other parameter (and a
   * non-required first one) is passed as `--name value`. None may begin with `-`
   * (argument-injection guard).
   */
  parameters: Array<{ name: string; description: string; required: boolean }>;
}

/** LLM configuration for a `mode: llm` skill. The system prompt is the doc body. */
export interface LlmSpec {
  /** Provider id: `anthropic` (default), `openai`, `xai`, `google`, `deepseek`. */
  provider: string;
  /** Model id. Defaults to the provider's default model when omitted. */
  model?: string;
  /** Output token cap. Default 4096. */
  maxTokens: number;
  /** Max LLM-to-tools rounds before giving up. Default 10. */
  maxToolRounds: number;
  /** Tools the model may call (may be empty for a pure prompt skill). */
  tools: SkillTool[];
  /**
   * Names of environment variables a tool subprocess is allowed to inherit, on
   * top of the safe operational base. Tools get an allowlisted, secret-free env
   * by default (no provider keys, no proxy `${VAR}` upstream credentials); this
   * opts specific vars back in for tools that need their own credentials.
   */
  toolEnv?: string[];
}

/**
 * A parsed, normalized skill manifest. Built from `SKILL.md` frontmatter with
 * HUSK-native fields taking priority and elisym fields accepted as fallbacks so
 * existing skill folders serve unchanged.
 */
export interface SkillManifest {
  /** Human-facing name (e.g. "Uppercase"). */
  name: string;
  /** One-line description used in cards and OpenAPI summaries. */
  description: string;
  /**
   * The kernel command as an argv array. `argv[0]` is either an interpreter on
   * PATH (`python3`) or a path relative to the skill dir (`./run.sh`). Empty
   * when the skill only serves a static file (see {@link serveFile}).
   */
  argv: string[];
  /** Path (relative to the skill dir) of a static file to serve, if any. */
  serveFile?: string;
  input: SkillInputKind;
  output: SkillOutputKind;
  /** Hard execution timeout in milliseconds. */
  timeoutMs: number;
  /** HTTP verb that invokes the skill. */
  method: HttpMethod;
  /** Invocation path, e.g. `/skills/uppercase`. Always starts with `/`. */
  route: string;
  /** MIME type advertised for `file` input (discovery hint, not enforced). */
  inputMime?: string;
  /** MIME type used for `file` output responses. */
  outputMime?: string;
  /** Which executor handles this skill. */
  mode: SkillMode;
  /** LLM configuration; present iff `mode === 'llm'`. */
  llm?: LlmSpec;
  /** Reverse-proxy configuration; present iff `mode === 'proxy'`. */
  proxy?: ProxySpec;
  /** Any frontmatter keys HUSK does not recognize, preserved verbatim. */
  extra: Record<string, unknown>;
}

/** A skill loaded from disk: its manifest plus on-disk location and docs. */
export interface Skill {
  manifest: SkillManifest;
  /** Absolute path to the skill's folder. */
  dir: string;
  /** URL-safe identifier derived from the name (kebab-case). */
  slug: string;
  /** The markdown body of SKILL.md (Agent-Skills-compatible docs). */
  doc: string;
}

/** A file produced by a kernel invocation. */
export interface OutputFile {
  /** Absolute path to the produced file (inside a temp dir until cleanup). */
  path: string;
  mime: string;
  filename: string;
  size: number;
}

/** The payload handed to a skill on invocation. */
export interface InvokeInput {
  /** Text payload, piped to stdin. Optional alongside a file. */
  text?: string;
  /** A file payload (for `file`-input skills). */
  file?: {
    /** Absolute path to the already-staged input file. */
    path: string;
    mime?: string;
    filename?: string;
  };
}

/** The result of invoking a skill. */
export interface InvokeResult {
  ok: boolean;
  /** Captured stdout (the result for `text`/`json` skills; a note for files). */
  stdout: string;
  /** Captured stderr (surfaced on error). */
  stderr: string;
  /** Process exit code, or null when killed by signal/timeout. */
  exitCode: number | null;
  /** True when the kernel was killed by the timeout. */
  timedOut: boolean;
  /** Set when spawning the kernel itself failed (ENOENT, EACCES, ...). */
  spawnError?: string;
  /** A specific failure message (e.g. an LLM error) overriding the generic one. */
  errorMessage?: string;
  outputKind: SkillOutputKind;
  /** Files produced by `file`-output skills. */
  files: OutputFile[];
  durationMs: number;
  /** Removes any temp files created for this invocation. Always call it. */
  cleanup: () => Promise<void>;
}

/** A chunk of output observed while a kernel runs, for live streaming. */
export interface StreamEvent {
  stream: 'stdout' | 'stderr';
  chunk: string;
}

/** Options accepted by {@link import('./invoke').invokeSkill}. */
export interface InvokeOptions {
  /** Aborts the kernel (e.g. when the HTTP client disconnects). */
  signal?: AbortSignal;
  /** Extra environment variables merged into the kernel's environment. */
  env?: Record<string, string | undefined>;
  /** Invoked for each output chunk as it arrives (used for SSE streaming). */
  onData?: (event: StreamEvent) => void;
  /**
   * Max bytes to buffer from a `mode: proxy` upstream response before aborting
   * (the buffered CLI/library path; the HTTP server streams proxy instead).
   * Bounds memory the way the request-body and file-output caps do. Default
   * 100 MB.
   */
  maxOutputBytes?: number;
}
