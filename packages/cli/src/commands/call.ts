import { readFileSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { text as streamToText } from 'node:stream/consumers';
import {
  invokeSkill,
  kernelErrorMessage,
  toSlug,
  type InvokeInput,
  type Skill,
} from '@elisym/husk-core';
import chalk from 'chalk';
import { fail, loadOrReport, resolveSkillsDir } from '../util';

export interface CallOptions {
  input?: string;
  file?: string;
  dir?: string;
  out?: string;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  return streamToText(process.stdin);
}

/** Resolve the `-i/--input` value: `-` is stdin, `@file` reads a file, else literal. */
async function resolveText(input: string | undefined): Promise<string | undefined> {
  if (input === undefined) {
    return undefined;
  }
  if (input === '-') {
    return readStdin();
  }
  if (input.startsWith('@')) {
    return readFileSync(input.slice(1), 'utf-8');
  }
  return input;
}

export async function callCommand(name: string, opts: CallOptions): Promise<void> {
  const dir = resolveSkillsDir(opts.dir);
  const { skills } = loadOrReport(dir);
  const slug = toSlug(name);
  const skill: Skill | undefined = skills.find((s) => s.slug === slug || s.slug === name);
  if (!skill) {
    fail(
      `no skill named "${name}" in ${dir} (have: ${skills.map((s) => s.slug).join(', ') || 'none'})`,
    );
  }

  const input: InvokeInput = {};
  if (skill.manifest.input === 'file') {
    if (!opts.file) {
      fail(`skill "${skill.slug}" needs a file input; pass --file <path>`);
    }
    input.file = { path: resolve(opts.file), filename: basename(opts.file) };
    input.text = await resolveText(opts.input);
  } else if (skill.manifest.input === 'text') {
    input.text = (await resolveText(opts.input)) ?? (await readStdin());
  }

  const result = await invokeSkill(skill, input);
  // Capture failure rather than exiting inside the try: `fail()` calls
  // process.exit, which would skip the `finally` and leak the temp output dir.
  let failMessage: string | undefined;
  try {
    if (!result.ok) {
      process.stderr.write(result.stderr);
      failMessage = kernelErrorMessage(result);
    } else if (result.outputKind === 'file') {
      const outDir = opts.out ? resolve(opts.out) : process.cwd();
      const written: string[] = [];
      for (const file of result.files) {
        const dest = join(outDir, file.filename);
        await copyFile(file.path, dest);
        written.push(dest);
      }
      if (result.stdout.trim()) {
        process.stderr.write(`${chalk.dim(result.stdout.trim())}\n`);
      }
      process.stderr.write(chalk.green(`wrote ${written.length} file(s):\n`));
      for (const w of written) {
        process.stderr.write(`  ${w}\n`);
      }
    } else {
      process.stdout.write(result.stdout);
    }
  } finally {
    await result.cleanup();
  }
  if (failMessage) {
    fail(failMessage);
  }
}
