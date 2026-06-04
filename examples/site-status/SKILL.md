---
name: Site Status
description: Send a URL, get back its HTTP status, response time, and final URL as JSON.
run: python3 site_status.py
input: text
output: json
timeout_ms: 20000
---

# Site Status

Reads a URL from stdin and returns a JSON status report. Demonstrates a Python
kernel and `output: json` (the response is served as `application/json`).

```sh
curl -s -X POST http://localhost:3000/skills/site-status --data 'https://example.com'
```
