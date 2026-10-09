# -*- coding: utf-8 -*-
"""Liste UNIQUE des dossiers de données embarqués dans les binaires.

Pourquoi ce fichier existe : la liste était recopiée à trois endroits
(`tools/build_windows.py` CORPUS, `tools/prepare_mobile.py` COPY_DIRS, et les
chargements du HTML). Résultat vécu : `biblelt` (Vulgate) et `syriaque`
(Peshitta) étaient chargés par l'application mais ABSENTS des binaires — un
corpus entier muet dans l'app packagée, sans erreur visible.

Règle : un dossier de données présent dans le dépôt DOIT figurer ici, sinon
`tools/verifier_assets.py` échoue (et la CI avec lui).
"""

# Dossiers copiés tels quels dans le build Windows ET dans l'APK.
CORPUS = [
    "bible", "quran", "tafsir", "libs",
    "summa", "summafr", "fathers", "reformed", "orthodox", "islamic",
    "denzinger", "quranwbw", "quranroots",
    "biblehb", "biblegr", "latin",
    "biblelt",    # Vulgate Clémentine (v450)
    "syriaque",   # Peshitta vocalisée + lexique (v451)
    "ffmpeg",     # script worker de ffmpeg.wasm, servi par l'app (v455)
]

# Dossiers qui ressemblent à des données mais ne sont PAS embarqués
# (outillage, artefacts, sources de développement).
IGNORES = [
    "tools", "dist", "android", "build", "output", "node_modules",
    ".git", ".github", ".workbuddy-ai", "__pycache__", "fonts",
    "theo_tests",  # v504 : tests unitaires (outillage, pas un corpus embarqué)
]

# Nombre de tranches attendu par dossier (contrôle de cohérence) :
# préfixe, extension, quantité. Absent = pas de contrôle.
EXPECTED = {
    "bible": ("b", ".js", 66),
    "quran": ("q", ".js", 114),
    "tafsir": ("s", ".js", 114),
    "biblehb": ("b", ".js", 39),
    "biblegr": ("b", ".js", 27),
    "biblelt": ("b", ".js", 66),
    "syriaque": ("b", ".js", 66),
}
