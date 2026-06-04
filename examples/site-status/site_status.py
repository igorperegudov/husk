#!/usr/bin/env python3
"""HUSK kernel: read a URL from stdin, print a JSON status report to stdout.

Uses only the Python standard library so it runs anywhere python3 does.
"""
import json
import sys
import time
import urllib.request


def main() -> int:
    url = sys.stdin.read().strip()
    if not url:
        print(json.dumps({"error": "no URL provided on stdin"}))
        return 1
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    req = urllib.request.Request(url, headers={"User-Agent": "husk-site-status/0.1"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            elapsed_ms = round((time.monotonic() - started) * 1000)
            print(
                json.dumps(
                    {
                        "url": url,
                        "final_url": resp.geturl(),
                        "status_code": resp.status,
                        "response_time_ms": elapsed_ms,
                        "server": resp.headers.get("Server"),
                        "content_type": resp.headers.get("Content-Type"),
                    },
                    indent=2,
                )
            )
    except Exception as exc:  # noqa: BLE001 - report any failure as JSON
        print(json.dumps({"url": url, "error": str(exc)}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
