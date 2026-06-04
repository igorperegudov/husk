---
name: UTC Now
description: Returns the current UTC timestamp. No input, no dependencies.
run: ./now.sh
input: none
output: text
timeout_ms: 5000
---

# UTC Now

A no-input skill. Because `input: none`, HUSK invokes the kernel with an empty
stdin and returns whatever it prints.

```sh
curl -s -X POST http://localhost:3000/skills/utc-now
# 2026-06-03T12:34:56Z
```
