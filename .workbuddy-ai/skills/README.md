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

Après avoir modifié un skill, recopier la version à jour :

```bash
cd /c/Theologicus
cp -r ~/.workbuddy-ai/skills/theologicus-*/ .workbuddy-ai/skills/
git add .workbuddy-ai/skills/ && git commit -m "docs(skills): sync ..."
```

Un miroir qui diverge est pire que pas de miroir : il fait croire à une
sauvegarde alors qu'il sert une version périmée. **Synchroniser dans le même
geste que la modification.**

## Ce qui n'est PAS versionné, volontairement

- `~/.workbuddy-ai/keys/` — la clé de signature des Releases. **Ne jamais
  l'ajouter.** Si elle entrait dans l'historique, n'importe qui pourrait publier
  un APK que les utilisateurs installeraient. Les skills n'en citent que le
  **chemin**, jamais le contenu.
