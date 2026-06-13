import { chmodSync, constants, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { stripControlChars } from '@elisym/husk-core';
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

  if (name !== stripControlChars(name)) {
    fail('skill name must not contain control characters or newlines');
  }

  const scaffold = scaffoldSkill(name, lang);
  if (!scaffold.slug) {
    fail('skill name must contain at least one letter or digit');
  }

  const baseDir = resolve(opts.dir ?? 'skills');
  const skillDir = join(baseDir, scaffold.slug);
  // With a non-empty slug (a-z0-9- only) this always holds; assert it so a
  // future slug change can never write into or above the skills root.
  if (!skillDir.startsWith(baseDir + sep)) {
    fail(`refusing to scaffold "${scaffold.slug}" outside ${baseDir}`);
  }

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
