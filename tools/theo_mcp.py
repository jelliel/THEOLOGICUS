#!/usr/bin/env python3
# -*- coding: utf-8 -*-
""" Serveur MCP stdio pour THEOLOGICUS (v693).

Pont VERS l'application, jamais depuis elle : les commandes passent par la
boîte aux lettres LOCALE du proxy (`/theo-control/*`), protégée par
THEO_CONTROL_TOKEN. Le proxy doit tourner avec le MÊME jeton.

Configuration :
    THEO_CONTROL_TOKEN   obligatoire ; jeton partagé avec le proxy
    THEO_CONTROL_URL     défaut http://127.0.0.1:8765

Liste blanche en lecture seule : aucune clé, aucune écriture, aucune
suppression, aucun réglage, aucune exécution de code. C'est volontairement
plus étroit que le plan de contrôle d'OpenMausBot.

Protocole : JSON-RPC 2.0 sur stdio (une requête par ligne).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

URL = (os.environ.get("THEO_CONTROL_URL") or "http://127.0.0.1:8765").rstrip("/")
JETON = os.environ.get("THEO_CONTROL_TOKEN", "")

OUTILS = [
    {"name": "theo_ping", "description": "Vérifie que le pont THEOLOGICUS répond.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "theo_list_conversations", "description": "Liste les conversations (sans contenu).",
     "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 50}}}},
    {"name": "theo_search_conversations", "description": "Cherche une expression dans les conversations et renvoie un extrait borné.",
     "inputSchema": {"type": "object", "required": ["query"], "properties": {"query": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 10}}}},
    {"name": "theo_read_conversation", "description": "Lit les derniers messages d'une conversation (plafonné).",
     "inputSchema": {"type": "object", "required": ["id"], "properties": {"id": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 20}}}},
    {"name": "theo_list_channels", "description": "Liste les canaux d'étude.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "theo_list_agents", "description": "Liste les agents (nom et description).",
     "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 50}}}},
    {"name": "theo_list_routines", "description": "Liste les routines et leur état (actif / prochaine échéance).",
     "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 50}}}},
    {"name": "theo_get_config", "description": "Renvoie modèle, canal et agent courants — jamais de clé API.", "inputSchema": {"type": "object", "properties": {}}},
]

NOMS = {o["name"]: o["name"].replace("theo_", "", 1) for o in OUTILS}


def _requete(chemin, corps=None):
    """POST/GET JSON vers le proxy. Aucune exception ne remonte au client MCP."""
    donnees = None
    if corps is not None:
        donnees = json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(
        URL + chemin,
        data=donnees,
        method="POST" if donnees is not None else "GET",
        headers={"Content-Type": "application/json", "X-Theo-Control-Token": JETON},
    )
    with urllib.request.urlopen(req, timeout=5) as rep:
        return json.loads(rep.read().decode("utf-8", errors="replace"))


def appeler(nom, arguments):
    if not JETON:
        return {"error": "THEO_CONTROL_TOKEN non défini (côté serveur MCP)"}
    cmd = NOMS.get(nom)
    if not cmd:
        return {"error": "outil inconnu"}
    args = arguments if isinstance(arguments, dict) else {}
    try:
        env = _requete("/theo-control/submit", {"command": cmd, "args": args})
        ident = env.get("id")
        if not ident:
            return {"error": "le proxy n'a pas accepté la commande (jeton ou route désactivé)"}
        for _ in range(60):
            rep = _requete("/theo-control/result?id=" + urllib.parse.quote(str(ident)))
            if rep.get("pending"):
                time.sleep(0.2)
                continue
            if rep.get("error"):
                return {"error": rep["error"]}
            return {"result": rep.get("result")}
        return {"error": "délai dépassé — l'application THEOLOGICUS est-elle ouverte ?"}
    except Exception as exc:
        return {"error": "pont indisponible : " + str(exc)}


def repondre(ident, resultat=None, erreur=None):
    msg = {"jsonrpc": "2.0", "id": ident}
    if erreur is not None:
        msg["error"] = {"code": -32603, "message": str(erreur)}
    else:
        msg["result"] = resultat
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def traiter(msg):
    ident = msg.get("id")
    meth = msg.get("method")
    if ident is None:
        return  # notification
    if meth == "initialize":
        repondre(ident, {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "theologicus-mcp", "version": "1.0.0"},
        })
    elif meth == "ping":
        repondre(ident, {})
    elif meth == "tools/list":
        repondre(ident, {"tools": OUTILS})
    elif meth == "tools/call":
        p = msg.get("params") or {}
        sortie = appeler(p.get("name"), p.get("arguments"))
        texte = json.dumps(sortie, ensure_ascii=False)
        repondre(ident, {"content": [{"type": "text", "text": texte}]})
    else:
        repondre(ident, erreur="méthode inconnue : " + str(meth))


def main():
    for ligne in sys.stdin:
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            traiter(json.loads(ligne))
        except Exception as exc:
            try:
                repondre(None, erreur="requête invalide : " + str(exc))
            except Exception:
                pass


if __name__ == "__main__":
    main()
