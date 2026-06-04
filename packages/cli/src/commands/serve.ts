import { watch } from 'node:fs';
import { createFetchHandler, type FetchHandler, type Skill } from '@elisymlabs/husk-core';
import chalk from 'chalk';
import { loadOrReport, resolveSkillsDir } from '../util';

export interface ServeOptions {
  port?: string;
  host?: string;
  watch?: boolean;
  cors?: boolean;
  concurrency?: string;
  name?: string;
}

function build(dir: string, opts: ServeOptions): { handler: FetchHandler; skills: Skill[] } {
  const { skills } = loadOrReport(dir);
  const handler = createFetchHandler({
    skills,
    serviceName: opts.name,
    cors: opts.cors !== false,
    concurrency: Number(opts.concurrency ?? 0),
  });
  return { handler, skills };
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
  const port = Number(opts.port ?? process.env.HUSK_PORT ?? 3000);
  const host = opts.host ?? '0.0.0.0';

  let current = build(dir, opts);

  const server = Bun.serve({
    port,
    hostname: host,
    idleTimeout: 255,
    fetch: (req) => current.handler(req),
  });

  console.log(
    chalk.bold(`\n  HUSK serving ${chalk.green(String(current.skills.length))} skill(s)`),
  );
  console.log(chalk.dim(`  from ${dir}\n`));
  printSkills(current.skills);
  console.log(`\n  ${chalk.bold('→')} ${chalk.underline(`http://localhost:${server.port}`)}\n`);

  if (opts.watch) {
    const reload = debounce(() => {
      current = build(dir, opts);
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
