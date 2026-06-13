# @elisym/husk

The `husk` CLI - [HUSK](https://github.com/elisymlabs/husk), the HTTP Universal
Skill Kernel. Turn a folder of agent skills into a working HTTP backend with one
long-lived [Bun](https://bun.sh) process. No SDK, no rewrite: write a script in
any language, and HUSK publishes it.

```sh
bun add -g @elisym/husk
```

## Quick start

```sh
husk init                 # create ./skills with a starter skill
husk serve                # serve every skill over HTTP on :3000
curl -X POST localhost:3000/skills/hello --data 'world'
```

## Commands

| Command                     | Description                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `husk serve [dir]`          | Serve a folder of skills over HTTP. `--watch` hot-reloads, `--port`, `--host`, `--concurrency`, `--cors`, `--name`.   |
| `husk list [dir]`           | List discovered skills (`--json` for machine output).                                                                 |
| `husk call <name>`          | Invoke a skill locally without HTTP. `-i/--input` (`-` = stdin, `@file` = file), `-f/--file`, `-o/--out`, `-d/--dir`. |
| `husk new <name>`           | Scaffold a skill. `-l/--lang bash\|python\|ts`, `-d/--dir`.                                                           |
| `husk init [dir]`           | Create a project with a `./skills` folder and a starter skill.                                                        |
| `husk build [dir] --docker` | Emit a Dockerfile so the same skills run in a container.                                                              |

## A skill is a folder

```yaml
# skills/uppercase/SKILL.md
---
name: Uppercase
description: Send any text, get it back in upper case.
run: ./upper.sh
---
```

```sh
# skills/uppercase/upper.sh
#!/bin/sh
exec tr 'a-z' 'A-Z'
```

That is the whole skill. See the [HUSK guide](https://github.com/elisymlabs/husk/blob/main/GUIDE.md)
for the manifest reference, the kernel I/O contract, and deployment patterns.

Requires Bun (the server uses `Bun.serve`). The engine itself lives in
[`@elisym/husk-core`](https://www.npmjs.com/package/@elisym/husk-core).

MIT licensed, by [elisym labs](https://github.com/elisymlabs).
