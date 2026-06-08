import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildToolArgs, LlmError, resolveLlm, runLlm } from '../src/llm';
import type { LlmSpec, SkillTool } from '../src/types';

const dirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HUSK_TEST_UPSTREAM_TOKEN;
  delete process.env.HUSK_TEST_OPTED;
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('buildToolArgs', () => {
  const tool: SkillTool = {
    name: 'check',
    description: 'd',
    command: ['python3', 'check.py'],
    parameters: [
      { name: 'url', description: '', required: true },
      { name: 'depth', description: '', required: false },
    ],
  };

  it('maps the first required param positionally and the rest as flags', () => {
    expect(buildToolArgs(tool, { url: 'example.com', depth: '2' })).toEqual({
      cmd: 'python3',
      argv: ['check.py', 'example.com', '--depth', '2'],
    });
  });

  it('omits parameters the model did not supply', () => {
    expect(buildToolArgs(tool, { url: 'example.com' })).toEqual({
      cmd: 'python3',
      argv: ['check.py', 'example.com'],
    });
  });

  it('rejects an argument that begins with a dash (injection guard)', () => {
    const result = buildToolArgs(tool, { url: '-rf' });
    expect('error' in result).toBe(true);
  });

  it('does not crash on non-object args (e.g. a model returning "null")', () => {
    // A non-compliant OpenAI-compatible endpoint can yield arguments that parse
    // to null; buildToolArgs must treat that as "no args", not index into null.
    expect(buildToolArgs(tool, null as unknown as Record<string, unknown>)).toEqual({
      cmd: 'python3',
      argv: ['check.py'],
    });
  });
});

describe('resolveLlm', () => {
  const spec: LlmSpec = { provider: 'anthropic', maxTokens: 16, maxToolRounds: 1, tools: [] };

  it('throws when the API key is missing', () => {
    expect(() => resolveLlm(spec, {})).toThrow(LlmError);
  });

  it('throws on an unknown provider', () => {
    expect(() => resolveLlm({ ...spec, provider: 'nope' }, { ANTHROPIC_API_KEY: 'k' })).toThrow(
      /unknown LLM provider/,
    );
  });

  it('defaults the model per provider', () => {
    const cfg = resolveLlm(spec, { ANTHROPIC_API_KEY: 'k' });
    expect(cfg.model).toContain('claude');
    expect(cfg.kind).toBe('anthropic');
  });
});

describe('runLlm', () => {
  it('returns text directly for a tool-less skill', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () =>
      jsonResponse({ content: [{ type: 'text', text: 'hi there' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const spec: LlmSpec = { provider: 'anthropic', maxTokens: 64, maxToolRounds: 5, tools: [] };
    const text = await runLlm({
      spec,
      systemPrompt: 'be brief',
      userInput: 'hello',
      skillDir: '/tmp',
      toolTimeoutMs: 5000,
    });
    expect(text).toBe('hi there');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('runs the tool loop: tool_use -> run tool -> feed result -> final text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const dir = await mkdtemp(join(tmpdir(), 'husk-llm-'));
    dirs.push(dir);
    await writeFile(join(dir, 'echo-tool.sh'), '#!/bin/sh\necho "TOOL:$1"\n');
    await chmod(join(dir, 'echo-tool.sh'), 0o755);

    const responses = [
      jsonResponse({
        content: [{ type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'hello' } }],
      }),
      jsonResponse({ content: [{ type: 'text', text: 'final answer' }] }),
    ];
    const fetchMock = vi.fn(async () => responses.shift() as Response);
    vi.stubGlobal('fetch', fetchMock);

    const spec: LlmSpec = {
      provider: 'anthropic',
      maxTokens: 64,
      maxToolRounds: 5,
      tools: [
        {
          name: 'lookup',
          description: 'look it up',
          command: ['./echo-tool.sh'],
          parameters: [{ name: 'q', description: 'query', required: true }],
        },
      ],
    };

    const text = await runLlm({
      spec,
      systemPrompt: 'use the tool',
      userInput: 'find hello',
      skillDir: dir,
      toolTimeoutMs: 5000,
    });

    expect(text).toBe('final answer');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The second request must carry the tool's stdout back as a tool_result.
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const resultMsg = secondBody.messages.find(
      (m: { content?: unknown }) =>
        Array.isArray(m.content) && m.content[0]?.type === 'tool_result',
    );
    expect(resultMsg.content[0].content).toBe('TOOL:hello');
  });

  it('scopes the tool env to an allowlist: secrets hidden, opted-in vars visible', async () => {
    process.env.ANTHROPIC_API_KEY = 'provider-secret';
    process.env.HUSK_TEST_UPSTREAM_TOKEN = 'proxy-secret';
    process.env.HUSK_TEST_OPTED = 'opted-value';
    const dir = await mkdtemp(join(tmpdir(), 'husk-llm-'));
    dirs.push(dir);
    // The tool echoes three env vars: a provider key, a non-provider secret, and
    // an explicitly opted-in var. Only the opted-in one should be readable.
    await writeFile(
      join(dir, 'leak.sh'),
      '#!/bin/sh\necho "KEY=${ANTHROPIC_API_KEY:-none} TOK=${HUSK_TEST_UPSTREAM_TOKEN:-none} OPT=${HUSK_TEST_OPTED:-none}"\n',
    );
    await chmod(join(dir, 'leak.sh'), 0o755);

    const responses = [
      jsonResponse({ content: [{ type: 'tool_use', id: 't1', name: 'leak', input: {} }] }),
      jsonResponse({ content: [{ type: 'text', text: 'done' }] }),
    ];
    const fetchMock = vi.fn(async () => responses.shift() as Response);
    vi.stubGlobal('fetch', fetchMock);

    const spec: LlmSpec = {
      provider: 'anthropic',
      maxTokens: 64,
      maxToolRounds: 5,
      tools: [{ name: 'leak', description: 'd', command: ['./leak.sh'], parameters: [] }],
      toolEnv: ['HUSK_TEST_OPTED'],
    };

    await runLlm({
      spec,
      systemPrompt: 'use the tool',
      userInput: 'go',
      skillDir: dir,
      toolTimeoutMs: 5000,
    });

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const resultMsg = secondBody.messages.find(
      (m: { content?: unknown }) =>
        Array.isArray(m.content) && m.content[0]?.type === 'tool_result',
    );
    const toolOutput = resultMsg.content[0].content as string;
    expect(toolOutput).toContain('KEY=none');
    expect(toolOutput).toContain('TOK=none');
    expect(toolOutput).toContain('OPT=opted-value');

    delete process.env.HUSK_TEST_UPSTREAM_TOKEN;
    delete process.env.HUSK_TEST_OPTED;
  });

  it('throws when the round limit is exceeded', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const dir = await mkdtemp(join(tmpdir(), 'husk-llm-'));
    dirs.push(dir);
    await writeFile(join(dir, 't.sh'), '#!/bin/sh\necho ok\n');
    await chmod(join(dir, 't.sh'), 0o755);

    // Always ask for a tool, never produce text.
    const fetchMock = vi.fn(async () =>
      jsonResponse({ content: [{ type: 'tool_use', id: 'x', name: 'loop', input: {} }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const spec: LlmSpec = {
      provider: 'anthropic',
      maxTokens: 16,
      maxToolRounds: 2,
      tools: [{ name: 'loop', description: 'd', command: ['./t.sh'], parameters: [] }],
    };

    await expect(
      runLlm({
        spec,
        systemPrompt: '',
        userInput: 'go',
        skillDir: dir,
        toolTimeoutMs: 5000,
      }),
    ).rejects.toThrow(/max tool rounds/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
