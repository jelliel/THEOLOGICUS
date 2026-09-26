# THEOLOGICUS — notes long terme

**Ne pas reconstruire ici ce qui vit dans un skill.** Skills :
`theologicus-apk-build`, `theologicus-zindex-guard`, `theologicus-tts-diagnostic`,
`theologicus-code-fragilities`. Journaux `.workbuddy-ai/memory/AAAA-MM-JJ.md` ;
bancs `.workbuddy-ai/artifacts/`. **Version = `git rev-list --count HEAD` → `2.0.<n>`.**

Skills **versionnés** dans `.workbuddy-ai/skills/` (miroir de
`~/.workbuddy-ai/skills/`, hors dépôt). **Le canonique vit dans le
répertoire utilisateur** (`~/.workbuddy-ai/skills/`) ; le repo n'en est que
le MIROIR. `tools/sync_skills.py` copie **Source (user) → Miroir (repo)**
— donc **éditer directement `.workbuddy-ai/skills/…/SKILL.md` puis lancer
`sync_skills` ÉCRASE l'ajout** avec la version user (sans la leçon). Bon
flux : éditer `~/.workbuddy-ai/skills/…/SKILL.md`, puis `sync_skills.py`
miroite, puis `git add .workbuddy-ai/skills/`. `tools/githooks/pre-commit`
vérifie ce miroir **à chaque commit**, plus secrets indexés, clés par nom,
syntaxe JS du HTML. Clone neuf : `python tools/install_hooks.py`
(`core.hooksPath` ne voyage pas).

## Règles qui coûtent cher

- **`tools/sync_html.py` après CHAQUE correctif** (4 copies) : non synchronisé =
  invisible. L'exe lit le HTML **sur le disque**.
- **Commit + push à CHAQUE correctif** (`jelliel/THEOLOGICUS`, `main`, anglais).
  **Jamais `git stash`**.
- **Clé `~/.workbuddy-ai/keys/theologicus-release.jks` : ne jamais remplacer.**
- Config survivant à une MAJ → `%LOCALAPPDATA%/THEOLOGICUS/`, jamais l'install.
- **Port STABLE 8765–8780** (deux ports = deux stockages navigateur). Binder d'abord.
- **Aucun processus de fond ne survit à l'invocation qui l'a lancé** (relais, MPT)
  → `tools/run_benches.py` possède le relais (voir « Bancs »).

## Application

`THEOLOGICUS.html` ~1,65 Mo, **59 `<script>`**, **LF**. **`THEO_CORPORA` pilote
tout** ; `summafr` id `1001` hors `THEO_CORPORA`. Capacitor 8, `com.theologicus.app`.
Accès DOM : `_STU`/`_set` = `getElementById` ; **`$(id)` sans `#`** est un piège.

## Modals à onglets (PARAMÈTRES 5 · STUDIO 6)

**Cacher par `hidden`, jamais `display:none` en ligne.** Un `display:none` en ligne
sur une vue INTERNE (`#studio-form`/`-progress`/`-result`) laisse un panneau
visible mais **vide** : restaurer l'état à **chaque ouverture**. Un `<!--` fermé
par `*/` avale tout jusqu'au prochain `-->` : présent dans les octets, **absent du
DOM**. Test de connexion PARAMÈTRES = `resolveModelConfig()`, le chemin réel.

## MPT

**Aucune route de configuration** → THEOLOGICUS édite `config.toml` : ligne à
ligne, liste blanche, clés inconnues **signalées et jamais écrites**, ajout dans
`[app]`. Clés de banques = **listes** TOML. **Un fournisseur sans zone n'a d'adresse
nulle part.** Le service est un **voisin** (« non détecté » est vrai) : 2 s sur
**8080**, `/ping` → `pong`. **Prouver l'identité** (`pong` seul) ; **`_boucle_locale()`
indispensable** sinon `http_proxy`=53051 rend un 502 qui ressemble à une réponse.
`mpt_lancer()` rend `lance:true` **avant** que MPT réponde → sonder la condition.

## Sources de médias (v126)

11 sources, 4 groupes (`stock` 3 · `ia` 6 · `image` 1 · `local` 1), via
`GET /mpt/sources`. **Chaque clé porte un lien « Get API Key »** `target=_blank`
`rel=noopener noreferrer`. Fiches IA **construites par le service**. **Un champ hors
`#studio-modal` n'est jamais enregistré, sans erreur** (c'est le sélecteur balayé).
La note « source payante » doit suivre le **`change`**, pas le remplissage.

## Bancs

`tools/run_benches.py [--mpt] [--port N] [--keep] banc…` lance le relais, attend
par **CONDITION**, exécute, referme.

- **Un banc part de l'état qu'il prétend tester** : `verify_service_lifecycle` et
  `verify_studio_autostart` exigent MPT **ARRÊTÉ** (les lancer avec `--mpt` donne
  32/35 et 15/18 qui accusent l'app **à tort**) ; les autres exigent `--mpt`.
- Scores : v126 137/137 + 109/109 · v125 35/35 + 56/56 · v124 35/35 + 18/18 ·
  v123 78/78 · v122 71/71 · v120 57/57 + 14/14.
- Attendre la **CONDITION**, jamais un délai fixe. **Une assertion périmée encode
  un ancien défaut** : corriger le banc. **Une sonde 404 n'est pas une erreur**
  (`version.txt` → « dev ») : filtrer ce bruit précis.
- node : `NODE_PATH=…/node/workspace/node_modules` **en ligne** ; Chromium
  `ms-playwright/chromium-1234`. Déverrouillage : `localStorage['theologicus_remember']`
  = SHA-256(`remember:`+`AUTH_HASH`). Poser `theologicus_wizard_skipped='1'` sinon
  l'assistant intercepte les clics.

## Divers

TTS : sortie unique `ttsEmission()` ; **latin lu en français : voulu, question
close** ; **`[slowly]`/`[softly]` proscrits** ; quota ElevenLabs épuisé 2026-10-24.
**Zéro littéral numérique hors modal** ; une seule échelle z-index nommée.
Voisins : Supertonic 8091, LibreTranslate, MPT 8080. **Parité MPT** : suivre
EXACTEMENT `VideoParams`, chaînes vides **omises**.
