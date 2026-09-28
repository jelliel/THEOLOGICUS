# -*- coding: utf-8 -*-
"""Client CDP minimal en Python (WebSocket RFC 6455, sans dependance).

POURQUOI CE FICHIER EXISTE
--------------------------
Pour lire le moteur de rendu de la WebView2 de THEOLOGICUS il faut parler
CDP. Playwright le ferait, mais **Node ne peut pas ouvrir de connexion TCP
directe vers un port local dans ce bac a sable** : avec les variables de
proxy de l'environnement il obtient un 502 (le proxy refuse la mise a niveau
WebSocket), et sans elles un ECONNREFUSED. Python, lui, se connecte
directement sans probleme (verifie : `HTTP/1.1 200 OK` sur /json/version).
Aucune bibliotheque WebSocket n'est installee : d'ou ce client minimal.

Portee volontairement limitee : trames texte, petites, non fragmentees.
Suffisant pour `Runtime.evaluate` et pour collecter des evenements CDP.
"""
import base64
import json
import os
import socket
import struct
import time
from urllib.parse import urlparse


class CDP:
    def __init__(self, ws_url, timeout=20.0):
        u = urlparse(ws_url)
        self.hote = u.hostname or "127.0.0.1"
        self.port = u.port or 80
        self.chemin = u.path or "/"
        if u.query:
            self.chemin += "?" + u.query
        self.timeout = timeout
        self.sock = None
        self._id = 0
        self._tampon = b""
        self.evenements = []

    # ── Connexion ──
    def connecter(self):
        self.sock = socket.create_connection((self.hote, self.port), timeout=self.timeout)
        cle = base64.b64encode(os.urandom(16)).decode()
        req = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n" % (self.chemin, self.hote, self.port, cle)
        )
        self.sock.sendall(req.encode())
        entete = b""
        while b"\r\n\r\n" not in entete:
            bloc = self.sock.recv(4096)
            if not bloc:
                raise RuntimeError("connexion fermee pendant la poignee de main")
            entete += bloc
        tete, _, reste = entete.partition(b"\r\n\r\n")
        ligne = tete.split(b"\r\n")[0].decode("latin-1")
        if "101" not in ligne:
            raise RuntimeError("poignee de main refusee : " + ligne)
        self._tampon = reste
        return True

    # ── Trames ──
    def _envoyer(self, charge, opcode=1):
        donnees = charge if isinstance(charge, bytes) else charge.encode("utf-8")
        n = len(donnees)
        tete = bytearray([0x80 | opcode])
        if n < 126:
            tete.append(0x80 | n)
        elif n < 65536:
            tete.append(0x80 | 126)
            tete += struct.pack(">H", n)
        else:
            tete.append(0x80 | 127)
            tete += struct.pack(">Q", n)
        masque = os.urandom(4)
        tete += masque
        masque_donnees = bytes(b ^ masque[i % 4] for i, b in enumerate(donnees))
        self.sock.sendall(bytes(tete) + masque_donnees)

    def _lire_exact(self, n):
        while len(self._tampon) < n:
            bloc = self.sock.recv(65536)
            if not bloc:
                raise RuntimeError("connexion fermee")
            self._tampon += bloc
        d, self._tampon = self._tampon[:n], self._tampon[n:]
        return d

    def _lire_trame(self):
        b0, b1 = self._lire_exact(2)
        opcode = b0 & 0x0F
        masque = b1 & 0x80
        n = b1 & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._lire_exact(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._lire_exact(8))[0]
        m = self._lire_exact(4) if masque else b""
        d = self._lire_exact(n) if n else b""
        if masque:
            d = bytes(b ^ m[i % 4] for i, b in enumerate(d))
        return opcode, d

    def recevoir(self):
        """Rend (type, charge). type = 'json' ou 'close'."""
        while True:
            opcode, d = self._lire_trame()
            if opcode == 8:
                return "close", None
            if opcode == 9:            # ping -> pong
                self._envoyer(d, opcode=10)
                continue
            if opcode == 10:           # pong
                continue
            return "json", json.loads(d.decode("utf-8"))

    # ── API CDP ──
    def appeler(self, methode, params=None, timeout=None):
        self._id += 1
        mid = self._id
        self._envoyer(json.dumps({"id": mid, "method": methode, "params": params or {}}))
        limite = time.time() + (timeout or self.timeout)
        while time.time() < limite:
            t, msg = self.recevoir()
            if t == "close":
                raise RuntimeError("connexion fermee par le navigateur")
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (methode, msg["error"]))
                return msg.get("result", {})
            if "method" in msg:
                self.evenements.append(msg)
        raise TimeoutError(methode)

    def evaluer(self, expression, attendre_promesse=False, timeout=None):
        r = self.appeler("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": bool(attendre_promesse),
        }, timeout=timeout)
        res = r.get("result", {})
        if r.get("exceptionDetails"):
            raise RuntimeError("JS : " + json.dumps(r["exceptionDetails"])[:300])
        return res.get("value")

    def collecter(self, secondes):
        """Lit les evenements pendant N secondes (pour LayerTree)."""
        self.evenements = []
        fin = time.time() + secondes
        self.sock.settimeout(0.4)
        try:
            while time.time() < fin:
                try:
                    t, msg = self.recevoir()
                except socket.timeout:
                    continue
                if t == "close":
                    break
                if msg and "method" in msg:
                    self.evenements.append(msg)
        finally:
            self.sock.settimeout(self.timeout)
        return self.evenements

    def fermer(self):
        try:
            self._envoyer(b"", opcode=8)
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass
