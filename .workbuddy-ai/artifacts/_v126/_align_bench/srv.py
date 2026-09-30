"""Petit serveur statique pour la bench d'alignement des annotations.

Sert le contenu de `C:/tmp/theoverify/` sur http://127.0.0.1:8791/.
"""
import http.server
import os
import socketserver
import sys

ROOT = r"C:\tmp\theoverify"
PORT = 8791


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Évite tout cache navigateur entre runs
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Silencieux par défaut, décommenter pour debug
        # sys.stderr.write("[srv] " + (fmt % args) + "\n")
        pass


def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"[srv] root={ROOT} port={PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()