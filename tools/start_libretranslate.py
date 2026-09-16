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

import os
import socket
import subprocess
import sys

PORT = 5000
args = sys.argv[1:]
if "--port" in args:
    PORT = int(args[args.index("--port") + 1])


def have_module(name):
    try:
        __import__(name)
        return True
    except ImportError:
        return False


def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips


def lt_command(port):
    """Commande de lancement du serveur.

    LibreTranslate 1.9.x n'expose PAS de `__main__.py` : lancer
    `python -m libretranslate` echoue avec
      « No module named libretranslate.__main__; 'libretranslate' is a package
         and cannot be directly executed ».
    Le point d'entree officiel est `libretranslate.main:main` (declare dans
    entry_points.txt, expose aussi par le script `libretranslate.exe`).
    On passe par `-c` : independant du PATH et du dossier Scripts, donc fiable
    que l'installation soit globale, --user ou dans un venv.
    """
    return [sys.executable, "-c", "from libretranslate.main import main; main()",
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
        print("Installation (premiere fois : quelques minutes, models telecharges)...")
        r = subprocess.call([sys.executable, "-m", "pip", "install", "--user", "libretranslate"])
        if r != 0 or not have_module("libretranslate"):
            print("Echec de l'installation. Essayez :  pip install libretranslate")
            return 1

    ips = lan_ips()
    print()
    print("=" * 56)
    print("  LibreTranslate va demarrer sur le port %d" % PORT)
    print("  Le telephone (meme Wi-Fi) le trouvera tout seul a :")
    for ip in ips:
        print("    -> http://%s:%d" % (ip, PORT))
    print("  Laissez cette fenetre ouverte pendant l'utilisation.")
    print("=" * 56)
    print()

    cmd = lt_command(PORT)
    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    try:
        return subprocess.call(cmd, env=env)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
