import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSkills } from '../src/loader';
import { createFetchHandler, type FetchHandler } from '../src/server';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function buildHandler(): Promise<FetchHandler> {
  const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
  roots.push(root);

  const upper = join(root, 'upper');
  await mkdir(upper, { recursive: true });
  await writeFile(
    join(upper, 'SKILL.md'),
    ['---', 'name: Upper', 'description: uppercase text', 'run: ./up.sh', '---'].join('\n'),
  );
  await writeFile(join(upper, 'up.sh'), "#!/bin/sh\ntr 'a-z' 'A-Z'\n");

  const png = join(root, 'maker');
  await mkdir(png, { recursive: true });
  await writeFile(
    join(png, 'SKILL.md'),
    [
      '---',
      'name: Maker',
      'description: makes a file',
      'run: ./make.sh',
      'input: none',
      'output: file',
      'output_mime: text/plain',
      '---',
    ].join('\n'),
  );
  await writeFile(join(png, 'make.sh'), '#!/bin/sh\nprintf "made-it" > "$HUSK_OUTPUT_FILE"\n');

  const { skills, errors } = loadSkills(root);
  expect(errors).toEqual([]);
  expect(skills).toHaveLength(2);
  return createFetchHandler({ skills, serviceName: 'Test', version: '9.9.9' });
}

