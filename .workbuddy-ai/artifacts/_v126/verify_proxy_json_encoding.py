"""v126k — prove the local relay preserves JSON decoding semantics.

The upstream fixture deliberately returns gzip-compressed JSON. The relay
must request identity and, if compression is still returned, forward
Content-Encoding so a browser can decode response.json().
"""
import gzip
import json
import os
import sys
import threading
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen

ROOT = r"C:\Theologicus"
UPSTREAM_PORT = 8770
RELAY_PORT = 8771
sys.path.insert(0, ROOT)
import proxy_server

PAYLOAD = b'{"choices":[{"message":{"content":"commentaire valide"}}]}'


class Upstream(BaseHTTPRequestHandler):
    def do_POST(self):
        body = gzip.compress(PAYLOAD)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def main():
    upstream = ThreadingHTTPServer(("127.0.0.1", UPSTREAM_PORT), Upstream)
    proxy_server.SERVE_DIR = ROOT
    handler = partial(proxy_server.CORSProxyHandler, directory=ROOT)
    relay = ThreadingHTTPServer(("127.0.0.1", RELAY_PORT), handler)
    threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in (upstream, relay)]
    for t in threads:
        t.start()
    try:
        target = f"http://127.0.0.1:{UPSTREAM_PORT}/completion"
        req = Request(
            f"http://127.0.0.1:{RELAY_PORT}/proxy/{target}",
            method="POST",
            data=b"{}",
            headers={"Content-Type": "application/json"},
        )
        with urlopen(req, timeout=10) as response:
            raw = response.read()
            encoding = response.headers.get("Content-Encoding")
        decoded = gzip.decompress(raw) if encoding == "gzip" else raw
        data = json.loads(decoded.decode("utf-8"))
        ok = data["choices"][0]["message"]["content"] == "commentaire valide"
        print(f"  [{'OK' if ok else 'ECHEC'}] JSON relayé et décodable")
        print(f"  encodage réponse : {encoding or 'identity'}")
        print("RESULTAT : 1/1" if ok else "RESULTAT : 0/1")
        return 0 if ok else 1
    finally:
        relay.shutdown()
        upstream.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
