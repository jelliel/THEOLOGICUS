# -*- coding: utf-8 -*-
"""Prouve, sans aucun pont JS, que WebView2 rend bien sur le GPU — et que nos
drapeaux arrivent jusqu'au processus GPU.

Principe : WebView2 lance une arborescence de processus Chromium dont le
processus `--type=gpu-process` dit tout :
  * sa PRESENCE prouve qu'un processus GPU a ete cree ;
  * `--use-angle=d3d11` prouve le rendu materiel via Direct3D 11 ;
  * `--use-angle=swiftshader` ou `--disable-gpu` prouverait le rendu logiciel.

IDENTIFICATION — deux pieges verifies, tous deux m'ont fait ecrire un faux
diagnostic avant d'etre corriges :
  1. Il y a PLUSIEURS WebView2 sur une machine (Office, Copilot, Teams...). Une
     premiere version filtrait sur l'age des processus et a « mesure » le
     gpu-process de M365Copilot.exe, pas celui de l'application. On ne retient
     donc que les processus DESCENDANTS du processus de l'application
     (psutil children(recursive=True)).
  2. Le garde-fou de processus du bac a sable REFUSE de tuer
     msedgewebview2.exe : kill() ne leve pas mais les 12 processus sont
     toujours vivants 3 s plus tard. Aucun nettoyage n'est donc possible ni
     utile — et il ne faut PAS essayer, ces processus appartiennent a d'autres
     applications de l'utilisateur.

Le script se relance lui-meme en mode `--enfant` : c'est le seul moyen
d'installer la sous-classe de proprietes AVANT que pywebview ne cree la
fenetre.

Usage :
    python sonde_processus_gpu.py                  # avec les drapeaux GPU
    python sonde_processus_gpu.py --sans-drapeaux   # tel que livre aujourd'hui
    python sonde_processus_gpu.py --exe <chemin>    # mesurer l'exe installe
"""
import argparse
import json
import os
import subprocess
import sys
import time

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE_DEPOT = os.path.abspath(os.path.join(ICI, "..", "..", "..", ".."))

ARGS_GPU = (
    "--ignore-gpu-blocklist "
    "--enable-gpu-rasterization "
    "--enable-zero-copy "
    "--enable-accelerated-2d-canvas"
)

CIBLES = ("--type=", "--use-angle", "--use-gl", "--disable-gpu",
          "--ignore-gpu-blocklist", "--enable-gpu-rasterization",
          "--enable-zero-copy", "--enable-accelerated-2d-canvas",
          "--webview-exe-name", "--user-data-dir", "--gpu-preferences")


def enfant(sans_drapeaux: bool) -> int:
    """Fils : lance la vraie application, drapeaux GPU en place."""
    sys.path.insert(0, RACINE_DEPOT)
    if not sans_drapeaux:
        import webview.platforms.edgechromium as ec

        Base = ec.CoreWebView2CreationProperties

        class _PropsGPU(Base):
            def __setattr__(self, nom, valeur):
                if nom == "AdditionalBrowserArguments" and isinstance(valeur, str):
                    if "ignore-gpu-blocklist" not in valeur:
                        valeur = (valeur + " " + ARGS_GPU).strip()
                return super().__setattr__(nom, valeur)

        ec.CoreWebView2CreationProperties = _PropsGPU
        print("[enfant] drapeaux GPU installes", flush=True)
    else:
        print("[enfant] aucun drapeau GPU", flush=True)

    import app
    return app.main()


def arbre(psutil, pid: int):
    """Tous les descendants de pid, avec leur ligne de commande."""
    try:
        racine = psutil.Process(pid)
    except Exception:
        return []
    sortie = []
    for p in racine.children(recursive=True):
        try:
            nom = (p.info.get("name") or p.name() or "").lower()
            if nom != "msedgewebview2.exe":
                continue
            cmd = p.info.get("cmdline") or p.cmdline()
            if cmd:
                sortie.append((p.pid, cmd))
        except Exception:
            pass
    return sortie


