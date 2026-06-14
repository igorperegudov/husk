import { defineConfig, McpSource } from 'vocs/config';

export default defineConfig({
  rootDir: '.',
  srcDir: '.',
  title: 'HUSK',
  titleTemplate: '%s - HUSK',
  description: 'HTTP Universal Skill Kernel - turn a folder of agent skills into an HTTP backend.',
  baseUrl: 'https://docs.husk.systems',
  logoUrl: '/logo.svg',
  iconUrl: '/favicon.svg',
  checkDeadlinks: 'warn',
  // "Ask AI" button - opens the docs' MCP endpoint in the reader's ChatGPT/Claude
  // and exposes the docs (and repo) as an MCP source.
  mcp: {
    enabled: true,
    sources: [McpSource.github({ name: 'husk', repo: 'igorperegudov/husk' })],
  },
  editLink: {
    link: 'https://github.com/igorperegudov/husk/edit/main/packages/docs/pages/:path',
    text: 'Edit on GitHub',
  },
  socials: [
    { icon: 'github', link: 'https://github.com/igorperegudov/husk' },
    { icon: 'x', link: 'https://twitter.com/elisymlabs' },
  ],
  topNav: [
    { text: 'Docs', link: '/', match: '/' },
    { text: 'Quickstart', link: '/quickstart' },
    { text: 'CLI', link: '/cli' },
    { text: 'GitHub', link: 'https://github.com/igorperegudov/husk' },
  ],
  sidebar: [
    {
      text: 'Introduction',
      items: [
        { text: 'What is HUSK', link: '/' },
        { text: 'How it works', link: '/how-it-works' },
        { text: 'Quickstart', link: '/quickstart' },
      ],
    },
    {
      text: 'Build skills',
      items: [
        { text: 'Anatomy of a skill', link: '/skills/anatomy' },
        { text: 'The manifest', link: '/skills/manifest' },
        { text: 'LLM skills & tools', link: '/skills/llm' },
        { text: 'The kernel I/O contract', link: '/skills/kernel' },
        { text: 'Proxy skills', link: '/skills/proxy' },
        { text: 'Examples', link: '/skills/examples' },
      ],
    },
    {
      text: 'Serve & deploy',
      items: [
        { text: 'The HTTP server', link: '/serve/http' },
        { text: 'Streaming (SSE)', link: '/serve/streaming' },
        { text: 'One skill, three runtimes', link: '/serve/runtimes' },
        { text: 'Containers', link: '/serve/docker' },
      ],
    },
    {
      text: 'Tooling',
      items: [
        { text: 'CLI', link: '/cli' },
        { text: 'Library (husk-core)', link: '/library' },
      ],
    },
    {
      text: 'Reference',
      items: [
        { text: 'HTTP API', link: '/reference/http-api' },
        { text: 'Manifest fields', link: '/reference/manifest-fields' },
        { text: 'Compatibility', link: '/reference/compatibility' },
      ],
    },
  ],
});
