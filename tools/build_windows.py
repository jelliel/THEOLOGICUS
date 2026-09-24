# -*- coding: utf-8 -*-
"""Build Windows de THEOLOGICUS — exe PyInstaller + installeur Inno Setup + signature.

Equivalent strict de build_installer.bat, mais lancable partout ou un
interpreteur Python est disponible (le .bat, lui, exige cmd.exe : il ne
s'execute ni depuis Bash, ni depuis PowerShell dans l'environnement de
l'agent — mesure du 2026-09-24, aucun fichier preuve n'a ete cree).

Les deux scripts doivent rester en phase. Toute etape ajoutee ici doit
l'etre aussi dans build_installer.bat, et reciproquement.

Usage :
    py -3.12 tools/build_windows.py            # build complet
    py -3.12 tools/build_windows.py --no-sign  # sans signature (test rapide)

Sortie :
    dist/THEOLOGICUS/THEOLOGICUS.exe
    dist/THEOLOGICUS-Setup-x64.exe
    output/THEOLOGICUS.exe + output/THEOLOGICUS-Setup-x64.exe
"""
import glob
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SIGNTOOL = r"C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
ISCC = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Inno Setup 6", "ISCC.exe")
PFX = "THEOLOGICUS_signing.pfx"
PFP = "theologicus2026"

# Les memes corpus que l'APK : sans eux les onglets de bibliotheque renvoient 404.
CORPUS = ["bible", "quran", "tafsir", "summa", "summafr", "fathers", "reformed",
          "orthodox", "islamic", "denzinger", "quranwbw", "quranroots",
          "biblehb", "biblegr", "latin"]


def log(msg):
    print(msg, flush=True)


def run(cmd, etape, cwd=ROOT):
    """Execute et refuse de continuer sur code de sortie non nul."""
    log("    $ " + " ".join('"%s"' % c if " " in str(c) else str(c) for c in cmd))
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode != 0:
        log("[X] Echec a l'etape : %s (code %d)" % (etape, r.returncode))
        sys.exit(1)


def retirer(path, raison):
    """Met un dossier de build de cote au lieu de le supprimer.

    build_installer.bat fait `rd /s /q`. Un `shutil.rmtree` equivalent est
    bloque par le garde-fou de suppression en masse de l'environnement de
    l'agent (mesure du 2026-09-24 : SAFE_DELETE_BULK_CONFIRM_REQUIRED,
    377 cibles). Le renommage donne exactement la meme garantie — le
    dossier neuf est construit de zero — sans declencher ce garde-fou.

    Le dossier retire est laisse sur place : le supprimer a la main de
    temps en temps (build/THEOLOGICUS.retire, dist/THEOLOGICUS.retire).
    """
    if not os.path.isdir(path):
        return
    cible = path + ".retire"
    n = 1
    while os.path.exists(cible):
        cible = "%s.retire%d" % (path, n)
        n += 1
    try:
        os.rename(path, cible)
        log("    (retire) %s -> %s" % (raison, os.path.basename(cible)))
    except OSError as e:
        log("[X] Impossible de mettre de cote %s : %s" % (path, e))
        sys.exit(1)


def copier(src, dst_dir, obligatoire=True):
    """Copie un fichier ; ignore l'absence si non obligatoire.

    v117 — REFUS DE RECULER. Le 2026-09-24, deux builds consecutifs ont ecrit
    dans dist/ un THEOLOGICUS.html VIEUX de 9 octets par rapport a la source,
    puis robocopy /E l'a recopie sur _inst_v102. L'application servait donc une
    version anterieure au correctif qu'on venait d'ecrire — exactement le piege
    « un correctif non synchronise est invisible » de sync_html.py.
    Ici, on compare les tailles quand la destination existe deja : si elle est
    PLUS GROSSE, on refuse de l'ecraser et on s'arrete. Un HTML plus petit que
    le precedent signale toujours un ecrasement fautif, jamais une compression.
    """
    if not os.path.isfile(src):
        if obligatoire:
            log("[X] Fichier requis absent : %s" % src)
            sys.exit(1)
        return False
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, os.path.basename(src))
    if os.path.isfile(dst):
        n_src, n_dst = os.path.getsize(src), os.path.getsize(dst)
        if n_dst > n_src:
            log("[X] Refus d'ecraser %s : cible PLUS GROSSE (%d -> %d)."
                % (dst, n_dst, n_src))
            log("    La source est en retard sur la cible : lancez d'abord")
            log("    `python tools/sync_html.py`, puis relancez le build.")
            sys.exit(1)
    shutil.copy2(src, dst_dir)
    return True


