import {
  AppWindow,
  Blocks,
  Bot,
  Boxes,
  Container,
  FileCode2,
  FileJson,
  GitBranch,
  type LucideIcon,
  Network,
  PlugZap,
  Rocket,
  Server,
  ShieldCheck,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

export const LINKS = {
  docs: 'https://docs.husk.systems',
  github: 'https://github.com/igorperegudov/husk',
  npm: 'https://www.npmjs.com/package/@elisym/husk',
  x: 'https://twitter.com/elisymlabs',
  org: 'https://github.com/elisymlabs',
} as const;

export const INSTALL = 'bun add -g @elisym/husk';

export const AGENT_PROMPT =
  'Read https://docs.husk.systems and scaffold a HUSK skill in Python that takes a city name on stdin and prints the current weather as JSON, then serve it with `husk serve` and show me a working curl.';

export const HERO = {
  eyebrow: 'HTTP Universal Skill Kernel',
  title: 'Turn a skill into an API.',
  subtitle:
    'Write a SKILL.md and an LLM runs it - the body becomes its system prompt and it calls the tools you declare. Or wrap a script in any language. Either way, husk serves every skill as its own HTTP endpoint.',
};

export interface ValueProp {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const VALUE_PROPS: ValueProp[] = [
  {
    icon: Bot,
    title: 'An LLM runs your skill',
    body: 'Set mode: llm and the SKILL.md body becomes the system prompt. The model calls the tools you declare, looping until it has an answer - no agent framework required.',
  },
  {
    icon: Boxes,
    title: 'A skill is a folder',
    body: 'One SKILL.md plus a script - the open Agent Skills standard Anthropic introduced for Claude. Folders from Claude Code, Codex and Cursor serve unchanged.',
  },
  {
    icon: Server,
    title: 'Served over HTTP',
    body: 'Script or LLM, every skill is an endpoint - discovery, OpenAPI, streaming and health from one Bun process.',
  },
];

export interface UseCase {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const USE_CASES: UseCase[] = [
  {
    icon: AppWindow,
    title: 'LLM features in your product',
    body: 'Wrap your prompts, tools and agents as HTTP endpoints and call them from your backend - instead of scattering LLM glue across your codebase.',
  },
  {
    icon: ShieldCheck,
    title: 'Behind your API gateway',
    body: 'Put your own gateway in front of husk to enforce auth, API keys, rate limits and per-customer quotas. husk stays focused on the LLM logic.',
  },
  {
    icon: Users,
    title: 'An internal AI platform',
    body: "One home for every team's prompts and skills. Grant access per team or user at the gateway, and ship new capabilities as new endpoints.",
  },
  {
    icon: Workflow,
    title: 'Tools for many agents',
    body: 'Expose the same skills over HTTP to every agent and app you run - Claude, Cursor, your own - rather than re-implementing tools each time.',
  },
  {
    icon: GitBranch,
    title: 'Prompts versioned in git',
    body: 'Prompts and tool definitions live in SKILL.md - reviewed and versioned like code, then deployed as endpoints. No prompt sprawl.',
  },
  {
    icon: Rocket,
    title: 'Prototype to production',
    body: 'The same skill folder runs as a server, a serverless function, or a container - move from a demo to prod with no rewrite.',
  },
];

export interface StepFile {
  name?: string;
  code: string;
}

export interface Step {
  n: string;
  title: string;
  body: string;
  files: StepFile[];
}

export const STEPS: Step[] = [
  {
    n: '01',
    title: 'Install the CLI',
    body: 'One global install with Bun. There is no project framework to learn.',
    files: [{ name: 'terminal', code: 'bun add -g @elisym/husk' }],
  },
  {
    n: '02',
    title: 'Write a skill',
    body: 'A skill is a folder: a SKILL.md manifest plus a kernel script in any language (or just a prompt for an LLM to run).',
    files: [
      {
        name: 'skills/uppercase/SKILL.md',
        code: `---
name: Uppercase
description: Send any text, get it back upper-cased.
run: ./upper.sh   # the kernel - any executable
input: text       # text | file | none
output: text      # text | json | file
---`,
      },
      {
        name: 'skills/uppercase/upper.sh',
        code: `#!/bin/sh
exec tr 'a-z' 'A-Z'`,
      },
    ],
  },
  {
    n: '03',
    title: 'Serve the folder',
    body: 'Point husk at the folder that holds your skills. One process serves every skill over HTTP on :3000 - add --watch to hot-reload.',
    files: [
      {
        name: 'terminal',
        code: `husk serve ./skills
# > http://localhost:3000  -  serving 1 skill`,
      },
    ],
  },
  {
    n: '04',
    title: 'Call it over HTTP',
    body: 'Every skill is a real endpoint. Pipe in the body, read the result back.',
    files: [
      {
        name: 'terminal',
        code: `curl -s -X POST http://localhost:3000/skills/uppercase \\
  --data 'hello world'
# HELLO WORLD`,
      },
    ],
  },
];

export interface Mode {
  key: string;
  name: string;
  tagline: string;
  snippet: string;
}

export const MODES: Mode[] = [
  {
    key: 'llm',
    name: 'llm',
    tagline: 'An LLM runs the skill and calls the tools you declare.',
    snippet: `---
name: Site Checker
mode: llm
tools:
  - name: check_status
    command: ['python3', 'check.py']
    parameters:
      - name: url
        required: true
---
You are a website status assistant. Call
check_status with the URL, then explain it.`,
  },
  {
    key: 'script',
    name: 'script',
    tagline: 'Run a kernel in any language. stdin in, stdout out.',
    snippet: `---
name: Uppercase
run: ./upper.sh
input: text
output: text
---`,
  },
  {
    key: 'proxy',
    name: 'proxy',
    tagline: 'Forward to an upstream, injecting secrets server-side.',
    snippet: `---
name: Anthropic Proxy
mode: proxy
proxy: https://api.anthropic.com/v1/messages
headers:
  x-api-key: \${ANTHROPIC_API_KEY}
  anthropic-version: '2023-06-01'
---`,
  },
  {
    key: 'static-file',
    name: 'static-file',
    tagline: 'Return a fixed file. No process is spawned.',
    snippet: `---
name: Welcome
serve: ./welcome.md
output: text
---`,
  },
];

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  {
    icon: Bot,
    title: 'Tool-calling agents',
    body: 'mode: llm runs the model in a loop over your declared tools - each tool is just a script.',
  },
  {
    icon: Network,
    title: 'Multi-provider LLM',
    body: 'anthropic, openai, xai, google, deepseek - bring a key, husk bundles no model.',
  },
  {
    icon: Zap,
    title: 'SSE streaming',
    body: 'Add ?stream=1 to stream a model or kernel output token-by-token over Server-Sent Events.',
  },
  {
    icon: FileJson,
    title: 'OpenAPI 3.1',
    body: 'A complete, generated spec at /openapi.json - import it straight into any client.',
  },
  {
    icon: Blocks,
    title: 'Agent Skills standard',
    body: 'The open SKILL.md format Anthropic introduced for Claude - folders from Claude Code, Codex and Cursor run unchanged.',
  },
  {
    icon: FileCode2,
    title: 'File I/O',
    body: 'Text, JSON, or files in and out through simple env vars - no multipart code to write.',
  },
  {
    icon: ShieldCheck,
    title: 'Secrets stay home',
    body: 'Provider and proxy keys are injected at invoke time and never reach the client.',
  },
  {
    icon: Container,
    title: 'Docker, generated',
    body: 'husk build --docker emits a Dockerfile for the exact same folder of skills.',
  },
  {
    icon: PlugZap,
    title: 'Embeddable core',
    body: 'A Web-standard fetch handler that runs on Bun, Deno, Workers or Node.',
  },
];

export interface Runtime {
  cmd: string;
  title: string;
  body: string;
}

export const RUNTIMES: Runtime[] = [
  {
    cmd: 'husk serve',
    title: 'A server',
    body: 'A long-lived Bun process serving every skill over HTTP.',
  },
  {
    cmd: 'husk call',
    title: 'A function',
    body: 'The same folder as a one-shot, serverless invocation.',
  },
  {
    cmd: 'husk build --docker',
    title: 'A container',
    body: 'Emit a Dockerfile and ship the identical skills anywhere.',
  },
];

export interface DemoSkill {
  slug: string;
  label: string;
  input: 'text' | 'none';
  placeholder: string;
  sample: string;
  run: (input: string) => string;
}

/** Real outputs from the repo's example skills, computed in the browser. */
export const DEMO_SKILLS: DemoSkill[] = [
  {
    slug: 'uppercase',
    label: 'uppercase',
    input: 'text',
    placeholder: 'hello world',
    sample: 'hello world',
    run: (i) => i.toUpperCase(),
  },
  {
    slug: 'hello',
    label: 'hello',
    input: 'text',
    placeholder: 'world',
    sample: 'world',
    run: (i) => `you said: ${i}`,
  },
  {
    slug: 'utc-now',
    label: 'utc-now',
    input: 'none',
    placeholder: '',
    sample: '',
    run: () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  },
];

/** An LLM skill: the SKILL.md body is the system prompt, tools are scripts the model calls. */
export const LLM_SKILL = `---
name: Site Checker
mode: llm
tools:
  - name: check_status
    command: ['python3', 'check.py']
    parameters:
      - name: url
        required: true
---
You are a website status assistant.
Call check_status with the URL, then
explain the result in plain English.`;

export type LlmRole = 'user' | 'model' | 'tool';

export interface LlmTurn {
  role: LlmRole;
  label: string;
  text: string;
}

export const LLM_TURNS: LlmTurn[] = [
  { role: 'user', label: 'request', text: 'Is example.com up?' },
  { role: 'model', label: 'llm', text: 'check_status(url: "example.com")' },
  { role: 'tool', label: 'husk runs check.py', text: '{ "status": 200, "ms": 142 }' },
  { role: 'model', label: 'llm', text: 'Yes - example.com is up, 200 in 142 ms.' },
];

export const LLM_PROVIDERS = ['anthropic', 'openai', 'xai', 'google', 'deepseek'];

export interface TreeSkill {
  folder: string;
  files: string[];
  mode: string;
  method: string;
  slug: string;
}

/** A small skills folder - each entry becomes its own HTTP endpoint. */
export const TREE_SKILLS: TreeSkill[] = [
  { folder: 'assistant', files: ['SKILL.md'], mode: 'llm', method: 'POST', slug: 'assistant' },
  {
    folder: 'uppercase',
    files: ['SKILL.md', 'upper.sh'],
    mode: 'script',
    method: 'POST',
    slug: 'uppercase',
  },
  {
    folder: 'site-checker',
    files: ['SKILL.md', 'check.py'],
    mode: 'llm',
    method: 'POST',
    slug: 'site-checker',
  },
];
