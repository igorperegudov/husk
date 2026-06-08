import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeSkill } from '../src/invoke';
import { loadSkill } from '../src/loader';
import type { Skill } from '../src/types';

const dirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function makeSkill(manifest: string, files: Record<string, string> = {}): Promise<Skill> {
  const dir = await mkdtemp(join(tmpdir(), 'husk-test-'));
  dirs.push(dir);
  await writeFile(join(dir, 'SKILL.md'), manifest);
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, name);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, content);
  }
  return loadSkill(dir);
}

describe('invokeSkill', () => {
  it('pipes text input to stdin and returns stdout', async () => {
    const skill = await makeSkill(
      ['---', 'name: Upper', 'description: uppercase', 'run: ./up.sh', '---'].join('\n'),
      { 'up.sh': "#!/bin/sh\ntr 'a-z' 'A-Z'\n" },
    );
    const result = await invokeSkill(skill, { text: 'hello' });
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('HELLO');
    await result.cleanup();
  });

  it('runs a no-input static script', async () => {
    const skill = await makeSkill(
      ['---', 'name: Ping', 'description: ping', 'run: ./ping.sh', 'input: none', '---'].join('\n'),
      { 'ping.sh': '#!/bin/sh\necho pong\n' },
    );
    const result = await invokeSkill(skill, {});
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('pong');
    await result.cleanup();
  });

  it('collects a file written to HUSK_OUTPUT_FILE', async () => {
    const skill = await makeSkill(
      [
        '---',
        'name: Maker',
        'description: makes a file',
        'run: ./make.sh',
        'output: file',
        'output_mime: text/plain',
        '---',
      ].join('\n'),
      { 'make.sh': '#!/bin/sh\nprintf "file body" > "$HUSK_OUTPUT_FILE"\necho note\n' },
    );
    const result = await invokeSkill(skill, { text: 'x' });
    expect(result.ok).toBe(true);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].mime).toBe('text/plain');
    expect(result.stdout.trim()).toBe('note');
    await result.cleanup();
  });

  it('collects multiple files from HUSK_OUTPUT_DIR', async () => {
    const skill = await makeSkill(
      [
        '---',
        'name: Multi',
        'description: many files',
        'run: ./multi.sh',
        'output: file',
        '---',
      ].join('\n'),
      {
        'multi.sh':
          '#!/bin/sh\nprintf a > "$HUSK_OUTPUT_DIR/a.txt"\nprintf b > "$HUSK_OUTPUT_DIR/b.txt"\n',
      },
    );
    const result = await invokeSkill(skill, {});
    expect(result.files.map((f) => f.filename).sort()).toEqual(['a.txt', 'b.txt']);
    await result.cleanup();
  });

  it('sanitizes a path-traversal upload filename before exposing HUSK_INPUT_FILENAME', async () => {
    const skill = await makeSkill(
      ['---', 'name: Echo', 'description: echo name', 'run: ./name.sh', 'input: file', '---'].join(
        '\n',
      ),
      { 'name.sh': '#!/bin/sh\nprintf "%s" "$HUSK_INPUT_FILENAME"\n' },
    );
    const staged = join(skill.dir, 'staged-input');
    await writeFile(staged, 'data');
    const result = await invokeSkill(skill, {
      file: { path: staged, filename: '../../etc/evil' },
    });
    expect(result.ok).toBe(true);
    // Separators collapsed to `_` so a kernel can't use it to escape the workdir.
    expect(result.stdout).not.toContain('/');
    expect(result.stdout.trim()).toBe('.._.._etc_evil');
    await result.cleanup();
  });

  it('reports a non-zero exit as not ok', async () => {
    const skill = await makeSkill(
      ['---', 'name: Boom', 'description: fails', 'run: ./boom.sh', '---'].join('\n'),
      { 'boom.sh': '#!/bin/sh\necho oops >&2\nexit 3\n' },
    );
    const result = await invokeSkill(skill, { text: 'x' });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.stderr.trim()).toBe('oops');
    await result.cleanup();
  });

  it('reports a spawn failure for a missing kernel', async () => {
    const skill = await makeSkill(
      ['---', 'name: Ghost', 'description: missing', 'run: ./does-not-exist.sh', '---'].join('\n'),
    );
    const result = await invokeSkill(skill, { text: 'x' });
    expect(result.ok).toBe(false);
    expect(result.spawnError).toBeTruthy();
    await result.cleanup();
  });

  it('serves a static file', async () => {
    const skill = await makeSkill(
      ['---', 'name: Welcome', 'description: hi', 'serve: ./welcome.txt', '---'].join('\n'),
      { 'welcome.txt': 'hello from disk' },
    );
    const result = await invokeSkill(skill, {});
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('hello from disk');
    await result.cleanup();
  });

  it('refuses to serve a static file that symlinks outside the skill folder', async () => {
    // A bundled symlink (link.txt -> /outside/secret.txt) passes a lexical
    // containment check but stat/readFile follow it; resolveInside must reject
    // the escape so a static-file skill can't leak arbitrary server files.
    const outside = await mkdtemp(join(tmpdir(), 'husk-secret-'));
    dirs.push(outside);
    const secret = join(outside, 'secret.txt');
    await writeFile(secret, 'TOP SECRET');
    const skill = await makeSkill(
      ['---', 'name: Leak', 'description: leak', 'serve: ./link.txt', '---'].join('\n'),
    );
    await symlink(secret, join(skill.dir, 'link.txt'));
    await expect(invokeSkill(skill, {})).rejects.toThrow(/escapes the skill directory/);
  });

  it('invokes a mode: llm skill, using the doc body as the system prompt', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ content: [{ type: 'text', text: 'answer from llm' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const skill = await makeSkill(
      ['---', 'name: Assistant', 'description: helps', 'mode: llm', '---', 'You are helpful.'].join(
        '\n',
      ),
    );
    const result = await invokeSkill(skill, { text: 'hi' });
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('answer from llm');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.system).toBe('You are helpful.');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'hi' });
    await result.cleanup();
  });

  it('reports a clear error when an llm skill has no API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const skill = await makeSkill(
      ['---', 'name: Assistant', 'description: helps', 'mode: llm', '---', 'prompt'].join('\n'),
    );
    const result = await invokeSkill(skill, { text: 'hi' });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('ANTHROPIC_API_KEY');
    await result.cleanup();
  });
});
