---
name: Uppercase
description: Send any text, get it back in upper case. Pure stdin to stdout, no LLM.
run: ./upper.sh
input: text
output: text
timeout_ms: 10000
---

# Uppercase

The simplest possible HUSK skill: the kernel reads text from **stdin** and writes
the uppercased result to **stdout**. Try it:

```sh
curl -s -X POST http://localhost:3000/skills/uppercase --data 'hello world'
# HELLO WORLD
```
