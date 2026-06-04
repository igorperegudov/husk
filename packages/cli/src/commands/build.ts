import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { DOCKERIGNORE, dockerfile } from '../templates';
import { fail } from '../util';

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
  const port = Number(opts.port ?? 3000);
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
