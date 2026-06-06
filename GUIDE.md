# HUSK guide

This guide covers the manifest format, the kernel I/O contract, the HTTP
surface, deployment shapes, and compatibility with existing Agent Skills and
elisym agents.

## 1. Anatomy of a skill

A skill is a folder containing a `SKILL.md` manifest and (usually) a kernel
script. The folder name is the default slug; the manifest `name` is the
canonical one.

```
my-skill/
├── SKILL.md      # YAML frontmatter + markdown docs
└── run.sh        # the kernel (any language)
```

`SKILL.md` is YAML frontmatter followed by a markdown body. The body is free
documentation (and keeps the file a valid Agent Skill); HUSK only reads the
frontmatter.

## 2. Manifest reference

| Field         | Default          | Meaning                                                                                                                              |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`        | - (required)     | Human-facing name. Its slug is the URL id.                                                                                           |
| `description` | - (required)     | One line, shown in cards and OpenAPI.                                                                                                |
| `run`         | -                | Kernel command. String (`python3 main.py`) or YAML list. Required unless `serve` or `mode: llm`.                                     |
| `serve`       | -                | Path to a static file to return instead of running a kernel.                                                                         |
| `mode`        | derived          | `script`, `static-file`, `llm`, or `proxy`. Inferred from `run`/`serve`/`tools`/`proxy`; set explicitly for a pure-prompt LLM skill. |
| `proxy`       | -                | Upstream URL to reverse-proxy to. Sets `mode: proxy`.                                                                                |
| `input`       | `text`           | `text` (stdin), `file` (`$HUSK_INPUT_FILE`), or `none`.                                                                              |
| `output`      | `text`           | `text` (stdout), `json` (stdout as JSON), or `file`.                                                                                 |
| `timeout_ms`  | `60000`          | Hard timeout. The kernel, or each LLM tool call, is SIGKILLed past it.                                                               |
| `method`      | `POST`           | HTTP verb that invokes the skill.                                                                                                    |
| `route`       | `/skills/<slug>` | Custom invocation path.                                                                                                              |
| `input_mime`  | -                | Advertised input MIME for `file` input (a discovery hint).                                                                           |
| `output_mime` | -                | Content-Type used for `file` output.                                                                                                 |

LLM skills add `tools`, `provider`, `model`, `max_tokens`, and `max_tool_rounds`
(see below). Unknown frontmatter keys are preserved but ignored, so marketplace
fields like `price`, `token`, or `capabilities` are harmless.

### `run` as a string or a list

```yaml
run: ./remove-bg.sh                 # local script (made executable on load)
run: python3 scripts/site_status.py # interpreter on PATH + a relative script
run:                                # list form, for args with spaces
  - node
  - --experimental-strip-types
  - main.ts
```

`argv[0]` is resolved against the skill folder when it looks like a path
(`./x`, `../x`, `a/b`); otherwise it is looked up on `PATH`. The working
directory of the kernel is always the skill folder.

### LLM skills (`mode: llm`)

Set `mode: llm` (or just declare `tools`) and an LLM runs the skill instead of a
script. The `SKILL.md` body is the system prompt; the request body is the user
message. A skill with neither `run` nor `serve` defaults to `mode: llm`.

| Field             | Default          | Meaning                                             |
| ----------------- | ---------------- | --------------------------------------------------- |
| `tools`           | -                | Scripts the model may call (see below).             |
| `provider`        | `anthropic`      | `anthropic`, `openai`, `xai`, `google`, `deepseek`. |
| `model`           | provider default | The model id.                                       |
| `max_tokens`      | `4096`           | Output token cap.                                   |
| `max_tool_rounds` | `10`             | Max LLM-to-tools rounds before giving up.           |

```yaml
---
name: Site Checker
description: Ask about a site - the LLM checks its status and explains it.
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

Each tool's `command` is an argv (`command[0]` is an interpreter on `PATH` or a
path in the skill dir). When the model calls a tool, HUSK passes the first
`required` parameter as a positional argument and the rest as `--name value`; a
value beginning with `-` is rejected. The tool's stdout (exit 0) is fed back to
the model, which loops until it returns a final answer or hits `max_tool_rounds`.

The provider API key is read from the environment at invoke time
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...). HUSK calls the provider's HTTP API
directly and bundles no model or provider SDK. Tool scripts run with the provider
keys stripped from their environment.

### Proxy skills (`mode: proxy`)

Set `proxy:` to forward the request to an upstream HTTP endpoint instead of
running anything locally. Declared `headers` are resolved against the
environment at request time, so a secret stays server-side.

| Field             | Default           | Meaning                                         |
| ----------------- | ----------------- | ----------------------------------------------- |
| `proxy`           | - (required)      | Upstream URL (http/https). Sets `mode: proxy`.  |
| `headers`         | -                 | Headers sent upstream; values may use `${VAR}`. |
| `forward_headers` | -                 | Incoming header names to pass through.          |
| `proxy_method`    | invocation method | Override the upstream HTTP method.              |

```yaml
---
name: Anthropic Proxy
description: Forward chat requests to Anthropic, injecting the API key.
mode: proxy
proxy: https://api.anthropic.com/v1/messages
headers:
  x-api-key: ${ANTHROPIC_API_KEY}
  anthropic-version: '2023-06-01'
---
```

The method, body (streamed), query string, and incoming `content-type` are
forwarded; the upstream status, content-type, and body (streaming included) pass
straight back. Other incoming headers are dropped unless listed in
`forward_headers`, so client credentials never leak upstream by accident.

## 3. The kernel I/O contract

HUSK runs your kernel as a child process. There is no SDK to import.

**Input**

