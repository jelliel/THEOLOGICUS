# -*- coding: utf-8 -*-
"""Verifie qu'on peut AJOUTER des drapeaux Chromium a WebView2 sans toucher
au code de pywebview.

Pourquoi c'est necessaire : pywebview fait

    props.AdditionalBrowserArguments = '--disable-features=ElasticOverscroll'
    ...
    props.AdditionalBrowserArguments += ' --allow-file-access-from-files'

c'est-a-dire une AFFECTATION. La variable d'environnement documentee par
Microsoft (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS) est donc ecrasee et sans
effet. Il faut intercepter l'affectation.

Ce script ne lance AUCUNE fenetre : il instancie la classe de proprietes et
verifie que le setter concatene bien nos drapeaux.
"""
import sys

import webview.platforms.edgechromium as ec

ARGS_GPU = (
    "--ignore-gpu-blocklist "
    "--enable-gpu-rasterization "
    "--enable-zero-copy "
    "--enable-accelerated-2d-canvas"
)

Base = ec.CoreWebView2CreationProperties


class _PropsGPU(Base):
    """Concatene nos drapeaux a chaque affectation de AdditionalBrowserArguments.

    On n'ecrase pas : on AJOUTE. Ainsi les arguments de pywebview
    (--disable-features=ElasticOverscroll, --allow-file-access-from-files,
    --remote-debugging-port) sont conserves.
    """

    def __setattr__(self, nom, valeur):
        if nom == "AdditionalBrowserArguments" and isinstance(valeur, str):
            if "ignore-gpu-blocklist" not in valeur:
                valeur = (valeur + " " + ARGS_GPU).strip()
        return super().__setattr__(nom, valeur)


def main() -> int:
    ec.CoreWebView2CreationProperties = _PropsGPU

    p = ec.CoreWebView2CreationProperties()
    p.AdditionalBrowserArguments = "--disable-features=ElasticOverscroll"
    a = p.AdditionalBrowserArguments
    print("apres affectation 1 :", a)

    p.AdditionalBrowserArguments += " --allow-file-access-from-files"
    b = p.AdditionalBrowserArguments
    print("apres affectation 2 :", b)

    ok = True

    def verif(nom, cond):
        nonlocal ok
        ok = ok and bool(cond)
        print(("  [OK]   " if cond else "  [ECHEC] ") + nom)

    verif("les drapeaux GPU sont presents", "ignore-gpu-blocklist" in a)
    verif("les arguments de pywebview sont conserves",
          "ElasticOverscroll" in a and "allow-file-access-from-files" in b)
    verif("aucun doublon apres la seconde affectation",
          b.count("ignore-gpu-blocklist") == 1)
    verif("aucun drapeau desactivant le GPU",
          "--disable-gpu" not in a and "disable-gpu-compositing" not in a)
    verif("la classe est bien celle vue par EdgeChrome",
          ec.CoreWebView2CreationProperties is _PropsGPU)

    print("\nRESULTAT :", "OK" if ok else "ECHEC")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
