#!/usr/bin/env python3
"""THEOLOGICUS — service local de lecture vocale Supertonic 3.

Pourquoi ce fichier existe
--------------------------
Le moteur vocal de Windows n'expose que les voix INSTALLEES sur la machine. Sur
un poste sans pack francais, WebView2 applique sa voix par DEFAUT — mesure ici :
Microsoft George (en-GB) — et le francais est lu avec un accent anglais. Aucun
correctif cote application ne peut y remedier : il n'y a simplement aucune voix
francaise a utiliser.

Supertonic 3 est un modele ONNX local (licence MIT) qui couvre 31 langues, dont
le francais, le grec et l'arabe. Ce service l'expose en HTTP pour que
l'application — bureau ou APK — demande un WAV sans embarquer 390 Mo.

Le modele n'est PAS telecharge ici : on reutilise le cache deja present dans
~/.cache/supertonic3 (ou --onnx-dir).

Usage
-----
    python tools/start_supertonic.py
    python tools/start_supertonic.py --port 8091 --steps 8
    python tools/start_supertonic.py --onnx-dir C:/autre/chemin/onnx --lazy

Puis dans THEOLOGICUS : Parametres -> LECTURE VOCALE -> Moteur = Supertonic 3,
et renseigner l'URL affichee au demarrage.

Points d'entree
---------------
    GET /health                      etat du service (JSON)
    GET /voices                      styles de voix disponibles (JSON)
    GET /tts?text=...&lang=fr&voice=F1&speed=1.05      audio/wav
    POST /tts   {"text":..., "lang":"fr", "voice":"F1", "speed":1.05}
    GET /                            page de test dans un navigateur

Le helper d'inference (tools/supertonic/helper.py) provient du depot
supertone-oss-archive/supertonic, licence MIT — voir tools/supertonic/LICENSE.
"""

import argparse
import hashlib
import io
import json
import os
import socket
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

try:
    import numpy as np
except ImportError:  # pragma: no cover
    # Le nom de l'interpreteur est dans le message : sans lui, « numpy est
    # requis » envoie chercher au mauvais endroit quand plusieurs Python
    # coexistent sur la machine (c'est arrive, et deux essais y ont ete perdus).
    sys.exit(
        "numpy est requis pour ce service.\n"
        "  interpreteur : %s\n"
        "  a lancer      : \"%s\" -m pip install numpy onnxruntime" % (sys.executable, sys.executable)
    )

try:
    import onnxruntime  # noqa: F401
except ImportError:  # pragma: no cover
    sys.exit(
        "onnxruntime est requis pour ce service.\n"
        "  interpreteur : %s\n"
        "  a lancer      : \"%s\" -m pip install onnxruntime" % (sys.executable, sys.executable)
    )


RACINE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(RACINE, "supertonic"))

try:
    from helper import load_text_to_speech, load_voice_style, chunk_text
except Exception as e:  # pragma: no cover
    sys.exit("helper.py introuvable dans tools/supertonic/ : %s" % e)


CACHE_DEFAUT = os.path.join(os.path.expanduser("~"), ".cache", "supertonic3")
CACHE_AUDIO = os.path.join(RACINE, ".supertonic_cache")
NORMALISER = True

# Les 31 langues de Supertonic 3. 'na' = « langue inconnue » : le modele traite
# alors le texte sans hypothese de langue, ce qui vaut mieux qu'un 'en' faux.
LANGUES = [
    "ar", "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hi",
    "hu", "id", "it", "ja", "ko", "lv", "lt", "pl", "pt", "ro", "ru", "sk", "sl",
    "es", "sv", "tr", "uk", "vi", "na",
]


def horodate(msg):
    print("[%s] %s" % (time.strftime("%H:%M:%S"), msg), flush=True)


def ips_lan():
    """Adresses IPv4 joignables depuis un autre appareil (l'APK sur le Wi-Fi)."""
    out = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        out.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in out and not ip.startswith("127."):
                out.append(ip)
    except Exception:
        pass
    return out


