# Skills THEOLOGICUS — copies versionnées

Ces quatre dossiers sont des **copies** des skills actifs de l'utilisateur, qui
vivent normalement dans `~/.workbuddy-ai/skills/`. Ce dernier **n'est pas un
dépôt git** : sans ces copies, tout le savoir procédural accumulé (build et
signature, empilement z-index, diagnostic TTS, pièges du code) disparaîtrait au
premier incident de machine, et ne serait ni sauvegardé ni partageable.

| Skill | Ce qu'il protège |
|---|---|
| `theologicus-apk-build` | build, signature, CI, hygiène du dépôt, preuve de release |
| `theologicus-code-fragilities` | pièges vérifiés sur pièce (parseur CSS, NFD, sélecteurs, tranches JS) et règles des bancs headless |
| `theologicus-tts-diagnostic` | lecture vocale : prononciation, langue fautive, références, moteurs |
| `theologicus-zindex-guard` | empilement : panneaux de verset, fiches mot à mot, bulles |

## Règle de synchronisation

**La source de vérité reste `~/.workbuddy-ai/skills/`** — c'est de là que
l'agent charge un skill. Ces copies sont un **miroir de sauvegarde**.

**Le contrôle est AUTOMATIQUE depuis le 2026-09-25** : `tools/githooks/pre-commit`
vérifie le miroir à chaque `git commit` et **refuse** en cas de divergence. Il
n'y a donc rien à penser à faire. Pour l'installer sur un clone neuf (ou une
autre machine) :

```bash
python tools/install_hooks.py     # pose core.hooksPath, local à chaque clone
```

Pour synchroniser à la main, ou pour contrôler sans committer :

```bash
python tools/sync_skills.py             # copie et nomme les fichiers divergents
python tools/sync_skills.py --verifier  # ne copie rien, sort en 1 si écart
```

Un miroir qui diverge est pire que pas de miroir : il fait croire à une
sauvegarde alors qu'il sert une version périmée.

## Ce qui n'est PAS versionné, volontairement

- `~/.workbuddy-ai/keys/` — la clé de signature des Releases. **Ne jamais
  l'ajouter.** Si elle entrait dans l'historique, n'importe qui pourrait publier
  un APK que les utilisateurs installeraient. Les skills n'en citent que le
  **chemin**, jamais le contenu.
