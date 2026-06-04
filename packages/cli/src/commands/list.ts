import { toCard } from '@elisymlabs/husk-core';
import chalk from 'chalk';
import { loadOrReport, resolveSkillsDir } from '../util';

export interface ListOptions {
  json?: boolean;
}

export function listCommand(dirArg: string | undefined, opts: ListOptions): void {
  const dir = resolveSkillsDir(dirArg);
  const { skills } = loadOrReport(dir);

  if (opts.json) {
    console.log(JSON.stringify(skills.map(toCard), null, 2));
    return;
  }

  if (skills.length === 0) {
    console.log(chalk.yellow(`no skills found in ${dir}`));
    return;
  }

  console.log(chalk.bold(`\n${skills.length} skill(s) in ${dir}\n`));
  for (const s of skills) {
    console.log(
      `  ${chalk.green(s.manifest.method.padEnd(6))} ${chalk.cyan(s.manifest.route.padEnd(28))} ${chalk.bold(s.manifest.name)}`,
    );
    console.log(
      `         ${chalk.dim(`${s.manifest.input} → ${s.manifest.output}  ·  ${s.manifest.description}`)}`,
    );
  }
  console.log('');
}
