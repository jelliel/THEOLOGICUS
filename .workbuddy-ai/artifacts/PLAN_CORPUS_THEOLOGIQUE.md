# Plan — corpus théologique local (toutes confessions)

> Rédigé le 2026-09-19 après **sondes réelles**. Base : `apk-v2.0.50`,
> correctif `biblia://` livré (`a86a227`).
> Décision utilisateur : périmètre **toutes confessions d'emblée**,
> démarrage par **newadvent.org**.

---

## 1. Faisabilité mesurée (pas estimée)

| Source | Statut | Mesure |
|---|---|---|
| **Somme théologique** (newadvent/summa) | ✅ exploitable | 200 · 36 020 caractères · 11 balises de titre sur Q.1 |
| **Pères de l'Église** (newadvent/fathers) | ✅ exploitable | 200 · texte structuré |
| **Catéchisme du Concile de Trente** | ❌ **404** | `newadvent.org/catechism/` n'existe pas — chemin à retrouver |
| **CCEL** (protestant) | ⚠️ JS | 34 Ko de HTML → 2,7 Ko de texte : page rendue côté client, **API à utiliser** |
| **Denzinger** | ⚠️ lourd | scans/PDF **latins** → OCR obligatoire, résultat en latin |

### La Somme, chiffrée

L'index renvoie 5 parties (`/summa/1.htm` … `/summa/5.htm`), chacune listant ses
questions. **619 pages de questions** :

| Partie | Questions | Numérotation |
|---|---|---|
| Prima Pars | 119 | 1001 → 1119 |
| Prima Secundae | 114 | 2001 → 2114 |
| Secunda Secundae | 192 | 3001 → 3189 |
| Tertia Pars | 92 | 4001 → 4090 |
| Supplement | 102 | 5001 → 5099 |

**Une page = une question** contenant tous ses articles. Ordre de grandeur :
~10-15 Mo de texte brut, soit **~3-5 Mo dans l'APK** (le corpus actuel fait
51 Mo sur le disque pour un APK de 11,3 Mo : le texte se compresse fort).

---

## 2. Architecture retenue

On **copie** le motif qui marche déjà pour `bible/`, `quran/`, `tafsir/` :

```
summa/
  index.js            -> window.__summaIndex  (parties -> questions -> titres)
  s1001.js ...        -> une tranche par question (chargee a la volee)
```

- **Jamais de préchargement** : le tafsir pèse 41 Mo et `AndroidManifest.xml`
  n'a **pas** `largeHeap`. Tout se charge à la demande, comme
  `__ensureBibleBook()` / `__ensureQuranSurah()`.
- **Résolution en cascade**, identique à la v2.0 §4.1 : la référence se résout
  en local, le lien web ne devient qu'une sortie de secours.
- **Marques de vérification** : on réutilise le moteur T4 — « Somme Ia q. 9999 »
  n'existe pas → ⚠️ citation inventée.

---

## 3. Découpage en tranches livrables

Chaque tranche est utilisable seule.

| # | Tranche | Source | État |
|---|---|---|---|
| **T1** | **Somme théologique** (611 questions) | newadvent/summa | **FAIT** — 611/611, 3 115 articles, 17 Mo |
| **T2** | Pères de l'Église (œuvres principales) | newadvent/fathers | prouvé, **à faire** |
| **T3** | Protestant (Calvin, Luther, confessions) | CCEL via API | ⚠️ API à identifier |
| **T4** | Orthodoxe | Pères (déjà en T2) + textes propres | à sourcer |
| **T5** | Islamique | Coran + tafsir **déjà présents** ; hadith à évaluer | partiellement fait |
| **T6** | Denzinger | OCR latin | le plus coûteux, **en dernier** |

**Ordre recommandé : T1 → T2 → T3 → T5 → T4 → T6.** T1 et T2 sont prouvées et
donnent un résultat visible rapidement.

---

## 4. Tranche T1 en détail — la Somme

1. **Récupérer** les 5 index de parties, en déduire la liste exacte des 619
   questions (déjà validé : 619).
2. **Aspirer** les 619 pages, une par une, avec temporisation
   (politesse envers le serveur).
3. **Parser** : pour chaque page, extraire le titre de la question puis chaque
   article (les balises de titre sont présentes — 11 sur Q.1).
4. **Produire** `summa/index.js` + une tranche par question.
5. **Brancher** la résolution locale : « Somme Ia q. 2 a. 3 » → panneau local.
6. **Vérifier** en CDP : résolution, mode avion, absence de requête externe,
   non-régression du banc (33/33 + nouveaux contrôles).

### Langue : point à trancher

La Somme de New Advent est la traduction **anglaise** dominicaine (domaine
public). L'application est française. Le code contient déjà ce précédent :
« Version anglaise préférée — français non disponible sur vatican.va ».

→ Une traduction **française** ancienne (domaine public) serait nettement
mieux. À rechercher avant d'aspirer 619 pages.

---

## 5. Risques et inconnues

| Risque | Parade |
|---|---|
| **Trent : 404** | retrouver le bon chemin, ou renoncer à cette œuvre |
| **CCEL rendu en JS** | passer par leur API ; sinon source protestante de repli |
| **Langue anglaise** | chercher d'abord une édition française libre de droits |
| **Licences** | ne prendre **que** du domaine public confirmé ; le CEC et la BJ 1998 restent exclus |
| **Taille de l'APK** | compression forte + chargement à la volée ; aucun préchargement |
| **Fiabilité des textes** | **jamais** générer un texte théologique : tout provient d'une source réelle et vérifiable |

> Rappel de la règle d'or : on n'invente aucun texte. Une fausse citation
> patristique détruit la confiance — refus déjà acté dans la proposition 2.0.

---

## 6. Prochaine étape

Écrire `tools/build_summa.py` : aspirer + parser, et **d'abord le prouver sur
une seule question** (Prima Pars Q.1) avant de lancer les 619. Si le parsing
tient sur Q.1, on généralise.

Scripts de sondes déjà disponibles (non commités, gitignorés) :
`_probe_sources.py`, `_audit_theo.py`, `_audit_dyn.py`, `_audit_lib.py`.
