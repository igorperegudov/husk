import { parseManifest } from '@elisym/husk-core';
import { describe, expect, it } from 'vitest';
import { dockerfile, scaffoldSkill, type Lang } from '../src/templates';

describe('scaffoldSkill', () => {
  const langs: Lang[] = ['bash', 'python', 'ts'];

  it.each(langs)('produces a loadable SKILL.md for %s', (lang) => {
    const scaffold = scaffoldSkill('My Cool Skill', lang);
    expect(scaffold.slug).toBe('my-cool-skill');
    const manifest = scaffold.files.find((f) => f.path === 'SKILL.md');
    expect(manifest).toBeTruthy();
    // The generated manifest must parse cleanly with the core parser.
    const parsed = parseManifest(manifest!.content, scaffold.slug);
    expect(parsed.name).toBe('My Cool Skill');
    expect(parsed.argv.length).toBeGreaterThan(0);
    expect(parsed.input).toBe('text');
    expect(parsed.output).toBe('text');
  });

  it('marks bash and ts kernels executable', () => {
    expect(scaffoldSkill('x', 'bash').files.find((f) => f.path === 'run.sh')?.executable).toBe(
      true,
    );
    expect(scaffoldSkill('x', 'ts').files.find((f) => f.path === 'run.ts')?.executable).toBe(true);
  });
});

describe('dockerfile', () => {
  it('references the skills dir, the port, and the husk serve command', () => {
    const out = dockerfile('skills', 8080);
    expect(out).toContain('FROM oven/bun:1');
    expect(out).toContain('EXPOSE 8080');
    expect(out).toContain('husk", "serve", "skills"');
  });
});
