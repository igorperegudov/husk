---
name: Anthropic Proxy
description: A thin reverse-proxy to the Anthropic Messages API, injecting the API key server-side.
mode: proxy
proxy: https://api.anthropic.com/v1/messages
headers:
  x-api-key: ${ANTHROPIC_API_KEY}
  anthropic-version: '2023-06-01'
  content-type: application/json
---

# Anthropic Proxy

`mode: proxy` forwards the request body straight to an upstream HTTP endpoint -
here, Anthropic's Messages API - and injects your `ANTHROPIC_API_KEY` from the
server environment, so clients never see it.

This is the shape of a "paid model proxy": put your own auth, billing, or rate
limiting in front of `husk serve`, and the upstream key stays server-side. The
upstream response (including streaming) passes straight back to the caller.

```sh
ANTHROPIC_API_KEY=sk-... husk serve
curl -X POST http://localhost:3000/skills/anthropic-proxy \
  -H 'content-type: application/json' \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":128,"messages":[{"role":"user","content":"hi"}]}'
```
