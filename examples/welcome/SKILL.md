---
name: Welcome
description: Returns a fixed welcome message from a static file - no process is spawned.
serve: ./welcome.md
output: text
---

# Welcome

A static-file skill. When `serve:` is set and there is no `run:`, HUSK simply
returns the named file's contents - useful for fixed docs, manifests, or
canned responses with zero kernel code.

```sh
curl -s -X POST http://localhost:3000/skills/welcome
```
