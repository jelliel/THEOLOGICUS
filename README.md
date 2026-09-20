# THEOLOGICUS

Assistant de théologie, d'histoire des religions et de métaphysique.
Une seule base de code, deux livrables : une **APK Android** et un **exe
Windows**. Le parti pris : les textes sont **embarqués** dans l'application,
donc une référence s'ouvre même sans réseau, et un lien ne peut pas être mort.

Version courante : **2.0.82** (`2.0.` + nombre de commits). L'application
signale elle-même les versions plus récentes.

---

## Télécharger

Chaque version publie trois fichiers sur la page
[Releases](https://github.com/jelliel/THEOLOGICUS/releases) :

| Fichier | Usage |
|---|---|
| `app-release.apk` | Android — signé, s'installe directement |
| `THEOLOGICUS-Setup-x64.exe` | Windows — installable (Inno Setup) |
| `THEOLOGICUS-portable-win64.zip` | Windows — sans installation, à dézipper |

L'APK est signée avec la même clé depuis la première version : les mises à
jour s'installent **par-dessus**, sans désinstaller. Les livrables Windows ne
sont en revanche **pas signés** (le certificat n'est pas dans le dépôt), donc
Windows affiche un avertissement au premier lancement.

---

## Ce qu'elle fait

- **Dialogue** avec un modèle de langage au choix (Mistral, Anthropic, OpenAI
  ou Gemini). La clé API est saisie au premier lancement et reste sur
  l'appareil : **aucune clé n'est embarquée** dans les livrables.
- **Références locales**. Une référence biblique, coranique, patristique ou de
  magistère citée dans une réponse s'ouvre **en local**, sans quitter
  l'application et sans dépendre d'un site tiers. Le lien web ne sert que de
  secours.
- **Bibliothèque** : cinq onglets (☻ Pères, ✦ Réforme, ⛪ Orthodoxie, ☾ Islam,
  ✝ Magistère) et la **Somme théologique** en français et en anglais.
- **Questions de suivi** proposées après chaque réponse. Si la question est
  plus longue que la puce, elle **défile** (aller-retour) au lieu d'être
  coupée ; si le système refuse toute animation, la puce passe en plusieurs
  lignes — la question reste lisible dans tous les cas.
- **Mémorisation** : fiches, quiz à difficulté montante, verrou de révision.
- **Entrée/sortie de fichiers** : import PDF / DOCX / images, export des
  réponses, lecture audio.
- **Mises à jour** : l'application vérifie elle-même si une version plus
  récente existe et propose de l'installer (voir plus bas).

---

## Mises à jour

Au démarrage (et au plus une fois toutes les 6 h), l'application interroge
l'API publique de GitHub :

```
https://api.github.com/repos/jelliel/THEOLOGICUS/releases/latest
```

Si le tag est plus récent que la version installée, un bandeau propose
**Mettre à jour** / **Plus tard**. Un appui lance le téléchargement puis
l'installation :

| Plateforme | Mécanisme |
|---|---|
| Android | plugin `UpdateBridge` : télécharge l'APK dans le cache, puis ouvre l'installateur du système |
| Windows | `DesktopApi.install_update` dans `app.py` : télécharge l'installeur, le lance, puis ferme l'application |

À défaut de canal disponible, l'app ouvre simplement la page de téléchargement
dans le navigateur. « Plus tard » mémorise la version refusée : elle n'est
reproposée que si une version plus récente paraît. La ligne de version dans
PARAMÈTRES sert aussi de vérification manuelle.

Détails qui comptent :

- Appel **anonyme** (aucun jeton), sans données personnelles. Pas de réseau =
  pas de bandeau, silencieusement.
- Android 8+ demande une fois l'autorisation « installer des applications
  inconnues » pour cette source ; c'est le système qui affiche l'écran.
  L'APK téléchargée est la même que celle de la release, signée avec la même
  clé : la mise à jour remplace l'application sans perdre les données.
- Sur Windows, l'installeur n'est pas signé : SmartScreen avertit au premier
  lancement.

---

## Corpus embarqués

| Dossier | Contenu | Entrées | Langue | Source |
|---|---|---:|---|---|
| `bible/` | 66 livres | 66 | FR | Traduction BJ 1998 — **sous droits** |
| `quran/` | 114 sourates | 114 | FR + arabe | Quran.com |
| `tafsir/` | commentaire verset par verset | 114 | EN | Ibn Kathir abrégé (Quran.com) |
| `summa/` | Somme théologique | 611 questions | EN | New Advent |
| `summafr/` | Somme théologique | 613 questions | FR | Drioux, domaine public |
| `fathers/` | Pères de l'Église | 118 | EN | CCEL |
| `reformed/` | Confessions de la Réforme | 91 | EN | Schaff, *Creeds of Christendom* (CCEL) |
| `orthodox/` | Orthodoxie | 43 | EN | CCEL |
| `islamic/` | Hadith (Bukhari) | 93 | FR | Houdas & Marçais |
| `denzinger/` | Magistère | 128 | FR | Denzinger, 11e éd. 1911 (Bannwart S.J.) |

Soit environ 163 Mo de textes, découpés en petits fichiers (un par livre,
sourate ou question) chargés à la volée : l'application démarre sans rien
télécharger et n'embarque pas les monolithes en mémoire.

**Règle d'or du projet** : aucun texte n'est inventé ni réattribué. Deux
questions de la Somme française (IIa-IIae q.154 et Supplément q.64) sont
restées en latin dans l'édition Drioux ; elles sont **signalées comme telles**,
pas traduites.
La Bible embarquée (BJ 1998) est sous droits : elle conditionne l'export et le
comparateur de traductions.

---

## Organisation du dépôt

| Chemin | Rôle |
|---|---|
| `THEOLOGICUS.html` | L'application entière (~1,2 Mo) : interface, moteur, chargeurs de corpus |
| `app.py`, `proxy_server.py` | Lanceur Windows (pywebview / WebView2) et serveur local : sert les fichiers, relaie les appels aux API |
| `bible/ quran/ … denzinger/` | Corpus locaux |
| `libs/` | pdf.js, mammoth, jszip, jspdf, html2canvas + polices (démarrage 100 % hors ligne) |
| `tools/build_*.py` | Générateurs qui produisent les corpus depuis les sources publiques |
| `installer.iss`, `build_installer.bat` | Installeur Windows (Inno Setup) et build local |
| `android/` | Projet Capacitor 8 (`com.theologicus.app`, minSdk 24) |
| `mobile/www/` | Généré par `tools/prepare_mobile.py` — **ne pas éditer à la main** |
| `.github/workflows/build-apk.yml` | Construit et publie l'APK **et** les livrables Windows |

À chaque poussée sur `main` touchant `THEOLOGICUS.html` ou un corpus, la CI
reconstruit et publie une nouvelle version.

> Ajouter un corpus = mettre à jour **trois** listes : `COPY_DIRS` dans
> `tools/prepare_mobile.py`, le job `windows` de la CI, et
> `build_installer.bat`. Une liste oubliée ne casse pas le build : elle donne
> des 404 à l'usage.

---

## Compiler

### Windows

Python 3.12, puis :

```
build_installer.bat
```

Le script enchaîne PyInstaller, la copie des corpus, la signature de l'exe
(si `signtool` est présent), l'installeur Inno Setup, puis dépose les livrables
dans `output\`.

### Android

```bash
cd android
export JAVA_HOME=".../jdk21" ANDROID_HOME=".../android-sdk"
export APK_VERSION_NAME="2.0.$(git rev-list --count HEAD)"   # obligatoire
export APK_KEYSTORE_B64="$(cat theologicus-release.jks.base64.txt)"
export APK_KEYSTORE_PASS="..." APK_KEYSTORE_ALIAS="theologicus"
./gradlew assembleRelease --no-daemon
```

Sans `APK_VERSION_NAME`, l'APK s'annonce `1.0.<code>` alors que le HTML
embarque la bonne version. La clé de signature n'est pas dans le dépôt : sans
elle, l'APK produite **ne peut pas** mettre à jour une installation existante.

---

## Limites connues

- Pas de licence déclarée pour l'instant : le code est la propriété de l'auteur,
  l'usage des corpus suit le régime de chaque source (domaine public sauf la BJ
  1998).
- Les livrables Windows ne sont pas signés.
- La lecture des références suppose le corpus correspondant présent : un
  corpus absent du livrable se traduit par un 404 silencieux à l'usage, pas par
  une erreur au build.
