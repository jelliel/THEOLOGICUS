# MoneyPrinterTurbo 1.3.7 (portable Windows) — analyse et verdict

Chemin : `C:\Users\toshr\Desktop\MoneyPrinterTurbo-Portable-Windows-1.3.7`
Amont : https://github.com/harry0703/MoneyPrinterTurbo
Commit embarqué : `ad5496f1b729d1d7e361dd972015d26c08b0e052` — **2026-09-24**,
« fix(video): validate subtitle font paths » (projet **actif**).
Licence : **MIT** (Copyright 2024 Harry). Taille : **2,4 Go**.

Composition du portatif : `lib/python` **848 Mo** (Python 3.11.15 + 684 Mo de
`site-packages`, dont `faster-whisper`), `lib/git` 376 Mo, `lib/ffmpeg` 82 Mo
(ffmpeg **7.0** essentials), plus les sources dans `MoneyPrinterTurbo/`.

## Ce que c'est

**« 利用AI大模型，一键生成高清短视频 »** — un générateur de vidéos courtes
verticales, type TikTok/Shorts/Reels, à partir d'un simple sujet. Entièrement
local : le paquet embarque son propre Python, son ffmpeg et son git.

## Contrairement aux trois dépôts précédents : IL Y A UNE VRAIE API

C'est le point capital. Recherche effectuée, résultats positifs :

- `main.py` démarre **uvicorn** : `uvicorn.run(app="app.asgi:app", host=…, port=…)`,
  défaut **8080** (`config.toml` → `listen_host`. `listen_port = 8080`), avec
  **`/docs`** (OpenAPI/Swagger) — verbatim : *« start server, docs:
  http://127.0.0.1:8080/docs »*.
- `app/router.py` monte deux contrôleurs V1, préfixe **`/api/v1`**
  (`app/controllers/v1/base.py` : `router.prefix = "/api/v1"`).

### Endpoints réels (`app/controllers/v1/`)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/ping` | santé → `"pong"` |
| POST | `/api/v1/videos` | **génère une vidéo** |
| POST | `/api/v1/subtitle` | sous-titres seuls |
| POST | `/api/v1/audio` | audio (TTS) seul |
| GET | `/api/v1/tasks` | liste des tâches |
| GET | `/api/v1/tasks/{task_id}` | état d'une tâche |
| DELETE | `/api/v1/tasks/{task_id}` | supprime |
| POST | `/api/v1/scripts` | **génère un script** |
| POST | `/api/v1/terms` | mots-clés de recherche de rushes |
| POST | `/api/v1/social-metadata` | métadonnées de publication |
| GET | `/api/v1/musics` · POST | musiques de fond |
| GET | `/api/v1/video_materials` · POST | rushes locaux |
| GET | `/api/v1/stream/{path}` · `/download/{path}` | lecture / téléchargement |

Validation forte : `VideoParams` est un modèle Pydantic (`video_subject`,
`video_script`, `video_aspect`, `video_clip_duration`, `voice_name`, `bgm_type`,
`font_size`, `stroke_width`…). **C'est une surface appelable et contractuelle.**

### Robustesse notable

`app/asgi.py` implémente sérieusement : clé API optionnelle (`app.api_key`,
avertissement si absente), **protection d'origine navigateur** (403 sur Origin non
fiable, `_normalize_allowed_origin()` qui replie `:443`/`/` pour que la liste
blanche fonctionne réellement), CORS explicite, `Private Network Access`, garde sur
`/tasks` monté en `StaticFiles` (hors dépendance APIRouter → middleware dédié),
file d'attente de tâches (`_max_concurrent_tasks = 5`, `_max_queued_tasks = 100`),
et option Redis. C'est du code de qualité production.

## Verdict : « modèle extra » — NON, mais pour une raison toute différente

Ici il **y a** une surface HTTP. Le blocage n'est plus « rien à appeler », c'est
**la nature de l'objet**.

1. **Ce n'est pas un modèle — c'est un pipeline.** `/api/v1/videos` ne rend pas du
   texte : il rend un **fichier MP4** au terme d'une tâche asynchrone longue
   (recherche de rushes Pexels/Pixabay, TTS, `faster-whisper` pour les sous-titres,
   assemblage `moviepy`, rendu ffmpeg). Un « modèle » dans THEOLOGICUS rend une
   réponse dans une conversation. Ici l'unité de travail est un **job** : c'est un
   **outil**, pas un modèle.
2. **Le port est instable — le piège exact de la v117.** `start.bat` ET
   `webui.bat` font choisir le port par PowerShell : ils tentent le port préféré
   puis **essaient en boucle 8502→8599** jusqu'au premier libre. Le port change donc
   d'un lancement à l'autre. Par ailleurs `listen_host = "0.0.0.0"` dans le
   `config.toml` local : le service écoute **toutes les interfaces**, pas seulement
   la boucle locale.
3. **2,4 Go, et deux services concurrents.** Le portatif lance un **WebUI
   Streamlit** (8501+) par `start.bat`, et l'API (8080) par `api.bat` — deux
   chemins distincts. Embarquer cela dans THEOLOGICUS (APK + exe signé) est
   impensable : 2,4 Go contre 1,47 Mo pour tout `THEOLOGICUS.html`.
4. **Clés tierces obligatoires à l'usage.** Rushes (`pexels_api_keys`,
   `pixabay_api_keys`), et surtout un **LLM** pour écrire le script — le
   `config.toml` local est réglé sur `llm_provider = "moonshot"` avec une clé vide.
   Le `config.example.toml` liste ~40 fournisseurs LLM. Poids sémantique : c'est un
   **second THEOLOGICUS**, pas un greffon.

## Pendant positif : c'est le meilleur candidat des quatre, si l'objectif est la vidéo

L'architecture de THEOLOGICUS **sait déjà** parler à un service local : c'est
exactement le motif **Supertonic** (`tools/start_supertonic.py`, routes
`/supertonic/status|start|stop` dans `proxy_server.py`) et **LibreTranslate**.

Intégration **raisonnable**, si vous la voulez :

- **Ne rien embarquer.** L'utilisateur lance MoneyPrinterTurbo lui-même (il est
  déjà installé sur le Bureau, en 1.3.7).
- **Déclarer un connecteur** dans `proxy_server.py` : une sonde `/ping` en lecture
  seule, plus un relais `POST /api/v1/videos` → `GET /api/v1/tasks/{id}` en polling.
- **Résoudre le port par sondage de 8080**, et **journaliser** le port trouvé
  (leçon v117 : un port instable fait croire à une config perdue). Si l'utilisateur
  passe par `start.bat`, c'est le WebUI Streamlit en 8501+ qu'il faut viser, pas
  l'API.
- **Présenter le résultat comme un livrable** (un MP4), pas comme un message de
  conversation — c'est la seule lecture honnête de ce que la chose produit.

**Aucun fichier de l'application n'a été touché.** Étude seule.
