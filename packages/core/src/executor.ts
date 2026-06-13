import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { StreamEvent } from './types';

/** Default cap on captured stdout/stderr (5 MB). */
export const MAX_PROCESS_OUTPUT = 5_000_000;
/** Default hard timeout for a kernel process (60 s). */
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface RunOptions {
  /** Working directory for the child (always the skill folder). */
  cwd: string;
  /**
   * UTF-8 string written to the child's stdin, then stdin is closed. When
   * undefined, stdin is closed immediately (EOF) so a kernel that reads stdin
   * does not block until `timeoutMs`.
   */
  stdin?: string;
  /** Cancels the run. SIGKILL is sent on abort. */
  signal?: AbortSignal;
  /** Hard timeout in ms. Default {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Cap on captured stdout/stderr. Default {@link MAX_PROCESS_OUTPUT}. */
  maxOutput?: number;
  /** Full environment for the child. Caller spreads `process.env` as needed. */
  env?: NodeJS.ProcessEnv;
  /** Invoked for each output chunk as it arrives (used for SSE streaming). */
  onData?: (event: StreamEvent) => void;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  /** Null when the process was killed by signal before exiting. */
  code: number | null;
  /** True when the process was killed by the timeout. */
  timedOut: boolean;
  /** Set when spawn itself failed (ENOENT, EACCES, ...). */
  spawnError?: Error;
}

/**
 * Spawn `cmd` with `args` and capture stdout/stderr. Never uses `shell: true`,
 * so shell metacharacters in arguments are inert. The caller is responsible for
 * interpreting `code` / `spawnError`.
 *
 * Hardening: a hard timeout that SIGKILLs,
 * a bounded output buffer, a UTF-8 decoder that survives chunk boundaries, and
 * deterministic stdin closing so kernels never hang waiting for input.
 */
export function runProcess(cmd: string, args: string[], opts: RunOptions): Promise<RunResult> {
  return new Promise((resolveResult) => {
    const maxOutput = opts.maxOutput ?? MAX_PROCESS_OUTPUT;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let timedOut = false;
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      signal: opts.signal,
      env: opts.env,
    });

    let stdout = '';
    let stderr = '';
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');

    child.stdout?.on('data', (data: Buffer) => {
      const text = stdoutDecoder.write(data);
      if (opts.onData && text.length > 0) {
        opts.onData({ stream: 'stdout', chunk: text });
      }
      if (stdout.length < maxOutput) {
        stdout += text;
        if (stdout.length > maxOutput) {
          stdout = stdout.slice(0, maxOutput);
        }
      }
    });
    child.stderr?.on('data', (data: Buffer) => {
      const text = stderrDecoder.write(data);
      if (opts.onData && text.length > 0) {
        opts.onData({ stream: 'stderr', chunk: text });
      }
      if (stderr.length < maxOutput) {
        stderr += text;
        if (stderr.length > maxOutput) {
          stderr = stderr.slice(0, maxOutput);
        }
      }
    });

    child.on('close', (code, signal) => {
      // Flush any bytes the decoder buffered because a multi-byte UTF-8
      // codepoint straddled the final chunk boundary.
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      // `timeout` from spawn kills with the configured signal and no exit code.
      timedOut = timedOut || (code === null && signal === 'SIGKILL');
      resolveResult({ stdout, stderr, code, timedOut, spawnError: undefined });
    });

    child.on('error', (err: Error) => {
      // A timeout surfaces here on some platforms as an AbortError-like signal.
      resolveResult({ stdout, stderr, code: null, timedOut, spawnError: err });
    });

    if (child.stdin) {
      child.stdin.on('error', () => {
        // Ignore EPIPE - the child may exit without consuming all input.
      });
      // Always close stdin: a child that reads stdin would otherwise block
      // until `timeoutMs` even when there is no input to send.
      child.stdin.end(opts.stdin ?? '');
    }
  });
}