def vers_wav(audio, sr):
    """float32 [-1, 1] mono -> WAV 16 bits, sans dependance externe.

    soundfile n'est pas installe ici, et le module wave de la bibliotheque
    standard suffit : c'est exactement ce que le navigateur attend.
    """
    audio = np.asarray(audio, dtype=np.float32)
    if NORMALISER:
        # Mesure sur ce modele : crete a 9839/32767 (-10 dBFS), donc nettement
        # plus faible que les voix du systeme. Normaliser la crete evite d'avoir
        # a monter le volume a chaque bascule entre voix locale et Supertonic.
        crete = float(np.max(np.abs(audio))) if audio.size else 0.0
        if crete > 1e-4:
            audio = audio * (0.89 / crete)
    audio = np.clip(audio, -1.0, 1.0)
    pcm16 = (audio * 32767.0).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm16.tobytes())
    return buf.getvalue()


class Moteur:
    """Charge le modele une seule fois, puis sert les requetes en serie.

    Le chargement est protege par un verrou : deux requetes simultanees ne
    doivent pas instancier deux fois 390 Mo de graphe ONNX.
    """

    def __init__(self, onnx_dir, voice_dir, steps, speed, use_gpu):
        self.onnx_dir = onnx_dir
        self.voice_dir = voice_dir
        self.steps = steps
        self.speed = speed
        self.use_gpu = use_gpu
        # RLock et non Lock : pret() tient le verrou pendant le chargement, et
        # le prechauffage appele juste apres repasse par style(), qui le
        # redemande. Avec un Lock simple, le serveur se bloquait AVANT
        # serve_forever() : rien n'ecoutait, et le client recevait un refus de
        # connexion au lieu d'une erreur explicite.
        self._verrou = threading.RLock()
        self._tts = None
        self._styles = {}
        self.sample_rate = 44100
        self.duree_chargement = None

    def pret(self):
        with self._verrou:
            if self._tts is None:
                t0 = time.time()
                horodate("chargement du modele ONNX (%s)…" % self.onnx_dir)
                self._tts = load_text_to_speech(self.onnx_dir, self.use_gpu)
                self.sample_rate = int(getattr(self._tts, "sample_rate", 44100))
                self.duree_chargement = time.time() - t0
                horodate("modele charge en %.1f s — %d Hz" % (self.duree_chargement, self.sample_rate))
                self._prechauffer()
            return self._tts

    def _prechauffer(self):
        """La PREMIERE inference paie l'allocation des tenseurs.

        Mesure sur ce poste : 2,6 s de calcul pour 2,8 s d'audio au premier
        appel, puis 1,9 s pour 8,0 s d'audio (RTF 0,24). Sans prechauffage,
        c'est l'utilisateur qui attend ce surcout sur son premier segment.
        """
        try:
            t0 = time.time()
            self.synthetiser_brut("Bonjour.", "fr", "F1", self.speed)
            horodate("prechauffage fait en %.1f s — le premier vrai segment sera rapide" % (time.time() - t0))
        except Exception as e:
            horodate("prechauffage ignore (%s)" % e)

    def synthetiser_brut(self, texte, lang, voix, speed):
        tts = self._tts
        style = self.style(voix)
        wav, duree = tts(texte, lang, style, self.steps, speed)
        n = int(int(tts.sample_rate) * float(duree[0]))
        return np.asarray(wav[0, :n], dtype=np.float32)

    def voix_disponibles(self):
        try:
            return sorted(f[:-5] for f in os.listdir(self.voice_dir) if f.endswith(".json"))
        except Exception:
            return []

    def style(self, nom):
        nom = (nom or "F1").strip()
        if not nom.isalnum():
            nom = "F1"
        with self._verrou:
            if nom not in self._styles:
                chemin = os.path.join(self.voice_dir, nom + ".json")
                if not os.path.exists(chemin):
                    dispo = self.voix_disponibles()
                    chemin = os.path.join(self.voice_dir, (dispo[0] if dispo else "F1") + ".json")
                self._styles[nom] = load_voice_style([chemin], verbose=False)
            return self._styles[nom]

    def synthetiser(self, texte, lang, voix, speed):
        self.pret()
        tts = self._tts
        if speed is None:
            speed = self.speed
        speed = max(0.5, min(2.0, float(speed)))
        morceaux = chunk_text(texte, 300) if len(texte) > 300 else [texte]
        sr = int(tts.sample_rate)
        blocs = []
        for morceau in morceaux:
            audio = self.synthetiser_brut(morceau, lang, voix, speed)
            if audio.size:
                blocs.append(audio)
        if not blocs:
            raise RuntimeError("aucun echantillon produit")
        audio = blocs[0] if len(blocs) == 1 else np.concatenate(blocs)
        return audio, sr


