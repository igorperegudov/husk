<p align="center">
  <img src="assets/logo-lockup.png" alt="HUSK" width="360">
</p>

# HUSK - HTTP Universal Skill Kernel

> Point a long-lived [Bun](https://bun.sh) process at a folder of skills. Every
> skill becomes an HTTP endpoint. Your script - the _kernel_ - is unchanged;
> HUSK is the _husk_ that wraps it and publishes it.

HUSK turns a directory into a working backend. Write a skill as a folder with a
`SKILL.md` manifest and a script in **any language** (bash, Python, TypeScript -
it does not matter), run one process, and your agent serves all of its skills
over HTTP. No SDK to learn, no rewrite: the shell wraps your core code and
publishes it as a service.

```sh
bun add -g @elisymlabs/husk
husk init           # creates ./skills with a starter skill
husk serve          # serves every skill over HTTP on :3000
```

```sh
curl -s -X POST http://localhost:3000/skills/uppercase --data 'hello'
# HELLO
```

## Three ideas

1. **A skill is a folder, not a plugin.** The format is compatible with Agent
   Skills (Claude Code, Codex, Cursor): one `SKILL.md` manifest, any language.
   Existing skill folders - including elisym agents - serve unchanged.
2. **A script, or an LLM with tools.** A skill is a script you wrote, or
   `mode: llm` - where an LLM runs the skill using the `SKILL.md` body as its
   system prompt and calls the tools you declare. Same folder, same HTTP surface.
3. **One long-lived node on Bun.** Start the server and every skill is reachable
   over HTTP. The same folder also runs as a one-shot serverless function
   (`husk call`) or inside a container (`husk build --docker`) with no redesign.

## A skill in 20 seconds

```
skills/
└── uppercase/
    ├── SKILL.md
    └── upper.sh
```

```yaml
# skills/uppercase/SKILL.md
---
name: Uppercase
description: Send any text, get it back in upper case.
run: ./upper.sh # the kernel - any executable, any language
input: text # text | file | none   (default: text)
output: text # text | json | file   (default: text)
---
```

```sh
# skills/uppercase/upper.sh
#!/bin/sh
exec tr 'a-z' 'A-Z'
```

The kernel's I/O contract is just streams and a couple of env vars:

| Manifest       | Kernel reads               | Kernel writes                               | HTTP                   |
| -------------- | -------------------------- | ------------------------------------------- | ---------------------- |
| `input: text`  | request body on **stdin**  | result on **stdout**                        | `text/plain` / JSON in |
| `input: file`  | file at `$HUSK_INPUT_FILE` | -                                           | multipart / raw upload |
| `input: none`  | nothing (empty stdin)      | -                                           | empty body             |
| `output: text` | -                          | **stdout**                                  | `text/plain`           |
| `output: json` | -                          | JSON on **stdout**                          | `application/json`     |
| `output: file` | -                          | `$HUSK_OUTPUT_FILE` or `$HUSK_OUTPUT_DIR/*` | the file(s)            |

Exit `0` means success; a non-zero exit surfaces as an HTTP error with the
kernel's stderr. That is the whole contract.

## Or let an LLM run it

Set `mode: llm` and an LLM runs the skill - the `SKILL.md` body is its system
prompt and it calls the `tools` you declare. Each tool is just a script.

```yaml
# skills/site-checker/SKILL.md
---
name: Site Checker
description: Ask about any site - the LLM checks its status and explains it.
mode: llm
tools:
  - name: check_status
    description: Check a website's HTTP status. Returns JSON.
    command: ['python3', 'check.py']
    parameters:
      - name: url
        description: URL to check
        required: true
---
You are a website status assistant. Call check_status with the URL, then
explain the result in plain English.
```

```sh
ANTHROPIC_API_KEY=sk-... husk serve
curl -X POST localhost:3000/skills/site-checker --data 'Is example.com up?'
```

The model calls the tool, HUSK runs `python3 check.py example.com`, feeds the
output back, and the model answers. Providers: `anthropic` (default), `openai`,
`xai`, `google`, `deepseek`. HUSK calls the provider's API with your key; it
bundles no model.

## Or proxy to an upstream

Set `mode: proxy` and HUSK forwards the request to an upstream HTTP endpoint,
injecting secret headers from the environment - the shape of a "paid model
proxy". The upstream response (streaming included) passes straight back.

```yaml
# skills/anthropic-proxy/SKILL.md
---
name: Anthropic Proxy
description: Forward chat requests to Anthropic, injecting the API key.
mode: proxy
proxy: https://api.anthropic.com/v1/messages
headers:
  x-api-key: ${ANTHROPIC_API_KEY} # resolved server-side; never seen by clients
  anthropic-version: '2023-06-01'
---
```

## HTTP surface

| Route                | What                                                |
| -------------------- | --------------------------------------------------- |
| `GET /`              | HTML index of skills                                |
| `GET /skills`        | JSON array of skill cards                           |
| `GET /skills/:slug`  | one skill card                                      |
| `GET /openapi.json`  | generated OpenAPI 3.1 spec                          |
| `GET /healthz`       | liveness probe                                      |
| `POST /skills/:slug` | invoke a skill (override verb/path in the manifest) |

Add `?stream=1` or `Accept: text/event-stream` to any text/JSON invocation to
stream the kernel's output line-by-line over SSE.

## CLI

```sh
husk serve [dir]          # serve a folder of skills (--watch to hot-reload)
husk list [dir]           # list discovered skills
husk call <name> -i -     # invoke a skill locally (reads stdin)
husk new <name> -l python # scaffold a new skill (bash | python | ts)
husk init [dir]           # create a project with a starter skill
husk build --docker       # emit a Dockerfile for the same skills
```

## Packages

| Package                                    | Description                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| [`@elisymlabs/husk`](./packages/cli)       | The `husk` CLI - serve, scaffold, call, containerize.                          |
| [`@elisymlabs/husk-core`](./packages/core) | The engine - loader, executor, and a Web-standard fetch handler you can embed. |
| [`@elisymlabs/husk-docs`](./packages/docs) | The documentation site (Vocs). `bun --filter @elisymlabs/husk-docs dev`.       |

## Embedding the engine

The core is a plain library. The fetch handler is Web-standard, so it runs under
Bun, Deno, Cloudflare Workers, or a Node adapter - which is exactly what lets one
skill folder run as a server, a function, and a container:

```ts
import { loadSkills, createFetchHandler } from '@elisymlabs/husk-core';

const { skills } = loadSkills('./skills');
const fetch = createFetchHandler({ skills, serviceName: 'My Agent' });

Bun.serve({ port: 3000, fetch });
```

See [`GUIDE.md`](./GUIDE.md) for the full manifest reference, deployment
patterns, and elisym compatibility notes.

## Development

```sh
bun install
bun run build        # build all packages
bun test             # run the test suite
bun run qa           # build + test + typecheck + lint + format + spell
```

Built by [elisym labs](https://github.com/elisymlabs). MIT licensed.
