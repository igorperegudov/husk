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

  it('rejects explicit mode: static-file with no serve target (not silent llm fallback)', () => {
    // A typo'd `serve:`/`output_file:` must error, not coerce to a token-spending
    // LLM skill via the implicit default.
    expect(() =>
      parseManifest(
        ['---', 'name: oops', 'description: d', 'mode: static-file', '---'].join('\n'),
        'oops',
      ),
    ).toThrow(ManifestError);
  });

  it('rejects explicit mode: script with no run/command (not silent llm fallback)', () => {
    // A typo'd `run:` (e.g. `rnu:`) under an explicit `mode: script` must error
    // rather than fall through to the implicit, token-spending LLM default.
    expect(() =>
      parseManifest(
        ['---', 'name: oops', 'description: d', 'mode: script', 'rnu: ./x.sh', '---'].join('\n'),
        'oops',
      ),
    ).toThrow(ManifestError);
  });

  it('rejects explicit mode: script with a serve but no run (not silent static-file)', () => {
    // A stray `serve:` under an explicit `mode: script` with a missing `run:`
    // must error, not be silently rerouted to static-file - the operator's
    // explicit mode is honored and its missing-target guard fires.
    expect(() =>
      parseManifest(
        ['---', 'name: oops', 'description: d', 'mode: script', 'serve: ./x.txt', '---'].join('\n'),
        'oops',
      ),
    ).toThrow(ManifestError);
  });

  it('rejects `proxy:` alongside an explicit non-proxy mode (no silent coercion to proxy)', () => {
    // `proxy:` is proxy-only; with an explicit `mode: script` it must error, not
    // silently turn the skill into a reverse proxy and drop the declared mode.
    expect(() =>
      parseManifest(
        ['---', 'name: oops', 'description: d', 'mode: script', 'proxy: https://up/x', '---'].join(
          '\n',
        ),
        'oops',
      ),
    ).toThrow(ManifestError);
  });

  it('rejects `tools:` alongside an explicit non-llm mode (no silent coercion to llm)', () => {
    // `tools:` is llm-only; with an explicit `mode: script` (even fully specified
    // with a `run:`) it must NOT flip the skill to a token-spending llm endpoint
    // and drop the declared command - it must error loudly.
    expect(() =>
      parseManifest(
        [
          '---',
          'name: oops',
          'description: d',
          'mode: script',
          'run: ./x.sh',
          'tools:',
          '  - name: t',
          '    description: a tool',
          "    command: ['./t.sh']",
          '---',
        ].join('\n'),
        'oops',
      ),
    ).toThrow(ManifestError);
  });

  it('rejects a timeout_ms larger than the 32-bit setTimeout ceiling', () => {
    // > 2_147_483_647 ms would overflow to a 1ms timer and SIGKILL instantly.
    expect(() =>
      parseManifest(
        [
          '---',
          'name: slow',
          'description: d',
          'run: ./s.sh',
          'timeout_ms: 9999999999',
          '---',
        ].join('\n'),
        'slow',
      ),
    ).toThrow(ManifestError);
  });

  it('derives the default route from the manifest name slug, not the folder slug', () => {
    // The folder slug (`my-folder`) differs from the name slug; the default
    // invoke route must use the name slug so it matches the skill's identity and
    // its canonical card route, instead of diverging.
    const m = parseManifest(
      ['---', 'name: Cool Skill', 'description: d', 'run: ./x.sh', '---'].join('\n'),
      'my-folder',
    );
    expect(m.route).toBe('/skills/cool-skill');
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

  it('rejects a name that is only control characters (empty after stripping)', () => {
    // `name: ""` survives trim() (not whitespace) but strips to empty;
    // requireString must still reject it, not return ''.
    expect(() =>
      parseManifest(
        ['---', 'name: "\\u0001"', 'description: d', 'run: ./x.sh', '---'].join('\n'),
        's',
      ),
    ).toThrow(ManifestError);
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
