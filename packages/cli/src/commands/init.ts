import { chmodSync, constants, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import chalk from 'chalk';
import { scaffoldSkill } from '../templates';

export interface InitOptions {
  dir?: string;
}

/** Create a `skills/` folder with a starter "hello" skill, ready to serve. */
export function initCommand(dirArg: string | undefined, opts: InitOptions): void {
  const root = resolve(dirArg ?? opts.dir ?? '.');
  const skillsDir = join(root, 'skills');
  mkdirSync(skillsDir, { recursive: true });

  const scaffold = scaffoldSkill('hello', 'bash');
  const skillDir = join(skillsDir, scaffold.slug);
  if (existsSync(skillDir)) {
    console.log(chalk.yellow(`skills/${scaffold.slug} already exists - leaving it untouched`));
  } else {
    mkdirSync(skillDir, { recursive: true });
    for (const file of scaffold.files) {
      const dest = join(skillDir, file.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, file.content);
      if (file.executable) {
        chmodSync(dest, statSync(dest).mode | constants.S_IXUSR | constants.S_IXGRP);
      }
    }
  }

  console.log(chalk.green(`\n✓ HUSK project ready in ${root}\n`));
  console.log('  next:');
  console.log(`    ${chalk.cyan('husk serve')}            # serve ./skills over HTTP`);
  console.log(`    ${chalk.cyan('husk new my-skill')}     # scaffold another skill`);
  console.log(`    ${chalk.cyan('husk list')}             # list discovered skills\n`);
}