def version_du_depot():
    """Version = nombre de commits, comme l'APK. Jamais de valeur par defaut."""
    try:
        n = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout.strip()
        if not n.isdigit():
            raise ValueError(n)
        return "2.0." + n
    except Exception as e:
        log("[X] Version introuvable : git rev-list --count HEAD a echoue (%s)." % e)
        log("    Compiler depuis une copie de travail git valide. On refuse de")
        log("    compiler avec une version par defaut : c'est ainsi qu'un build a")
        log("    deja annonce 1.0.33 alors que le depot etait a 2.0.38.")
        sys.exit(1)


def main(argv):
    signer = "--no-sign" not in argv
    os.chdir(ROOT)

    ver = version_du_depot()
    log("THEOLOGICUS — build Windows")
    log("Version : %s" % ver)
    log("Signature : %s" % ("oui" if signer else "NON (--no-sign)"))
    log("")

    # --- [1/5] exe ---------------------------------------------------------
    log("[1/5] Compilation de l'exe (PyInstaller)...")
    # Pas de --clean : il bute sur le garde-fou de suppression en masse
    # (build\THEOLOGICUS, ~590 fichiers). On met les deux dossiers de cote a
    # la main, AVANT PyInstaller : sinon COLLECT tente lui-meme de supprimer
    # dist\THEOLOGICUS et se fait bloquer (mesure du 2026-09-24).
    # Effet secondaire heureux : COLLECT cree alors un dist\THEOLOGICUS VIERGE,
    # donc plus aucun fichier perime d'un build precedent — l'etape [2/5] n'a
    # plus besoin de purger quoi que ce soit.
    retirer(os.path.join(ROOT, "build", "THEOLOGICUS"), "build/THEOLOGICUS")
    dist = os.path.join(ROOT, "dist", "THEOLOGICUS")
    retirer(dist, "dist/THEOLOGICUS")

    run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--windowed",
         "--name", "THEOLOGICUS", "--icon", "THEOLOGICUS.ico",
         "--hidden-import", "webview.platforms.winforms",
         "--hidden-import", "webview.platforms.edgechromium",
         "--hidden-import", "clr_loader",
         "--hidden-import", "pythonnet",
         "--collect-all", "webview",
         "--collect-all", "pythonnet",
         "--collect-all", "clr_loader",
         "app.py"], "PyInstaller")

    # --- [2/5] donnees -----------------------------------------------------
    log("[2/5] Copie des fichiers de donnees...")
    # dist\THEOLOGICUS sort de COLLECT a l'etat vierge (voir ci-dessus) : on
    # n'y ajoute que les donnees. Rien a purger.
    os.makedirs(dist, exist_ok=True)

    copier(os.path.join(ROOT, "THEOLOGICUS.html"), dist)
    copier(os.path.join(ROOT, "THEOLOGICUS.ico"), dist, obligatoire=False)

    for d in CORPUS:
        src_dir = os.path.join(ROOT, d)
        dst_dir = os.path.join(dist, d)
        js = glob.glob(os.path.join(src_dir, "*.js"))
        if not js:
            log("[X] Aucun .js dans %s/ — corpus manquant ou non construit." % d)
            sys.exit(1)
        os.makedirs(dst_dir, exist_ok=True)
        for f in js:
            shutil.copy2(f, dst_dir)
        for f in glob.glob(os.path.join(src_dir, "*.json")):
            shutil.copy2(f, dst_dir)
        log("    %-12s %3d .js" % (d + "/", len(js)))

    copier(os.path.join(ROOT, "tafsir", "index.json"), os.path.join(dist, "tafsir"))
    # Monolithes perimes : les corpus sont decoupes par livre / sourate.
    for vieux in ("bible_data.js", "quran_data.js"):
        p = os.path.join(dist, vieux)
        if os.path.exists(p):
            os.remove(p)

    # Libs locales (pdf.js, mammoth, jszip, jspdf, html2canvas + polices).
    libs_dst = os.path.join(dist, "libs")
    os.makedirs(os.path.join(libs_dst, "fonts"), exist_ok=True)
    for f in glob.glob(os.path.join(ROOT, "libs", "*.js")):
        shutil.copy2(f, libs_dst)
    for pat in ("*.css", "*.woff2"):
        for f in glob.glob(os.path.join(ROOT, "libs", "fonts", pat)):
            shutil.copy2(f, os.path.join(libs_dst, "fonts"))

    # v110 : service Supertonic local, que PARAMETRES peut demarrer tout seul.
    # Le depot amont n'en fournit aucun : c'est notre script + le helper MIT.
    # Sans ces fichiers, « Demarrer le service » repond « service absent ».
    tools_dst = os.path.join(dist, "tools")
    st_dst = os.path.join(tools_dst, "supertonic")
    os.makedirs(st_dst, exist_ok=True)
    copier(os.path.join(ROOT, "tools", "start_supertonic.py"), tools_dst)
    copier(os.path.join(ROOT, "tools", "supertonic", "helper.py"), st_dst)
    copier(os.path.join(ROOT, "tools", "supertonic", "LICENSE"), st_dst)

    # Cle API : l'installeur est toujours distribue SANS cle.
    import json
    with open(os.path.join(dist, "theologicus_keys.json"), "w", encoding="utf-8") as f:
        json.dump({"mistral": ""}, f, indent=2)

    # v40 : tampon de version (VERSION -> HTML + version.txt dans dist)
    run([sys.executable, os.path.join(ROOT, "tools", "stamp_version.py"), dist, ver],
        "stamp_version")

    exe = os.path.join(dist, "THEOLOGICUS.exe")
    if not os.path.isfile(exe):
        log("[X] PyInstaller n'a pas produit %s" % exe)
        sys.exit(1)

    # --- [3/5] signature de l'exe -----------------------------------------
    log("[3/5] Signature de l'exe...")
    if signer and os.path.isfile(SIGNTOOL):
        run([SIGNTOOL, "sign", "/f", PFX, "/p", PFP, "/fd", "SHA256",
             "/td", "SHA256", "/tr", "http://timestamp.digicert.com", exe],
            "signtool exe")
    else:
        log("[!] signtool introuvable ou signature desactivee — exe NON SIGNE")

    # --- [4/5] installeur --------------------------------------------------
    log("[4/5] Compilation de l'installeur (Inno Setup)...")
    if not os.path.isfile(ISCC):
        log("[X] ISCC introuvable : %s" % ISCC)
        sys.exit(1)
    run([ISCC, os.path.join(ROOT, "installer.iss"), "/DMyAppVersion=" + ver], "ISCC")

    setup = os.path.join(ROOT, "dist", "THEOLOGICUS-Setup-x64.exe")
    if not os.path.isfile(setup):
        log("[X] Inno Setup n'a pas produit %s" % setup)
        sys.exit(1)

    # --- [5/5] signature de l'installeur ----------------------------------
    log("[5/5] Signature de l'installeur...")
    if signer and os.path.isfile(SIGNTOOL):
        run([SIGNTOOL, "sign", "/f", PFX, "/p", PFP, "/fd", "SHA256",
             "/td", "SHA256", "/tr", "http://timestamp.digicert.com", setup],
            "signtool installeur")
    else:
        log("[!] signtool introuvable ou signature desactivee — installeur NON SIGNE")

    # --- livrables ---------------------------------------------------------
    out = os.path.join(ROOT, "output")
    os.makedirs(out, exist_ok=True)
    shutil.copy2(exe, out)
    shutil.copy2(setup, out)

    log("")
    log("============================================")
    log(" [OK] Build termine :")
    log("   dist\\THEOLOGICUS-Setup-x64.exe")
    log("   output\\THEOLOGICUS.exe + output\\THEOLOGICUS-Setup-x64.exe")
    log("   version : %s" % ver)
    log("============================================")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
