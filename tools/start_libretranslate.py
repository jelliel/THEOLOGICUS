# -*- coding: utf-8 -*-
"""Lance un serveur LibreTranslate local, joignable depuis le telephone.

Usage :
  py tools/start_libretranslate.py              # demarre (installe si absent, apres confirmation)
  py tools/start_libretranslate.py --install    # installe sans demander puis demarre
  py tools/start_libretranslate.py --port 5000

Le serveur ecoute sur 0.0.0.0 (toutes les interfaces) pour que l'APK
THEOLOGICUS puisse le decouvrir automatiquement sur le Wi-Fi (bouton
🌐 de la bulle Add-to-chat). Rien ne sort du reseau local.

Pare-feu Windows : si le telephone ne joint pas le serveur, ouvrir une
fois en administrateur :
  netsh advfirewall firewall add rule name="LibreTranslate" dir=in action=allow protocol=TCP localport=5000
"""

import importlib.util
import os
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import warnings

# v63 — ``RequestsDependencyWarning``: urllib3/chardet trop recents pour le
# ``requests`` 2.31.0 laisse par ``pip install --user libretranslate``.
# Cosmetique (le serveur traduit tres bien) mais le message faisait croire a
# une erreur. Pose ici pour le processus parent, et dans ``lt_command()`` pour
# l'enfant : les deux chemins importent ``requests``.
warnings.filterwarnings("ignore", message=".*supported version.*")

PORT = 5000
args = sys.argv[1:]
if "--port" in args:
    PORT = int(args[args.index("--port") + 1])


def have_module(name):
    """Teste la presence SANS importer.

    v63 — un ``__import__("libretranslate")`` executait tout le paquet (et
    ``requests``) dans le processus parent, ce qui declenchait l'avertissement
    avant meme que le filtre de l'enfant ne puisse agir. ``find_spec`` ne fait
    que resoudre le chemin : aucun effet de bord, et bien plus rapide.
    """
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


# ── Adresses locales ────────────────────────────────────────────────────────
# v63 — l'ancienne version faisait confiance a `socket.connect(("8.8.8.8", 80))`
# + `getsockname()` pour trouver « l'IP principale ». Or cette valeur peut
# renvoyer une adresse qui n'est ATTACHEE A AUCUNE interface (bail DHCP perime,
# route transitoire) : le script affichait alors http://192.168.100.8:5000 en
# premier alors que la machine etait en 192.168.100.71. L'utilisateur testait
# forcement la mauvaise URL.
# On n'affiche plus que des IP reellement liees, et on verifie chacune apres
# le demarrage : seules celles qui repondent vraiment sont marquees OK.

_PRIVATE_RE = re.compile(r"^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)")


def _is_usable(ip):
    """Ecarte loopback, APIPA (169.254.x = pas de DHCP) et multicast."""
    if ip.startswith("127.") or ip.startswith("169.254."):
        return False
    return bool(re.match(r"^\d+\.\d+\.\d+\.\d+$", ip))


def bound_ipv4():
    """IPv4 reellement attachees a une interface de la machine."""
    out = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if _is_usable(ip) and ip not in out:
                out.append(ip)
    except OSError:
        pass
    return out


def lan_ips():
    """IP joignables par le telephone : LAN prive d'abord, VPN (Tailscale) ensuite."""
    ips = bound_ipv4()
    if not ips:
        # Repli : l'ancien trick UDP, mais seulement si getaddrinfo n'a rien donne.
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            if _is_usable(ip):
                ips = [ip]
        except OSError:
            pass

    def rank(ip):
        if _PRIVATE_RE.match(ip):
            return 0          # Wi-Fi / Ethernet : le telephone est dessus
        if ip.startswith("100."):
            return 1          # Tailscale (marche meme hors du Wi-Fi)
        return 2

    ips.sort(key=rank)
    return ips


def wait_and_check(ips, port, timeout=30):
    """Interroge /languages sur chaque IP des que le serveur repond.

    Renvoie (ok, ko). Le premier demarrage charge les modeles : on laisse
    jusqu'a `timeout` secondes avant de declarer une adresse morte.
    """
    ok, ko = [], []
    deadline = time.time() + timeout
    while time.time() < deadline:
        for ip in ips:
            if ip in ok:
                continue
            try:
                req = urllib.request.Request("http://%s:%d/languages" % (ip, port))
                with urllib.request.urlopen(req, timeout=2) as r:
                    body = r.read(4)
                if r.status == 200 and body[:2] == b"[{":
                    ok.append(ip)
            except Exception:
                pass
        if len(ok) == len(ips):
            break
        time.sleep(1.5)
    ko = [i for i in ips if i not in ok]
    return ok, ko