def inspecter(psutil, pid: int, attente: float = 30.0):
    fin = time.time() + attente
    vus = []
    while time.time() < fin:
        vus = arbre(psutil, pid)
        types = {t for _, c in vus for t in c if t.startswith("--type=")}
        if "gpu-process" in types:
            break
        time.sleep(1.0)
    return vus


def rapport(psutil, pid, vus, sans_drapeaux):
    print("=" * 74)
    print("PROCESSUS WEBVIEW2 DE L'APPLICATION REELLE")
    print("=" * 74)

    types, gpu = {}, None
    for p, cmd in vus:
        t = "?"
        for jeton in cmd:
            if jeton.startswith("--type="):
                t = jeton.split("=", 1)[1]
        types.setdefault(t, []).append(p)
        if t == "gpu-process" and gpu is None:
            gpu = (p, cmd)

    print("  processus par type :", {k: len(v) for k, v in sorted(types.items())})
    infos = {"types": {k: len(v) for k, v in types.items()},
             "drapeaux": "aucun" if sans_drapeaux else ARGS_GPU}

    if gpu is None:
        print("  [X] aucun processus --type=gpu-process dans l'arbre de l'app")
        print("      -> soit rendu logiciel, soit la fenetre ne s'est pas ouverte.")
        infos["gpu_process"] = False
        return infos

    p, cmd = gpu
    infos["gpu_process"] = True
    angle = next((c for c in cmd if c.startswith("--use-angle")), None)
    gl = next((c for c in cmd if c.startswith("--use-gl")), None)
    webview_nom = next((c for c in cmd if c.startswith("--webview-exe-name")), None)
    logiciel = any("swiftshader" in c.lower() for c in cmd)
    desactive = "--disable-gpu" in cmd
    nos = [c for c in cmd if c in ARGS_GPU.split()]

    print("  processus GPU : pid", p)
    print("    hote WebView2        :", webview_nom)
    print("    --use-angle          :", angle)
    print("    --use-gl             :", gl)
    print("    swiftshader ?        :", logiciel)
    print("    --disable-gpu ?      :", desactive)
    print("    nos drapeaux presents:", nos or "aucun")
    print("    ligne de commande complete :")
    print("     ", " ".join(cmd))
    infos.update(angle=angle, use_gl=gl, webview_exe_name=webview_nom,
                 swiftshader=logiciel, disable_gpu=desactive,
                 nos_drapeaux=nos, ligne_de_commande=cmd)

    print("-" * 74)
    materiel = (not logiciel) and (not desactive)
    print("  VERDICT :", "RENDU MATERIEL (GPU)" if materiel
          else "RENDU LOGICIEL (CPU)")
    infos["verdict"] = "materiel" if materiel else "logiciel"
    return infos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--enfant", action="store_true")
    ap.add_argument("--sans-drapeaux", action="store_true")
    ap.add_argument("--exe", default=None)
    ap.add_argument("--sortie", default=None)
    ap.add_argument("--attente", type=float, default=30.0)
    a = ap.parse_args()

    if a.enfant:
        return enfant(a.sans_drapeaux)

    import psutil

    if a.exe:
        proc = subprocess.Popen([a.exe], cwd=os.path.dirname(a.exe))
        print("[parent] exe lance :", a.exe, "pid", proc.pid, flush=True)
    else:
        proc = subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "--enfant"]
            + (["--sans-drapeaux"] if a.sans_drapeaux else []),
            cwd=RACINE_DEPOT)
        print("[parent] app.py lance (pid", proc.pid, ")", flush=True)

    try:
        vus = inspecter(psutil, proc.pid, a.attente)
        infos = rapport(psutil, proc.pid, vus, a.sans_drapeaux)
    finally:
        try:
            racine = psutil.Process(proc.pid)
            for f in racine.children(recursive=True):
                try:
                    f.kill()
                except Exception:
                    pass
            racine.kill()
        except Exception:
            pass
        time.sleep(1.0)

    print("=" * 74)
    if a.sortie:
        with open(a.sortie, "w", encoding="utf-8") as f:
            json.dump(infos, f, ensure_ascii=False, indent=2)
        print("[ok] rapport ->", a.sortie)
    return 0


if __name__ == "__main__":
    sys.exit(main())
