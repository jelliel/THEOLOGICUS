"""Tests du relais FreeLLMAPI (v486 — cible dynamique + santé + démarrage).

On démarre LE VRAI CORSProxyHandler sur un port libre, et un stub routeur
FreeLLMAPI sur un autre port. Les requêtes passent par le relais /fla/<host>:<port>/
(comme le ferait l'app servie par le proxy) et par /freellmapi/status et
/freellmapi/start.
"""
import http.client
import http.server
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import proxy_server as P  # noqa: E402


class _StubHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _ping(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def do_GET(self):
        if self.path.startswith("/api/ping"):
            self._ping()
            return
        if self.path.startswith("/v1/models"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("X-Routed-Via", "groq/llama-3.3-70b")
            self.end_headers()
            self.wfile.write(json.dumps({"data": [
                {"id": "auto", "object": "model"},
                {"id": "fusion", "object": "model"},
                {"id": "groq/llama-3.3-70b", "object": "model"},
            ]}).encode())
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path.startswith("/v1/chat/completions"):
            n = int(self.headers.get("Content-Length", 0) or 0)
            self.rfile.read(n)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("X-Routed-Via", "groq/llama-3.3-70b")
            self.end_headers()
            self.wfile.write(b'data: {"ok":true}\n\n')
            return
        self.send_response(404)
        self.end_headers()


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def _start_stub(port):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), _StubHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def _start_proxy():
    port = _free_port()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), P.CORSProxyHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def _get(port, path, method="GET", body=None, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read()
    c.close()
    return r.status, dict(r.getheaders()), data


class FlaRelayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.router_port = _free_port()
        cls.router = _start_stub(cls.router_port)
        cls.proxy, cls.proxy_port = _start_proxy()
        # laisser le serveur s'installer
        time.sleep(0.3)

    def addr(self):
        return "127.0.0.1:%d" % self.router_port

    # 1. relais GET /models (cible dynamique portée par l'URL)
    def test_relay_models_get(self):
        st, hd, body = _get(self.proxy_port,
                            "/fla/%s/v1/models" % self.addr())
        self.assertEqual(st, 200, body)
        self.assertEqual(hd.get("X-Theo-Fla"), "1")
        self.assertEqual(hd.get("X-Routed-Via"), "groq/llama-3.3-70b")
        j = json.loads(body)
        self.assertIn("data", j)

    # 2. relais POST /chat/completions (SSE + en-tête copié)
    def test_relay_chat_post(self):
        st, hd, body = _get(self.proxy_port,
                            "/fla/%s/v1/chat/completions" % self.addr(),
                            method="POST", body=b'{}',
                            headers={"Content-Type": "application/json"})
        self.assertEqual(st, 200, body)
        self.assertEqual(hd.get("X-Theo-Fla"), "1")
        self.assertEqual(hd.get("X-Routed-Via"), "groq/llama-3.3-70b")

    # 3. garde anti-SSRF : une cible NON bouclage est refusée (pas de connexion)
    def test_ssrf_guard(self):
        st, hd, body = _get(self.proxy_port, "/fla/1.2.3.4:80/foo")
        self.assertNotEqual(st, 200)
        self.assertIn(b"anti-SSRF", body)  # le serveur nomme la raison

    # 4. santé : routeur debout
    def test_status_up(self):
        st, hd, body = _get(self.proxy_port,
                            "/freellmapi/status?addr=%s" % self.addr())
        self.assertEqual(st, 200)
        j = json.loads(body)
        self.assertTrue(j["up"], j)
        self.assertEqual(j["addr"], self.addr())

    # 5. santé : routeur éteint
    def test_status_down(self):
        dead = "127.0.0.1:%d" % _free_port()  # port libre = rien dessus
        st, hd, body = _get(self.proxy_port, "/freellmapi/status?addr=%s" % dead)
        self.assertEqual(st, 200)
        j = json.loads(body)
        self.assertFalse(j["up"], j)

    # 6. démarrage : validation adresse non-bouclage
    def test_start_addr_invalide(self):
        st, hd, body = _get(self.proxy_port, "/freellmapi/start",
                            method="POST",
                            body=json.dumps({"addr": "8.8.8.8:80", "cmd": "x"}).encode(),
                            headers={"Content-Type": "application/json"})
        self.assertEqual(st, 200)
        j = json.loads(body)
        self.assertFalse(j["ok"])
        self.assertEqual(j["reason"], "addr-invalide")

    # 7. démarrage : commande vide refusée
    def test_start_cmd_vide(self):
        st, hd, body = _get(self.proxy_port, "/freellmapi/start",
                            method="POST",
                            body=json.dumps({"addr": self.addr(), "cmd": ""}).encode(),
                            headers={"Content-Type": "application/json"})
        self.assertEqual(st, 200)
        j = json.loads(body)
        self.assertFalse(j["ok"])
        self.assertEqual(j["reason"], "cmd-vide")

    # 8. démarrage RÉEL : on lance un second stub via la route, on sonde,
    #    et on prouve que le relais le joint.
    def test_start_real_spawn(self):
        port2 = _free_port()
        addr2 = "127.0.0.1:%d" % port2
        stub_src = (
            "import sys,http.server,json\n"
            "port=int(sys.argv[1])\n"
            "class H(http.server.BaseHTTPRequestHandler):\n"
            "    def log_message(self,*a): pass\n"
            "    def do_GET(self):\n"
            "        if self.path.startswith('/api/ping'):\n"
            "            self.send_response(200);self.end_headers();"
            "self.wfile.write(b'{\"status\":\"ok\"}');return\n"
            "        self.send_response(404);self.end_headers()\n"
            "http.server.ThreadingHTTPServer(('127.0.0.1',port),H).serve_forever()\n"
        )
        f = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False)
        f.write(stub_src)
        f.close()
        cmd = '"%s" "%s" %d' % (sys.executable, f.name, port2)
        try:
            st, hd, body = _get(self.proxy_port, "/freellmapi/start",
                                method="POST",
                                body=json.dumps({"addr": addr2, "cmd": cmd}).encode(),
                                headers={"Content-Type": "application/json"})
            self.assertEqual(st, 200, body)
            j = json.loads(body)
            self.assertTrue(j["ok"], j)
            # sonder jusqu'à ce que le routeur réponde (max ~12 s)
            up = False
            for _ in range(24):
                s2, _, b2 = _get(self.proxy_port, "/freellmapi/status?addr=%s" % addr2)
                if s2 == 200 and json.loads(b2).get("up"):
                    up = True
                    break
                time.sleep(0.5)
            self.assertTrue(up, "le routeur lancé n'a pas répondu")
            # le relais le rejoint
            s3, h3, b3 = _get(self.proxy_port, "/fla/%s/api/ping" % addr2)
            self.assertEqual(s3, 200, b3)
        finally:
            proc = P._fla.get("proc")
            if proc is not None:
                try:
                    proc.kill()
                except Exception:
                    pass
                P._fla["proc"] = None
            try:
                os.unlink(f.name)
            except Exception:
                pass


if __name__ == "__main__":
    unittest.main(verbosity=2)
