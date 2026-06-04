#!/usr/bin/env python3
"""HUSK LLM tool: take a URL as the first argument, print a JSON status report.

The LLM calls this tool; HUSK passes the `url` parameter as argv[1]. Uses only
the Python standard library.
"""
import json
import sys
import time
import urllib.request


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else ""
    if not url:
        print(json.dumps({"error": "no url argument"}))
        return 1
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    req = urllib.request.Request(url, headers={"User-Agent": "husk-site-checker/0.1"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(
                json.dumps(
                    {
                        "url": url,
                        "status_code": resp.status,
                        "response_time_ms": round((time.monotonic() - started) * 1000),
                        "server": resp.headers.get("Server"),
                    }
                )
            )
    except Exception as exc:  # noqa: BLE001 - report any failure as JSON
        print(json.dumps({"url": url, "error": str(exc)}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
