import { watch } from 'node:fs';
import {
  createFetchHandler,
  loadSkills,
  type FetchHandler,
  type Skill,
} from '@elisymlabs/husk-core';
import chalk from 'chalk';
import { fail, loadOrReport, parsePort, resolveSkillsDir } from '../util';

export interface ServeOptions {
  port?: string;
  host?: string;
  watch?: boolean;
  cors?: boolean;
  concurrency?: string;
  name?: string;
}

/** Max request body, enforced both by the handler and by Bun at the socket. */
const MAX_BODY_BYTES = 50 * 1024 * 1024;

/** Hostnames accepted when bound to loopback (anti-DNS-rebinding allowlist). */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];

/** The effective bind host and whether it is loopback. Defaults to loopback. */
function effectiveHost(opts: ServeOptions): { host: string; isLoopback: boolean } {
  const host = opts.host ?? '127.0.0.1';
  return {
    host,
    isLoopback: host === '127.0.0.1' || host === 'localhost' || host === '::1',
  };
}

/** Parse `--concurrency` strictly so a typo can't silently disable the limiter. */
function parseConcurrency(value: string | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    fail(`--concurrency must be a non-negative integer (got "${value}")`);
  }
  return n;
}

function buildHandler(
  skills: Skill[],
  opts: ServeOptions,
): { handler: FetchHandler; skills: Skill[] } {
  const { isLoopback } = effectiveHost(opts);
  const handler = createFetchHandler({
    skills,
    serviceName: opts.name,
    // CORS is OFF by default for the CLI (opt in with `--cors`): the server has
    // no auth and binds loopback, so permissive CORS would let any page the
    // operator visits read skill responses cross-origin.
    cors: opts.cors === true,
    concurrency: parseConcurrency(opts.concurrency),
    maxBodyBytes: MAX_BODY_BYTES,
    // On a loopback bind, pin the Host header so DNS rebinding can't reach us.
    allowedHosts: isLoopback ? LOOPBACK_HOSTS : undefined,
  });
  return { handler, skills };
}

function build(dir: string, opts: ServeOptions): { handler: FetchHandler; skills: Skill[] } {
  // Initial load: a bad skills dir should fail loudly and exit.
  const { skills } = loadOrReport(dir);
  return buildHandler(skills, opts);
}

function printSkills(skills: Skill[]): void {
  if (skills.length === 0) {
    console.log(chalk.yellow('  (no skills found)'));
    return;
  }
  for (const s of skills) {
    console.log(
      `  ${chalk.green(s.manifest.method.padEnd(6))} ${chalk.cyan(s.manifest.route.padEnd(28))} ${s.manifest.name}`,
    );
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(fn, ms);
  };
}

export function serveCommand(dirArg: string | undefined, opts: ServeOptions): void {
  const dir = resolveSkillsDir(dirArg);
  const port = parsePort(opts.port ?? process.env.HUSK_PORT);
  // Default to loopback: husk has no built-in auth, so exposing the server to
  // all interfaces must be an explicit, informed choice (`--host 0.0.0.0`).
  const { host, isLoopback } = effectiveHost(opts);

  let current = build(dir, opts);

  const server = Bun.serve({
    port,
    hostname: host,
    idleTimeout: 255,
    maxRequestBodySize: MAX_BODY_BYTES,
    fetch: (req) => current.handler(req),
  });

  if (!isLoopback) {
    console.log(
      chalk.yellow(
        `\n  ⚠ binding to ${host}: reachable off-host with no built-in auth - front it with a gateway or auth.`,
      ),
    );
  }

  console.log(
    chalk.bold(`\n  HUSK serving ${chalk.green(String(current.skills.length))} skill(s)`),
  );
  console.log(chalk.dim(`  from ${dir}\n`));
  printSkills(current.skills);
  console.log(`\n  ${chalk.bold('→')} ${chalk.underline(`http://localhost:${server.port}`)}\n`);

  if (opts.watch) {
    const reload = debounce(() => {
      // A transient read error during reload must NOT kill the running server,
      // so load directly here (loadOrReport would process.exit) and keep the
      // previously-served skills on failure.
      let result: ReturnType<typeof loadSkills>;
      try {
        result = loadSkills(dir);
      } catch (err) {
        console.log(
          chalk.yellow(
            `! reload skipped (skills dir unreadable): ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        return;
      }
      for (const e of result.errors) {
        console.error(chalk.yellow(`! skipped ${e.dir}: ${e.message}`));
      }
      current = buildHandler(result.skills, opts);
      console.log(chalk.cyan(`↻ reloaded ${current.skills.length} skill(s)`));
    }, 150);
    try {
      watch(dir, { recursive: true }, reload);
      console.log(chalk.dim('  watching for changes...\n'));
    } catch {
      console.log(
        chalk.yellow('  (recursive watch unsupported on this platform; --watch disabled)\n'),
      );
    }
  }
}