def lt_command(port):
    """Commande de lancement du serveur.

    LibreTranslate 1.9.x n'expose PAS de `__main__.py` : lancer
    `python -m libretranslate` echoue avec
      « No module named libretranslate.__main__; 'libretranslate' is a package
         and cannot be directly executed ».
    Le point d'entree officiel est `libretranslate.main:main` (declare dans
    entry_points.txt, expose aussi par le script `libretranslate.exe`).

    v63 — on filtre aussi le `RequestsDependencyWarning` (« urllib3 (2.7.0) or
    chardet (7.6.0)/charset_normalizer(3.5.0) doesn't match a supported
    version! »). C'est purement cosmetique : `pip install --user libretranslate`
    a laisse `requests` 2.31.0 face a des `urllib3`/`chardet` trop recents.
    Le serveur fonctionne parfaitement, mais le message faisait croire a une
    erreur. Le filtre est pose AVANT l'import de requests, sinon il est trop
    tard (l'avertissement part a l'import).
    """
    return [sys.executable, "-c",
            "import warnings;"
            "warnings.filterwarnings('ignore', message='.*supported version.*');"
            "from libretranslate.main import main; main()",
            "--host", "0.0.0.0", "--port", str(port)]


def main():
    if not have_module("libretranslate"):
        print("LibreTranslate n'est pas installe sur ce PC.")
        auto = "--install" in args
        if not auto:
            rep = input("L'installer maintenant ? [O/n] ").strip().lower()
            auto = rep in ("", "o", "oui", "y", "yes")
        if not auto:
            print("Abandon. Installation manuelle :  pip install libretranslate")
            return 1
        print("Installation (premiere fois : quelques minutes, modeles telecharges)...")
        r = subprocess.call([sys.executable, "-m", "pip", "install", "--user", "libretranslate"])
        if r != 0 or not have_module("libretranslate"):
            print("Echec de l'installation. Essayez :  pip install libretranslate")
            return 1

    # Le serveur tourne peut-etre deja (fenetre precedente laissee ouverte).
    deja, _ = wait_and_check(["127.0.0.1"], PORT, timeout=3)
    if deja:
        print()
        print("=" * 60)
        print("  Un serveur repond DEJA sur le port %d." % PORT)
        print("  Inutile d'en lancer un second (waitress refuserait le port).")
        for ip in lan_ips():
            print("    http://%s:%d" % (ip, PORT))
        print("  Fermez cette fenetre, ou relancez avec --port 5001.")
        print("=" * 60)
        print()
        return 0

    ips = lan_ips()
    print()
    print("=" * 60)
    print("  LibreTranslate va demarrer sur le port %d" % PORT)
    if ips:
        print("  Adresses de ce PC (verifiees apres demarrage) :")
        for ip in ips:
            tag = "Wi-Fi/Ethernet" if _PRIVATE_RE.match(ip) else (
                "Tailscale   " if ip.startswith("100.") else "?")
            print("    %-15s %s   http://%s:%d" % (ip, tag, ip, PORT))
    print("  Laissez cette fenetre ouverte pendant l'utilisation.")
    print("=" * 60)
    print()

    cmd = lt_command(PORT)
    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"

    proc = subprocess.Popen(cmd, env=env)

    # Verification en tache de fond : on n'attend pas que l'utilisateur devine
    # quelle URL fonctionne, on la lui dit.
    report = {}

    def check():
        ok, ko = wait_and_check(ips, PORT)
        report["ok"], report["ko"] = ok, ko

    t = threading.Thread(target=check, daemon=True)
    if ips:
        t.start()

    try:
        rc = proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        return 0

    if ips:
        t.join(timeout=1)
        ok, ko = report.get("ok", []), report.get("ko", [])
        print()
        if ok:
            print("  ✅ Repondent : " + ", ".join("http://%s:%d" % (i, PORT) for i in ok))
        if ko:
            print("  ❌ Ne repondent pas : " + ", ".join("http://%s:%d" % (i, PORT) for i in ko))
            print("     -> pare-feu Windows ? Ouvrir en administrateur :")
            print("        netsh advfirewall firewall add rule name=\"LibreTranslate\""
                  " dir=in action=allow protocol=TCP localport=%d" % PORT)
        if ok:
            print()
            print("  Dans l'application : bouton ⚙️ (ou la popup de traduction),")
            print("  saisir UNE SEULE FOIS :  http://%s:%d" % (ok[0], PORT))
            print("  L'auto-decouverte du telephone ne trouve pas toujours le PC :")
            print("  cette URL est ensuite memorisee.")
    return rc


if __name__ == "__main__":
    sys.exit(main())
