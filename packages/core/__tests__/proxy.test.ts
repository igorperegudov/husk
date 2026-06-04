import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeSkill } from '../src/invoke';
import { loadSkill, loadSkills } from '../src/loader';
import { ManifestError, parseManifest } from '../src/manifest';
import { ProxyError, proxyRequest } from '../src/proxy';
import { createFetchHandler } from '../src/server';
import type { ProxySpec } from '../src/types';

const dirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.UPSTREAM_KEY;
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function manifest(lines: string[]): string {
  return ['---', ...lines, '---'].join('\n');
}

function textResponse(body: string, status: number, type = 'text/plain'): Response {
  return new Response(body, { status, headers: { 'content-type': type } });
}

describe('parseManifest (proxy)', () => {
  it('parses mode: proxy with headers and forward_headers', () => {
    const m = parseManifest(
      manifest([
        'name: Claude Proxy',
        'description: proxy to anthropic',
        'mode: proxy',
        'proxy: https://api.anthropic.com/v1/messages',
        'headers:',
        '  x-api-key: ${ANTHROPIC_API_KEY}',
        "  anthropic-version: '2023-06-01'",
        'forward_headers:',
        '  - Accept',
      ]),
      'claude-proxy',
    );
    expect(m.mode).toBe('proxy');
    expect(m.proxy?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(m.proxy?.headers['x-api-key']).toBe('${ANTHROPIC_API_KEY}');
    expect(m.proxy?.forwardHeaders).toEqual(['accept']);
  });

  it('infers proxy mode from a `proxy:` url with no explicit mode', () => {
    const m = parseManifest(
      manifest(['name: P', 'description: d', 'proxy: https://example.com/api']),
      'p',
    );
    expect(m.mode).toBe('proxy');
  });

  it('rejects a non-http proxy url', () => {
    expect(() =>
      parseManifest(manifest(['name: P', 'description: d', 'proxy: ftp://x']), 'p'),
    ).toThrow(ManifestError);
  });
});

describe('proxyRequest', () => {
  const spec: ProxySpec = {
    url: 'https://up.example/v1',
    headers: { 'x-api-key': '${UPSTREAM_KEY}' },
    forwardHeaders: ['accept'],
  };

  it('forwards method/body, interpolates env headers, appends query, passes upstream through', async () => {
    process.env.UPSTREAM_KEY = 'secret123';
    const fetchMock = vi.fn(async () => textResponse('upstream body', 200));
    vi.stubGlobal('fetch', fetchMock);

    const res = await proxyRequest(spec, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/plain' },
      body: '{"x":1}',
      query: '?a=b',
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('upstream body');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://up.example/v1?a=b');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"x":1}');
    const h = init.headers as Headers;
    expect(h.get('x-api-key')).toBe('secret123'); // injected from env
    expect(h.get('accept')).toBe('text/plain'); // forwarded (whitelisted)
    expect(h.get('content-type')).toBe('application/json'); // passed through
  });

  it('throws ProxyError when a header env var is missing', async () => {
    delete process.env.UPSTREAM_KEY;
    vi.stubGlobal('fetch', vi.fn());
    await expect(proxyRequest(spec, { method: 'POST', headers: {}, body: 'x' })).rejects.toThrow(
      ProxyError,
    );
  });

  it('throws ProxyError when the upstream fetch fails', async () => {
    process.env.UPSTREAM_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    await expect(proxyRequest(spec, { method: 'POST', headers: {}, body: 'x' })).rejects.toThrow(
      /upstream request/,
    );
  });
});

describe('invokeSkill (proxy, buffered)', () => {
  async function makeProxySkill(lines: string[]): Promise<ReturnType<typeof loadSkill>> {
    const dir = await mkdtemp(join(tmpdir(), 'husk-proxy-'));
    dirs.push(dir);
    await writeFile(join(dir, 'SKILL.md'), manifest(lines));
    return loadSkill(dir);
  }

  it('buffers a text upstream response into stdout', async () => {
    process.env.UPSTREAM_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('hello upstream', 200)),
    );
    const skill = await makeProxySkill([
      'name: P',
      'description: d',
      'proxy: https://up/x',
      'headers:',
      '  x-api-key: ${UPSTREAM_KEY}',
    ]);
    const result = await invokeSkill(skill, { text: 'hi' });
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('hello upstream');
    await result.cleanup();
  });

  it('marks a non-2xx upstream as not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('nope', 404)),
    );
    const skill = await makeProxySkill(['name: P', 'description: d', 'proxy: https://up/x']);
    const result = await invokeSkill(skill, { text: 'hi' });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('404');
    await result.cleanup();
  });
});

describe('createFetchHandler (proxy)', () => {
  it('passes the upstream response through and adds CORS + the injected header', async () => {
    process.env.UPSTREAM_KEY = 'secret';
    const fetchMock = vi.fn(async () => textResponse('PONG', 201));
    vi.stubGlobal('fetch', fetchMock);

    const root = await mkdtemp(join(tmpdir(), 'husk-proxy-root-'));
    dirs.push(root);
    const skillDir = join(root, 'ping');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      manifest([
        'name: Ping',
        'description: d',
        'proxy: https://up/ping',
        'headers:',
        '  x-api-key: ${UPSTREAM_KEY}',
      ]),
    );

    const { skills } = loadSkills(root);
    const handler = createFetchHandler({ skills });
    const res = await handler(
      new Request('http://h/skills/ping', { method: 'POST', body: 'ping' }),
    );

    expect(res.status).toBe(201);
    expect(await res.text()).toBe('PONG');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get('x-api-key')).toBe('secret');
  });
});