def cle_cache(texte, lang, voix, speed, steps):
    h = hashlib.sha1()
    for partie in (texte, lang, voix, "%.3f" % speed, str(steps)):
        h.update(partie.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


PAGE = """<!DOCTYPE html>
<html lang="fr"><meta charset="utf-8"><title>Supertonic 3 — service local</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}
 code{background:#f1efe8;padding:2px 6px;border-radius:4px}
 input,select,button{font:inherit;padding:8px;margin:4px 0;width:100%;box-sizing:border-box}
 .etat{padding:10px;border-radius:8px;background:#e1f5ee;color:#04342c}
</style>
<h1>Supertonic 3 — service local</h1>
<div class="etat" id="etat">Chargement de l'etat…</div>
<p>Ce service est appele par THEOLOGICUS. Dans l'application :
Parametres &rarr; LECTURE VOCALE &rarr; Moteur = <b>Supertonic 3</b>.</p>
<label>Texte</label>
<textarea id="txt" rows="4">Tres tot, le Seigneur appela Abraham, et il partit sans savoir ou il allait.</textarea>
<label>Langue</label>
<select id="lang"></select>
<label>Voix</label>
<select id="voix"></select>
<p><button onclick="jouer()">Ecouter</button></p>
<audio id="au" controls style="width:100%"></audio>
<script>
fetch('/health').then(r=>r.json()).then(j=>{
  document.getElementById('etat').textContent =
    'En ligne — ' + j.model + ' · ' + j.voices.length + ' voix · ' + j.languages.length + ' langues'
    + (j.loaded ? ' · modele charge' : ' · modele non encore charge');
  var l=document.getElementById('lang'), v=document.getElementById('voix');
  j.languages.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; l.appendChild(o); });
  l.value='fr';
  j.voices.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; v.appendChild(o); });
});
function jouer(){
  var t=document.getElementById('txt').value, l=document.getElementById('lang').value, v=document.getElementById('voix').value;
  document.getElementById('au').src='/tts?text='+encodeURIComponent(t)+'&lang='+l+'&voice='+v;
}
</script>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "THEOLOGICUS-Supertonic/1.0"
    moteur = None
    cache_dir = None
    sans_cache = False

    def log_message(self, fmt, *args):
        horodate("%s %s" % (self.address_string(), fmt % args))

    def _entetes(self, code, type_mime, taille):
        self.send_response(code)
        self.send_header("Content-Type", type_mime)
        self.send_header("Content-Length", str(taille))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _json(self, code, obj):
        corps = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._entetes(code, "application/json; charset=utf-8", len(corps))
        self.wfile.write(corps)

    def _octets(self, code, type_mime, corps):
        self._entetes(code, type_mime, len(corps))
        self.wfile.write(corps)

    def do_OPTIONS(self):
        self._entetes(204, "text/plain", 0)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ("/health", "/"):
            if u.path == "/health":
                return self._json(200, {
                    "ok": True,
                    "service": "supertonic",
                    "model": "Supertonic 3",
                    "loaded": self.moteur._tts is not None,
                    "sample_rate": self.moteur.sample_rate,
                    "voices": self.moteur.voix_disponibles(),
                    "languages": LANGUES,
                    "onnx_dir": self.moteur.onnx_dir,
                })
            corps = PAGE.encode("utf-8")
            return self._octets(200, "text/html; charset=utf-8", corps)
        if u.path == "/voices":
            return self._json(200, {"voices": self.moteur.voix_disponibles()})
        if u.path == "/tts":
            q = parse_qs(u.query)
            return self._synthetiser(
                (q.get("text") or [""])[0],
                (q.get("lang") or ["na"])[0],
                (q.get("voice") or ["F1"])[0],
                (q.get("speed") or [None])[0],
            )
        return self._json(404, {"error": "chemin inconnu", "chemins": ["/health", "/voices", "/tts"]})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/tts":
            return self._json(404, {"error": "chemin inconnu"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            corps = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception as e:
            return self._json(400, {"error": "JSON illisible : %s" % e})
        return self._synthetiser(
            corps.get("text", ""), corps.get("lang", "na"),
            corps.get("voice", "F1"), corps.get("speed"),
        )

    def _synthetiser(self, texte, lang, voix, speed):
        texte = (texte or "").strip()
        if not texte:
            return self._json(400, {"error": "texte vide"})
        lang = (lang or "na").strip().lower()
        if lang not in LANGUES:
            # On ne devine pas : 'na' laisse le modele traiter le texte sans
            # hypothese de langue, plutot que de prononcer avec une bouche fausse.
            lang = "na"
        try:
            vitesse = float(speed) if speed not in (None, "") else self.moteur.speed
        except ValueError:
            vitesse = self.moteur.speed

        empreinte = cle_cache(texte, lang, voix, vitesse, self.moteur.steps)
        chemin = os.path.join(self.cache_dir, empreinte + ".wav") if self.cache_dir else None
        if chemin and not self.sans_cache and os.path.exists(chemin):
            with open(chemin, "rb") as f:
                return self._octets(200, "audio/wav", f.read())

        t0 = time.time()
        try:
            audio, sr = self.moteur.synthetiser(texte, lang, voix, vitesse)
        except Exception as e:
            horodate("ECHEC synthese (%s, %s) : %s" % (lang, voix, e))
            return self._json(500, {"error": "synthese impossible : %s" % e})
        wav = vers_wav(audio, sr)
        if chemin and not self.sans_cache:
            try:
                os.makedirs(self.cache_dir, exist_ok=True)
                with open(chemin, "wb") as f:
                    f.write(wav)
            except Exception:
                pass
        horodate("synthese %s/%s — %d caracteres, %.2f s audio, %.1f s de calcul"
                 % (lang, voix, len(texte), len(audio) / float(sr), time.time() - t0))
        return self._octets(200, "audio/wav", wav)


def main():
    p = argparse.ArgumentParser(description="Service local de lecture vocale Supertonic 3 pour THEOLOGICUS")
    p.add_argument("--host", default="0.0.0.0", help="interface d'ecoute (defaut 0.0.0.0, joignable par l'APK)")
    p.add_argument("--port", type=int, default=8091)
    p.add_argument("--onnx-dir", default=os.path.join(CACHE_DEFAUT, "onnx"))
    p.add_argument("--voice-dir", default=os.path.join(CACHE_DEFAUT, "voice_styles"))
    p.add_argument("--steps", type=int, default=8, help="etapes de denoising (8 = defaut du depot)")
    p.add_argument("--speed", type=float, default=1.05)
    p.add_argument("--use-gpu", action="store_true")
    p.add_argument("--lazy", action="store_true", help="ne pas charger le modele au demarrage")
    p.add_argument("--no-cache", action="store_true", help="ne pas conserver les WAV deja generes")
    p.add_argument("--no-normalize", action="store_true", help="ne pas normaliser la crete a -1 dBFS")
    a = p.parse_args()

    global NORMALISER
    if a.no_normalize:
        NORMALISER = False

    if not os.path.isdir(a.onnx_dir):
        sys.exit(
            "Modele introuvable : %s\n"
            "Telechargez-le une fois avec :\n"
            "  hf download supertone-oss-archive/supertonic-3 --local-dir %s"
            % (a.onnx_dir, CACHE_DEFAUT)
        )
    if not os.path.isdir(a.voice_dir):
        sys.exit("Styles de voix introuvables : %s" % a.voice_dir)

    moteur = Moteur(a.onnx_dir, a.voice_dir, a.steps, a.speed, a.use_gpu)
    Handler.moteur = moteur
    Handler.cache_dir = None if a.no_cache else CACHE_AUDIO
    Handler.sans_cache = a.no_cache

    horodate("THEOLOGICUS — service Supertonic 3")
    horodate("modele   : %s" % a.onnx_dir)
    horodate("voix     : %s" % ", ".join(moteur.voix_disponibles()) or "(aucune)")
    horodate("langues  : %d (fr, el, ar, en, de, es, it, pt, ru…)" % len(LANGUES))
    horodate("cache    : %s" % (Handler.cache_dir or "desactive"))

    if not a.lazy:
        moteur.pret()

    httpd = ThreadingHTTPServer((a.host, a.port), Handler)
    horodate("a l'ecoute sur http://127.0.0.1:%d  (Ctrl+C pour arreter)" % a.port)
    for ip in ips_lan():
        horodate("  depuis un autre appareil : http://%s:%d" % (ip, a.port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        horodate("arret demande.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
