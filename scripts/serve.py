#!/usr/bin/env python3
"""Serve the planner locally, with shopping lists produced by CookCLI.

Builds the site, serves _site/ and adds /api/shopping-list, which runs
`cook shopping-list` for the selected recipes. The hosted GitHub Pages site
has no API and falls back to adding up ingredients in the browser.

Usage: python3 scripts/serve.py [port]
"""

import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import build


def shopping_list(ids, scales):
    known = set(build.recipe_ids())
    args = []
    for recipe_id, scale in zip(ids, scales):
        if recipe_id not in known:
            raise ValueError(f"Unknown recipe: {recipe_id}")
        factor = float(scale)
        if not 0 < factor <= 100:
            raise ValueError(f"Bad scale: {scale}")
        args.append(f"recipes/{recipe_id}.cook:{factor:g}")
    if not args:
        return []
    sections = build.cook(
        "shopping-list", "-a", str(build.AISLE_CONF), "-f", "json", *args
    )
    return [
        {
            "category": section["category"],
            "items": [
                {
                    "name": item["name"],
                    "amounts": [build.amount(q) for q in item.get("quantity", [])],
                }
                for item in section["items"]
            ],
        }
        for section in sections
    ]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/health":
            return self.send_json(200, {"cookcli": True})
        if url.path == "/api/shopping-list":
            query = parse_qs(url.query)
            ids, scales = query.get("r", []), query.get("x", [])
            if len(ids) != len(scales):
                return self.send_json(400, {"error": "r and x must pair up"})
            try:
                return self.send_json(200, shopping_list(ids, scales))
            except ValueError as err:
                return self.send_json(400, {"error": str(err)})
            except RuntimeError as err:
                return self.send_json(500, {"error": str(err)})
        return super().do_GET()

    def send_json(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    build.build()
    handler = partial(Handler, directory=str(build.OUT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Meal planner at http://localhost:{port}/ (Ctrl+C to stop)")
    print("Restart after adding or editing recipes to pick up the changes.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