describe('createFetchHandler', () => {
  it('serves health, listing, cards and the index', async () => {
    const handler = await buildHandler();

    const health = await handler(new Request('http://h/healthz'));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', skills: 2 });

    const list = await handler(new Request('http://h/skills'));
    const cards = (await list.json()) as Array<{ slug: string }>;
    expect(cards.map((c) => c.slug).sort()).toEqual(['maker', 'upper']);

    const card = await handler(new Request('http://h/skills/upper'));
    expect((await card.json()).name).toBe('Upper');

    const index = await handler(new Request('http://h/'));
    expect(index.headers.get('content-type')).toContain('text/html');

    const spec = await handler(new Request('http://h/openapi.json'));
    const doc = (await spec.json()) as { paths: Record<string, unknown> };
    expect(doc.paths['/skills/upper']).toBeTruthy();
  });

  it('invokes a text skill via POST', async () => {
    const handler = await buildHandler();
    const res = await handler(
      new Request('http://h/skills/upper', { method: 'POST', body: 'hello' }),
    );
    expect(res.status).toBe(200);
    expect((await res.text()).trim()).toBe('HELLO');
    // Every response disables MIME sniffing so reflected output can't be sniffed
    // into active content.
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('accepts JSON { input } bodies', async () => {
    const handler = await buildHandler();
    const res = await handler(
      new Request('http://h/skills/upper', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: 'hey' }),
      }),
    );
    expect((await res.text()).trim()).toBe('HEY');
  });

  it('returns a file output with its mime type', async () => {
    const handler = await buildHandler();
    const res = await handler(new Request('http://h/skills/maker', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('made-it');
  });

  it('forces a download for renderable kernel file output (HTML)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
    roots.push(root);
    const page = join(root, 'page');
    await mkdir(page, { recursive: true });
    await writeFile(
      join(page, 'SKILL.md'),
      [
        '---',
        'name: Page',
        'description: d',
        'run: ./p.sh',
        'input: none',
        'output: file',
        'output_mime: text/html',
        '---',
      ].join('\n'),
    );
    await writeFile(join(page, 'p.sh'), '#!/bin/sh\nprintf "<h1>hi</h1>" > "$HUSK_OUTPUT_FILE"\n');
    const { skills } = loadSkills(root);
    const handler = createFetchHandler({ skills });
    const res = await handler(new Request('http://h/skills/page', { method: 'POST' }));
    expect(res.headers.get('content-type')).toContain('text/html');
    // Reflected HTML from a kernel must download, not render inline, in our origin.
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('serves operator-authored static-file HTML inline (trusted)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
    roots.push(root);
    const home = join(root, 'home');
    await mkdir(home, { recursive: true });
    await writeFile(
      join(home, 'SKILL.md'),
      ['---', 'name: Home', 'description: d', 'serve: ./index.html', 'output: file', '---'].join(
        '\n',
      ),
    );
    await writeFile(join(home, 'index.html'), '<h1>welcome</h1>');
    const { skills } = loadSkills(root);
    const handler = createFetchHandler({ skills });
    const res = await handler(new Request('http://h/skills/home', { method: 'POST' }));
    expect(res.headers.get('content-type')).toContain('text/html');
    // static-file content is operator-authored and input-independent, so inline.
    expect(res.headers.get('content-disposition')).toContain('inline');
  });

  it('rejects kernel file output larger than maxOutputBytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
    roots.push(root);
    const maker = join(root, 'maker');
    await mkdir(maker, { recursive: true });
    await writeFile(
      join(maker, 'SKILL.md'),
      [
        '---',
        'name: Maker',
        'description: makes a big file',
        'run: ./make.sh',
        'input: none',
        'output: file',
        '---',
      ].join('\n'),
    );
    // Writes 10 bytes; the 4-byte cap must reject it with 413 rather than buffer.
    await writeFile(
      join(maker, 'make.sh'),
      '#!/bin/sh\nprintf "0123456789" > "$HUSK_OUTPUT_FILE"\n',
    );
    const { skills } = loadSkills(root);
    const handler = createFetchHandler({ skills, maxOutputBytes: 4 });
    const res = await handler(new Request('http://h/skills/maker', { method: 'POST' }));
    expect(res.status).toBe(413);
  });

  it('stages a multipart upload named ".." without an EISDIR 500', async () => {
    const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
    roots.push(root);
    const cat = join(root, 'cat');
    await mkdir(cat, { recursive: true });
    await writeFile(
      join(cat, 'SKILL.md'),
      [
        '---',
        'name: Cat',
        'description: echo the file',
        'run: ./cat.sh',
        'input: file',
        '---',
      ].join('\n'),
    );
    await writeFile(join(cat, 'cat.sh'), '#!/bin/sh\ncat "$HUSK_INPUT_FILE"\n');
    const { skills } = loadSkills(root);
    const handler = createFetchHandler({ skills });

    // A filename of `..` has no separators to strip; it must be coerced to a safe
    // segment, not joined as `tmp/..` (which made writeFile throw EISDIR -> 500).
    const form = new FormData();
    form.append('file', new File(['hello bytes'], '..', { type: 'text/plain' }));
    const res = await handler(new Request('http://h/skills/cat', { method: 'POST', body: form }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello bytes');
  });

  it('rejects a skill whose explicit route shadows another skill card route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
    roots.push(root);
    // Skill A (folder `alpha`) gets the canonical card route /skills/alpha.
    const a = join(root, 'alpha');
    await mkdir(a, { recursive: true });
    await writeFile(
      join(a, 'SKILL.md'),
      ['---', 'name: Alpha', 'description: d', 'run: ./a.sh', 'input: none', '---'].join('\n'),
    );
    await writeFile(join(a, 'a.sh'), '#!/bin/sh\necho a\n');
    // Skill B declares an explicit GET route that shadows A's card path: a
    // cross-method overwrite the method+route dedup alone would have missed.
    const b = join(root, 'beta');
    await mkdir(b, { recursive: true });
    await writeFile(
      join(b, 'SKILL.md'),
      [
        '---',
        'name: Beta',
        'description: d',
        'run: ./b.sh',
        'input: none',
        'method: GET',
        'route: /skills/alpha',
        '---',
      ].join('\n'),
    );
    await writeFile(join(b, 'b.sh'), '#!/bin/sh\necho b\n');

    const { skills, errors } = loadSkills(root);
    expect(skills).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/already defined/);
  });

  it('streams output as SSE when asked', async () => {
    const handler = await buildHandler();
    const res = await handler(
      new Request('http://h/skills/upper?stream=1', { method: 'POST', body: 'hi' }),
    );
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    expect(body).toContain('event: stdout');
    expect(body).toContain('HI');
    expect(body).toContain('event: done');
  });

  it('truncates an SSE stream that exceeds maxStreamBytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
    roots.push(root);
    const spew = join(root, 'spew');
    await mkdir(spew, { recursive: true });
    await writeFile(
      join(spew, 'SKILL.md'),
      ['---', 'name: Spew', 'description: d', 'run: ./spew.sh', 'input: none', '---'].join('\n'),
    );
    // Emits ~100 bytes in one chunk; with a 50-byte stream cap the first frame
    // already exceeds it, so the stream must truncate instead of buffering on.
    await writeFile(
      join(spew, 'spew.sh'),
      "#!/bin/sh\nprintf '%s' 0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789\n",
    );
    const { skills } = loadSkills(root);
    const handler = createFetchHandler({ skills, maxStreamBytes: 50 });
    const res = await handler(new Request('http://h/skills/spew?stream=1', { method: 'POST' }));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    expect(body).toContain('stream limit');
  });

  it('keeps the structured multipart schema when input_mime is multipart/form-data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
    roots.push(root);
    const up = join(root, 'uploader');
    await mkdir(up, { recursive: true });
    await writeFile(
      join(up, 'SKILL.md'),
      [
        '---',
        'name: Uploader',
        'description: d',
        'run: ./u.sh',
        'input_mime: multipart/form-data',
        '---',
      ].join('\n'),
    );
    await writeFile(join(up, 'u.sh'), '#!/bin/sh\ncat\n');
    const { skills } = loadSkills(root);
    const handler = createFetchHandler({ skills });
    const res = await handler(new Request('http://h/openapi.json'));
    const doc = (await res.json()) as {
      paths: Record<
        string,
        {
          post: {
            requestBody: {
              content: Record<string, { schema: { properties?: Record<string, unknown> } }>;
            };
          };
        }
      >;
    };
    // The duplicate-key bug overwrote this structured schema with a raw binary
    // one; the documented file/text fields must survive.
    const content = doc.paths['/skills/uploader'].post.requestBody.content;
    expect(content['multipart/form-data'].schema.properties?.file).toBeTruthy();
    expect(content['multipart/form-data'].schema.properties?.text).toBeTruthy();
  });

  it('404s unknown paths and 405s wrong methods', async () => {
    const handler = await buildHandler();
    expect((await handler(new Request('http://h/nope'))).status).toBe(404);
    const wrong = await handler(new Request('http://h/skills', { method: 'DELETE' }));
    expect(wrong.status).toBe(405);
  });

  it('redacts provider API keys from kernel stderr in error responses', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-secret-value-123456';
    try {
      const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
      roots.push(root);
      const leak = join(root, 'leak');
      await mkdir(leak, { recursive: true });
      await writeFile(
        join(leak, 'SKILL.md'),
        ['---', 'name: Leak', 'description: d', 'run: ./leak.sh', 'input: none', '---'].join('\n'),
      );
      // The kernel prints the provider key to stderr and fails - a verbose error
      // path. The HTTP error body must not carry the raw key.
      await writeFile(
        join(leak, 'leak.sh'),
        '#!/bin/sh\necho "key=$ANTHROPIC_API_KEY" >&2\nexit 1\n',
      );
      const { skills } = loadSkills(root);
      const handler = createFetchHandler({ skills });
      const res = await handler(new Request('http://h/skills/leak', { method: 'POST' }));
      expect(res.status).toBe(500);
      const bodyText = await res.text();
      expect(bodyText).not.toContain('sk-secret-value-123456');
      expect(bodyText).toContain('[redacted]');
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('redacts provider API keys from streamed (SSE) stderr', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-stream-secret-7890';
    try {
      const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
      roots.push(root);
      const s = join(root, 'leaks');
      await mkdir(s, { recursive: true });
      await writeFile(
        join(s, 'SKILL.md'),
        ['---', 'name: Leaks', 'description: d', 'run: ./l.sh', 'input: none', '---'].join('\n'),
      );
      await writeFile(join(s, 'l.sh'), '#!/bin/sh\necho "leak=$ANTHROPIC_API_KEY" >&2\necho ok\n');
      const { skills } = loadSkills(root);
      const handler = createFetchHandler({ skills });
      const res = await handler(new Request('http://h/skills/leaks?stream=1', { method: 'POST' }));
      const body = await res.text();
      expect(body).not.toContain('sk-stream-secret-7890');
      expect(body).toContain('[redacted]');
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('redacts a provider key split across two SSE stderr chunks', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-stream-secret-7890';
    try {
      const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
      roots.push(root);
      const s = join(root, 'split');
      await mkdir(s, { recursive: true });
      await writeFile(
        join(s, 'SKILL.md'),
        ['---', 'name: Split', 'description: d', 'run: ./s.sh', 'input: none', '---'].join('\n'),
      );
      // The key arrives in two stderr writes across a pause: 'sk-stream-sec' +
      // 'ret-7890' = the full key. Per-chunk scrubbing would leak the first half;
      // the carry buffer must catch it when the chunks rejoin.
      await writeFile(
        join(s, 's.sh'),
        '#!/bin/sh\nprintf "leak=sk-stream-sec" >&2\nsleep 0.1\nprintf "ret-7890" >&2\necho ok\n',
      );
      const { skills } = loadSkills(root);
      const handler = createFetchHandler({ skills });
      const res = await handler(new Request('http://h/skills/split?stream=1', { method: 'POST' }));
      const body = await res.text();
      expect(body).not.toContain('sk-stream-sec');
      expect(body).toContain('[redacted]');
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('enforces auth when provided', async () => {
    const root = await mkdtemp(join(tmpdir(), 'husk-skills-'));
    roots.push(root);
    const s = join(root, 'ping');
    await mkdir(s, { recursive: true });
    await writeFile(
      join(s, 'SKILL.md'),
      ['---', 'name: Ping', 'description: d', 'run: ./p.sh', 'input: none', '---'].join('\n'),
    );
    await writeFile(join(s, 'p.sh'), '#!/bin/sh\necho pong\n');
    const { skills } = loadSkills(root);
    const handler = createFetchHandler({
      skills,
      auth: (req) => req.headers.get('authorization') === 'Bearer secret',
    });

    expect((await handler(new Request('http://h/healthz'))).status).toBe(401);
    const ok = await handler(
      new Request('http://h/healthz', { headers: { authorization: 'Bearer secret' } }),
    );
    expect(ok.status).toBe(200);
  });
});
