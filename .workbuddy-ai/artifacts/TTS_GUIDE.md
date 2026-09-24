# THEOLOGICUS — Lecture vocale (ElevenLabs · Supertonic 3)

Guide pratique, à jour de la version **2.0.131** (install `_inst_v102`).
Trois moteurs : *Voix du système* (Windows/Android natif), *ElevenLabs* (cloud),
*Supertonic 3* (modèle ONNX local, sur le PC).

---

## 1. ElevenLabs — ce que dit chaque message d'erreur

Le bouton **Tester** (Paramètres → Lecture vocale → ☁ ElevenLabs) procède en
**deux temps** : d'abord il *vérifie la clé* (`GET /user` sur api.elevenlabs.io),
puis il *synthétise* un exemple. Chaque échec est maintenant accompagné de sa
cause réelle — plus de « échec (moteur-erreur) » mystérieux.

| Message affiché | Cause | Que faire |
|---|---|---|
| `ElevenLabs : renseignez la clé API dans les Paramètres.` | Champ clé vide | Collez votre clé `xi-api-key` dans le champ **Clé**. |
| `Clé ElevenLabs acceptée` (+ quota) | Clé valide | Rien — la synthèse de test va suivre. |
| `ElevenLabs : clé API refusée (401)` | Clé invalide / révoquée | Vérifiez la clé sur votre compte ElevenLabs ; recolez-la. |
| `ElevenLabs : quota épuisé (402)` | Crédits épuisés | Rechargez le compte ou changez de modèle. |
| `ElevenLabs : voix non autorisée pour ce compte (403)` | La Voice ID n'est pas dans votre plan | Utilisez une voix de votre plan (la voix par défaut `21m00Tcm4TlvDq8ikWAM` = « Rachel » convient au plan gratuit). |
| `ElevenLabs : Voice ID inconnu (404)` | L'ID de voix est erroné | Laissez la voix par défaut, ou copiez un ID valide depuis votre compte. |
| `ElevenLabs : paramètres refusés (422)` | Modèle non autorisé pour ce compte | Changez le **Modèle** (ex. `eleven_multilingual_v2`). |
| `ElevenLabs : trop de requêtes (429)` | Rate-limit | Attendez quelques secondes puis retestez. |
| `ElevenLabs injoignable (réseau ?) — <erreur>` | Pas de réponse HTTP | Vérifiez la connexion, le pare-feu, et qu'aucun proxy ne bloque `api.elevenlabs.io`. |
| `ElevenLabs : <message brut de l'API>` | Erreur renvoyée par ElevenLabs | Le message vient de leur API (ex. `could not find voice`) — agissez en conséquence. |

**Note hébreu :** seul le modèle `eleven_v3` couvre l'hébreu. Pour le français,
`eleven_multilingual_v2` suffit.

Si vous voyez encore un message vide ou « moteur-erreur » sans cause, c'est que la
réponse d'ElevenLabs n'était ni JSON ni attendue : le code affiche alors
`HTTP <code>` — transmettez-le-moi, il y a un cas non couvert.

---

## 2. Supertonic 3 sur Windows — démarrage automatique

**Ce que vous avez demandé :** « quand je lance THEOLOGICUS, le serveur Supertonic
démarre automatiquement ». C'est en place.

- Réglage : **Paramètres → Lecture vocale → Moteur = Supertonic 3**, case
  **Démarrage automatique** (cochée par défaut).
- Au lancement de THEOLOGICUS, l'application envoie `POST /supertonic/start` à son
  proxy intégré (compilé dans l'`.exe`), qui lance
  `tools/start_supertonic.py` via le Python du PC.
- Le service écoute ensuite sur `0.0.0.0:8091` (joignable depuis l'APK sur le
  même Wi-Fi).

**Prérequis (à vérifier une fois) :**
1. Un Python capable d'importer `numpy` **et** `onnxruntime`
   (`py -3` / `python` / `python3`). Le proxy choisit le premier qui convient.
2. Le modèle ONNX dans `%USERPROFILE%\.cache\supertonic3`
   (dossier `onnx` + `voice_styles`, ~385 Mo). À récupérer une fois :
   ```
   hf download supertone-oss-archive/supertonic-3 --local-dir %USERPROFILE%\.cache\supertonic3
   ```
   (sur cette machine il est déjà présent).

**Vérifier que tout tourne :** Paramètres → bouton **Vérifier** (à côté de
Supertonic). Attendu : `En ligne — modèle chargé`. Le tout premier démarrage met
~20–60 s le temps de charger le modèle (256 Mo pour `vector_estimator.onnx`
seul) ; les suivants sont instantanés (le service reste en mémoire).

**Démarrage manuel** (si vous préférez ne pas l'automatiser) : décochez
« Démarrage automatique », puis bouton **Démarrer le service** dans Paramètres.

---

## 3. Supertonic 3 sur Android

**Point clé : le modèle ne tourne pas sur le téléphone.** Il est trop lourd
(385 Mo, CPU) et n'est pas embarqué dans l'APK. Le service tourne sur le **PC**,
et l'application Android lui envoie les requêtes TTS par le réseau local. L'APK
utilise déjà sa propre voix système pour le français (shim `SpeechBridge`), mais
il peut déléguer à Supertonic sur le PC pour une voix plus naturelle / grec /
arabe.

**Étapes :**

1. **Sur le PC** : THEOLOGICUS lancé, Supertonic démarré (automatiquement ou via
   le bouton). L'IP LAN du PC est affichée au démarrage du service
   (ex. `192.168.100.71`), ou récupérez-la avec `ipconfig`.
2. **Même Wi-Fi** entre le PC et le téléphone.
3. **Sur Android** : THEOLOGICUS → **Paramètres → Lecture vocale → Moteur =
   Supertonic 3**.
4. **URL Supertonic** = `http://<IP-PC>:8091`
   (ex. `http://192.168.100.71:8091`).
   ⚠️ Ne laissez **pas** `http://127.0.0.1:8091` : sur Android, `127.0.0.1`
   désigne le *téléphone lui-même*, pas le PC.
5. Bouton **Vérifier** → doit afficher `En ligne`.

**Pourquoi ça marche sans configuration réseau compliquée :** le service écoute
sur `0.0.0.0:8091` (toutes les interfaces), et l'APK autorise le trafic clair
LAN (`usesCleartextTraffic="true"` + `allowMixedContent`). Aucun HTTPS, aucun
certificat à gérer.

**Hors du Wi-Fi domestique (4G, données mobiles) :** utilisez l'IP **Tailscale**
du PC (ex. `100.74.55.70`) à la place de l'IP WiFi, les deux appareils étant
connectés au même réseau Tailscale. L'URL devient `http://100.74.55.70:8091`.

**Si « injoignable » :**
- Le pare-feu Windows doit autoriser le port `8091` sur le **réseau privé**
  (autorisez-le si Windows le demande au 1er lancement du service).
- PC et téléphone doivent être sur le **même sous-réseau** (même box Wi-Fi).
- Vérifiez que le service est bien démarré sur le PC (bulle « En ligne »).

---

## Résumé des trois demandes

| Demande | État |
|---|---|
| ElevenLabs : erreur diagnostiquable | ✅ Messages à cause réelle (tableau §1). |
| Supertonic démarre tout seul au lancement (Windows) | ✅ Câblé + vérifié par banc (voir `bench_autostart.js`). |
| Supertonic sur Android | ✅ PC héberge le service, téléphone relie par IP LAN (§3). |
