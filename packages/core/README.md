# @elisym/husk-core

The engine behind [HUSK](https://github.com/igorperegudov/husk). It loads a folder
of agent skills, invokes their kernels with a uniform stdin/stdout/file
contract, and serves them over HTTP with a Web-standard `fetch` handler.

This is the library most people consume through the [`@elisym/husk`](https://www.npmjs.com/package/@elisym/husk)
CLI. Use it directly when you want to embed the server or run skills in-process.

```sh
bun add @elisym/husk-core
```

## Serve skills over HTTP

```ts
import { loadSkills, createFetchHandler } from '@elisym/husk-core';

const { skills } = loadSkills('./skills');
Bun.serve({ port: 3000, fetch: createFetchHandler({ skills }) });
```

The handler is a plain `(Request) => Promise<Response>`, so it also runs under
Deno, Cloudflare Workers, or a Node adapter.

## Invoke a skill in-process

```ts
import { loadSkill, invokeSkill } from '@elisym/husk-core';

const skill = loadSkill('./skills/uppercase');
const result = await invokeSkill(skill, { text: 'hello' });
console.log(result.ok, result.stdout);
await result.cleanup();
```

## API

- `loadSkills(dir)` / `loadSkill(dir)` - discover and parse skills.
- `parseManifest(content, slug)` / `parseFrontmatter(content)` - the parser.
- `invokeSkill(skill, input, options)` - run a kernel; returns a structured result.
- `runProcess(cmd, args, options)` - the hardened child-process runner.
- `createFetchHandler(options)` - the HTTP handler (routing, SSE, files, CORS, auth).
- `generateOpenApi(skills, options)` - build an OpenAPI 3.1 document.
- `toCard(skill)` / `mimeFromPath(path)` - small helpers.

See the [HUSK guide](https://github.com/igorperegudov/husk/blob/main/GUIDE.md) for
the manifest reference and the kernel I/O contract.

MIT licensed, by [elisym labs](https://github.com/igorperegudov).
