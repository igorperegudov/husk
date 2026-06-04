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

  it('404s unknown paths and 405s wrong methods', async () => {
    const handler = await buildHandler();
    expect((await handler(new Request('http://h/nope'))).status).toBe(404);
    const wrong = await handler(new Request('http://h/skills', { method: 'DELETE' }));
    expect(wrong.status).toBe(405);
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
