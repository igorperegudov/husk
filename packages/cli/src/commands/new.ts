import { chmodSync, constants, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import chalk from 'chalk';
import { scaffoldSkill, type Lang } from '../templates';
import { fail } from '../util';

const LANGS: readonly Lang[] = ['bash', 'python', 'ts'];

export interface NewOptions {
  lang?: string;
  dir?: string;
}

export function newCommand(name: string, opts: NewOptions): void {
  const lang = (opts.lang ?? 'bash') as Lang;
  if (!LANGS.includes(lang)) {
    fail(`unknown --lang "${opts.lang}" (choose one of: ${LANGS.join(', ')})`);
  }

  const scaffold = scaffoldSkill(name, lang);
  const baseDir = resolve(opts.dir ?? 'skills');
  const skillDir = join(baseDir, scaffold.slug);

  if (existsSync(skillDir)) {
    fail(`${skillDir} already exists`);
  }
  mkdirSync(skillDir, { recursive: true });

  for (const file of scaffold.files) {
    const dest = join(skillDir, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.content);
    if (file.executable) {
      chmodSync(dest, statSync(dest).mode | constants.S_IXUSR | constants.S_IXGRP);
    }
  }

  console.log(chalk.green(`\n✓ created skill "${scaffold.slug}" (${lang}) in ${skillDir}\n`));
  console.log('  next:');
  console.log(`    ${chalk.cyan(`husk serve ${baseDir}`)}`);
  console.log(`    ${chalk.cyan(`husk call ${scaffold.slug} -i "hello" --dir ${baseDir}`)}\n`);
}
