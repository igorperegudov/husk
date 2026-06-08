import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { DOCKERIGNORE, dockerfile } from '../templates';
import { fail, parsePort } from '../util';

/**
 * The skills dir is interpolated raw into `COPY`/`CMD` lines, so a value with a
 * space, quote, or control char would emit a broken Dockerfile (COPY would read
 * it as multiple args, a quote would break the JSON-exec CMD). Restrict it to a
 * plain relative path and fail loudly otherwise.
 */
const SAFE_SKILLS_DIR = /^[A-Za-z0-9._/-]+$/;

export interface BuildOptions {
  docker?: boolean;
  port?: string;
  force?: boolean;
}

export function buildCommand(dirArg: string | undefined, opts: BuildOptions): void {
  if (!opts.docker) {
    fail('nothing to build - pass --docker to generate a Dockerfile');
  }

  const skillsDir = dirArg ?? 'skills';
  if (!SAFE_SKILLS_DIR.test(skillsDir)) {
    fail(
      `skills directory "${skillsDir}" can't be safely written into a Dockerfile; ` +
        'use a relative path of letters, digits, dots, dashes, underscores, and slashes',
    );
  }
  const port = parsePort(opts.port);
  const dockerfilePath = resolve('Dockerfile');

  if (existsSync(dockerfilePath) && !opts.force) {
    fail('Dockerfile already exists; re-run with --force to overwrite');
  }

  writeFileSync(dockerfilePath, dockerfile(skillsDir, port));

  const ignorePath = resolve('.dockerignore');
  if (!existsSync(ignorePath)) {
    writeFileSync(ignorePath, DOCKERIGNORE);
  }

  console.log(
    chalk.green('\n✓ wrote Dockerfile' + (existsSync(ignorePath) ? ' and .dockerignore' : '')),
  );
  console.log('\n  build & run:');
  console.log(`    ${chalk.cyan('docker build -t my-skills .')}`);
  console.log(`    ${chalk.cyan(`docker run -p ${port}:${port} my-skills`)}\n`);
}
