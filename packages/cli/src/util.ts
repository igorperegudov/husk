import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSkills, type LoadResult } from '@elisymlabs/husk-core';
import chalk from 'chalk';

/** Resolve the skills directory: an explicit arg, else `./skills`, else `.`. */
export function resolveSkillsDir(arg?: string): string {
  if (arg) {
    return resolve(arg);
  }
  if (existsSync(resolve('skills'))) {
    return resolve('skills');
  }
  return resolve('.');
}

/** Load skills, printing a warning for each skipped folder. */
export function loadOrReport(dir: string): LoadResult {
  let result: LoadResult;
  try {
    result = loadSkills(dir);
  } catch (err) {
    console.error(chalk.red(`error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
  for (const e of result.errors) {
    console.error(chalk.yellow(`! skipped ${e.dir}: ${e.message}`));
  }
  return result;
}

export function fail(message: string): never {
  console.error(chalk.red(`error: ${message}`));
  process.exit(1);
}
