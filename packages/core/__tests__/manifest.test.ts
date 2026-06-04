import { describe, expect, it } from 'vitest';
import { ManifestError, parseFrontmatter, parseManifest, toSlug } from '../src/manifest';

describe('toSlug', () => {
  it('kebab-cases names', () => {
    expect(toSlug('Stock Quote')).toBe('stock-quote');
    expect(toSlug('  Remove BG!  ')).toBe('remove-bg');
    expect(toSlug('utc_now')).toBe('utc-now');
  });
});

describe('parseFrontmatter', () => {
  it('splits frontmatter from body', () => {
    const { frontmatter, body } = parseFrontmatter('---\nname: x\n---\nhello world');
    expect(frontmatter).toEqual({ name: 'x' });
    expect(body).toBe('hello world');
  });

  it('throws without a frontmatter block', () => {
    expect(() => parseFrontmatter('no frontmatter here')).toThrow(ManifestError);
  });
});

describe('parseManifest', () => {
  it('parses a minimal text skill with defaults', () => {
    const m = parseManifest(
      ['---', 'name: Uppercase', 'description: upper it', 'run: ./up.sh', '---'].join('\n'),
      'uppercase',
    );
    expect(m.name).toBe('Uppercase');
    expect(m.argv).toEqual(['./up.sh']);
    expect(m.input).toBe('text');
    expect(m.output).toBe('text');
    expect(m.method).toBe('POST');
    expect(m.route).toBe('/skills/uppercase');
    expect(m.timeoutMs).toBe(60_000);
  });

  it('accepts argv as a list', () => {
    const m = parseManifest(
      ['---', 'name: s', 'description: d', 'run:', '  - python3', '  - main.py', '---'].join('\n'),
      's',
    );
    expect(m.argv).toEqual(['python3', 'main.py']);
  });

  it('maps elisym dynamic-script fields (drop-in compatibility)', () => {
    const m = parseManifest(
      [
        '---',
        'name: Background Removal',
        'description: remove bg',
        'mode: dynamic-script',
        'script: ./scripts/remove-bg.sh',
        'input_mime: image/*',
        'output_mime: image/png',
        'script_timeout_ms: 300000',
        'price: 0.5',
        'token: usdc',
        '---',
      ].join('\n'),
      'background-removal',
    );
    expect(m.argv).toEqual(['./scripts/remove-bg.sh']);
    expect(m.input).toBe('file');
    expect(m.output).toBe('file');
    expect(m.timeoutMs).toBe(300_000);
    expect(m.outputMime).toBe('image/png');
    // Unknown marketplace fields are preserved but ignored by HUSK.
    expect(m.extra.price).toBe(0.5);
    expect(m.extra.token).toBe('usdc');
  });

  it('treats static-script mode as no input', () => {
    const m = parseManifest(
      [
        '---',
        'name: now',
        'description: time',
        'mode: static-script',
        'script: ./now.sh',
        '---',
      ].join('\n'),
      'now',
    );
    expect(m.input).toBe('none');
  });

  it('supports a static serve file', () => {
    const m = parseManifest(
      ['---', 'name: welcome', 'description: hi', 'serve: ./welcome.md', '---'].join('\n'),
      'welcome',
    );
    expect(m.argv).toEqual([]);
    expect(m.serveFile).toBe('./welcome.md');
    expect(m.input).toBe('none');
  });

  it('honors explicit route and method', () => {
    const m = parseManifest(
      [
        '---',
        'name: ping',
        'description: d',
        'run: ./p.sh',
        'method: GET',
        'route: ping',
        '---',
      ].join('\n'),
      'ping',
    );
    expect(m.method).toBe('GET');
    expect(m.route).toBe('/ping');
  });

  it('requires name and description', () => {
    expect(() => parseManifest('---\nrun: ./x.sh\n---', 's')).toThrow(ManifestError);
    expect(() => parseManifest('---\nname: x\n---', 's')).toThrow(ManifestError);
  });

  it('treats a bare prompt skill (no run/serve) as mode: llm', () => {
    const m = parseManifest(
      ['---', 'name: Assistant', 'description: helps', '---', 'You are helpful.'].join('\n'),
      'assistant',
    );
    expect(m.mode).toBe('llm');
    expect(m.llm).toBeTruthy();
    expect(m.llm?.tools).toEqual([]);
    expect(m.llm?.provider).toBe('anthropic');
    expect(m.input).toBe('text');
  });

  it('parses a tools-based llm skill (elisym drop-in, no explicit mode)', () => {
    const m = parseManifest(
      [
        '---',
        'name: Site Status',
        'description: check a site',
        'price: 0.01',
        'token: usdc',
        'tools:',
        '  - name: check_status',
        '    description: Check a website status.',
        "    command: ['python3', 'scripts/site_status.py']",
        '    parameters:',
        '      - name: url',
        '        description: URL to check',
        '        required: true',
        '---',
        'You check websites.',
      ].join('\n'),
      'site-status',
    );
    expect(m.mode).toBe('llm');
    expect(m.llm?.tools).toHaveLength(1);
    expect(m.llm?.tools[0].command).toEqual(['python3', 'scripts/site_status.py']);
    expect(m.llm?.tools[0].parameters[0]).toEqual({
      name: 'url',
      description: 'URL to check',
      required: true,
    });
  });

  it('honors mode: llm with provider/model/max_tokens/max_tool_rounds', () => {
    const m = parseManifest(
      [
        '---',
        'name: Cheap',
        'description: summarize',
        'mode: llm',
        'provider: openai',
        'model: gpt-5-mini',
        'max_tokens: 512',
        'max_tool_rounds: 3',
        '---',
      ].join('\n'),
      'cheap',
    );
    expect(m.llm).toMatchObject({
      provider: 'openai',
      model: 'gpt-5-mini',
      maxTokens: 512,
      maxToolRounds: 3,
    });
  });
});