- `input: text` - the request body is piped to **stdin**.
- `input: file` - the upload is staged on disk; its path is in
  `$HUSK_INPUT_FILE`. Any accompanying text is on stdin.
- `input: none` - stdin is empty.

**Output**

- `output: text` - whatever the kernel prints to **stdout**.
- `output: json` - stdout, served as `application/json`.
- `output: file` - the kernel writes one file to `$HUSK_OUTPUT_FILE`, or many
  files into `$HUSK_OUTPUT_DIR`. stdout becomes an optional note (`x-husk-note`
  header for a single file). A single file is returned as binary; multiple files
  are returned as a JSON array of `{ filename, mime, size, dataBase64 }`.

**Status**

- Exit `0` = success.
- Non-zero exit = error: HTTP `500` (or `504` on timeout) with the kernel's
  stderr in the JSON body.

Environment variables are also exposed under their `ELISYM_*` names
(`ELISYM_INPUT_FILE`, `ELISYM_OUTPUT_FILE`, `ELISYM_OUTPUT_DIR`) so kernels
written for elisym agents run unchanged.

### Examples

```sh
# text -> text
#!/bin/sh
exec tr 'a-z' 'A-Z'
```

```python
# text -> json
import json, sys
print(json.dumps({"echo": sys.stdin.read().strip()}))
```

```bash
# file -> file (e.g. background removal)
#!/usr/bin/env bash
set -euo pipefail
rembg i "$HUSK_INPUT_FILE" "$HUSK_OUTPUT_FILE"
echo "removed background"
```

## 4. HTTP surface

| Method & path       | Behavior                                      |
| ------------------- | --------------------------------------------- |
| `GET /`             | HTML index                                    |
| `GET /skills`       | array of skill cards                          |
| `GET /skills/:slug` | one skill card                                |
| `GET /openapi.json` | OpenAPI 3.1 spec generated from the manifests |
| `GET /healthz`      | `{ "status": "ok", "skills": N }`             |
| `<method> <route>`  | invoke a skill                                |

Request bodies accepted by invoke endpoints:

- `text/plain` - used verbatim as the text input.
- `application/json` - a bare string, or `{ "input": "..." }`, else the raw body.
- `multipart/form-data` - the first file part becomes the file input; a `text`,
  `input`, or `prompt` field becomes the accompanying text.
- raw binary - for `file`-input skills with any other content type.
- `GET` - the `input` / `q` / `text` query parameter.

### Streaming (SSE)

For `text`/`json` skills, add `?stream=1` or send `Accept: text/event-stream`.
HUSK streams `event: stdout` / `event: stderr` chunks as the kernel produces
them, then a final `event: done` with `{ ok, exitCode }`.

## 5. Embedding the engine

`createFetchHandler` returns a standard `(Request) => Promise<Response>`:

```ts
import { loadSkills, createFetchHandler } from '@elisymlabs/husk-core';

const { skills, errors } = loadSkills('./skills');
errors.forEach((e) => console.warn(`skipped ${e.dir}: ${e.message}`));

const fetch = createFetchHandler({
  skills,
  serviceName: 'My Agent',
  cors: true, // off by default; safe to enable here because `auth` is set
  concurrency: 8, // cap concurrent kernels (0 = unlimited)
  auth: (req) => req.headers.get('authorization') === `Bearer ${process.env.TOKEN}`,
});

Bun.serve({ port: 3000, fetch });
```

You can also invoke a skill directly without HTTP:

```ts
import { loadSkill, invokeSkill } from '@elisymlabs/husk-core';

const skill = loadSkill('./skills/uppercase');
const result = await invokeSkill(skill, { text: 'hello' });
console.log(result.stdout); // HELLO
await result.cleanup();
```

## 6. Deployment shapes - one skill, three runtimes

The same skill folder runs unchanged as:

- **A long-lived node.** `husk serve ./skills` - the default.
- **A one-shot / serverless function.** `husk call <name> -i -` runs a single
  skill from stdin to stdout. Because the handler is a Web `fetch` function, you
  can also mount `createFetchHandler` directly in Cloudflare Workers, Deno
  Deploy, or a Vercel edge function.
- **A container.** `husk build --docker` emits a Dockerfile that installs the
  CLI and runs `husk serve` on your skills folder.

## 7. Compatibility

- **Agent Skills.** A HUSK manifest is a superset of the Agent Skills `SKILL.md`
  (`name` + `description` + a markdown body). A bare skill loads as `mode: llm`
  (the body is the system prompt); add `run:` for a script or `tools:` for an LLM
  with tools, without breaking its use as a documentation skill.
- **elisym agents.** Point HUSK at an elisym agent's `skills/` folder and every
  skill serves over HTTP - `llm` (with `tools`), `dynamic-script`,
  `static-script`, and `static-file` alike. The loader maps `script`, `mode`,
  `script_timeout_ms`, `input_mime`, `output_mime`, and `output_file`, carries
  over the LLM fields (`tools`, `provider`, `model`, `max_tokens`,
  `max_tool_rounds`), and exposes the `ELISYM_*` I/O env vars. Marketplace-only
  fields (`price`, `token`, `capabilities`) are ignored - HUSK is the HTTP shell,
  not the marketplace.

## 8. Limits & notes

- Captured stdout/stderr is bounded (5 MB by default) to protect the server.
- File outputs are read into memory before responding; keep them reasonable.
- HUSK does not authenticate or rate-limit by default - add `auth` when
  embedding, or front the server with a gateway.
- Kernels run with the server's full environment (including any API keys you
  set). Only serve skills you trust. LLM tool scripts have the provider keys
  stripped from their environment.
- `mode: llm` skills spend your provider tokens on every request. An
  unauthenticated public endpoint lets anyone spend them - gate LLM skills behind
  `auth` (when embedding) or a gateway.
