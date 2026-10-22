# -*- coding: utf-8 -*-
"""Extrait du store REEL un chat contenant des figures SANS ancre, avec son
texte d'origine, pour le rejouer dans le navigateur sans toucher a la donnee
de l'utilisateur (lecture seule, ecriture dans un JSON de banc)."""
import io, json, os, sys

STORE = os.path.join(os.environ["LOCALAPPDATA"], "THEOLOGICUS", "theologicus_store.json")
raw = io.open(STORE, encoding="utf-8").read()
data = json.loads(raw)
keys = data.get("keys") or {}
print("cles:", len(keys))

best = None
for k, v in keys.items():
    if not k.startswith("chat::"):
        continue
    try:
        chat = json.loads(v["v"] if isinstance(v, dict) else v)
    except Exception:
        continue
    msgs = chat.get("messages") or []
    for m in msgs:
        sh = m.get("shapes") or []
        if not sh:
            continue
        sans = [f for f in sh if not f.get("ancre")]
        ancres = [f for f in sh if f.get("ancre")]
        if len(sans) >= 2 and m.get("content"):
            cand = {
                "chatId": chat.get("id") or k.split("::", 1)[1],
                "title": chat.get("title"),
                "msgTs": m.get("ts"),
                "content": m["content"],
                "shapes": sh,
                "nantres": len(ancres),
                "nsans": len(sans),
            }
            score = (len(sans), len(m["content"]))
            if best is None or score > best[0]:
                best = (score, cand)

if not best:
    sys.exit("aucun chat avec figures sans ancre")

c = best[1]
print("chat retenu :", c["chatId"])
print("  titre      :", c["title"])
print("  msgTs      :", c["msgTs"])
print("  texte      :", len(c["content"]), "caracteres")
print("  figures    :", len(c["shapes"]), "(sans ancre:", c["nsans"], "/ avec:", c["nantres"], ")")
f = c["shapes"][0]
print("  1re figure :", {kk: f.get(kk) for kk in ("id", "x", "y", "w", "h", "shape", "ancre")})

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "real_chat.json")
io.open(out, "w", encoding="utf-8").write(json.dumps(c, ensure_ascii=False))
print("ecrit ->", out)
