# CompVis/stable-diffusion — analyse et verdict

Dépôt : https://github.com/CompVis/stable-diffusion
Commit examiné : `21f890f9da3c` — **2022-11-16** « Update sampler.py » — **dernier
commit de `main`** (dernier `push` toutes branches confondues : **2024-06-18**,
API GitHub ; dépôt **non archivé**, **73 476 étoiles**, **619 issues ouvertes**).
92 Mo clonés (dont ~89 Mo d'assets), licence **CreativeML Open RAIL-M**.

Lu : `README.md` (212 l.), `Stable_Diffusion_v1_Model_Card.md`, `LICENSE`,
`environment.yaml`, `setup.py`, `main.py` (28 916 o), `scripts/*.py`,
`configs/`, `ldm/`, `models/`.

## Ce que c'est

**Le dépôt de recherche d'origine de Stable Diffusion v1** (CompVis / LMU Munich,
avec Stability AI et Runway). Papier : *High-Resolution Image Synthesis with Latent
Diffusion Models*, CVPR '22 Oral, arXiv 2112.10752.

- UNet **860M** (latent), encodeur texte **CLIP ViT-L/14** gelé (123M), autoencodeur
  facteur 8. Entraîné 256×256 puis affiné 512×512 sur un sous-ensemble de LAION-5B.
- **GPU requis : ≥ 10 Go de VRAM** (verbatim README). Entraînement d'origine :
  **32 × 8 × A100**.
- Environnement figé : Python 3.8.5, CUDA 11.3, **PyTorch 1.11.0**, PyTorch-Lightning
  1.4.2, `transformers==4.19.2`, plus deux dépendances `git+` :
  `CompVis/taming-transformers` et `openai/CLIP`.

## Surface exécutable

| Élément | Nature | Appelable par THEOLOGICUS ? |
|---|---|---|
| `scripts/txt2img.py` | **Script CLI** (`argparse`), écrit des PNG sur disque | Non |
| `scripts/img2img.py`, `inpaint.py`, `knn2img.py`, `sample_diffusion.py` | Idem | Non |
| `main.py` | Boucle d'**entraînement** (PyTorch-Lightning) | Non |
| `ldm/`, `models/`, `configs/` | Bibliothèque + configs YAML/`gin` | Non |
| `notebook_helpers.py` | Utilitaires Jupyter | Non |

### Points d'entrée du script de référence

```
python scripts/txt2img.py --prompt "a photograph of an astronaut riding a horse" --plms
python scripts/img2img.py --prompt "..." --init-img <chemin> --strength 0.8
```

Deux mécanismes de sécurité embarqués, à leur crédit : un
**Safety Checker** (`CompVis/stable-diffusion-safety-checker`) et un
**filigrane invisible** (`invisible-watermark`, DWT-DCT) sur chaque sortie.

## Verdict : intégration comme « modèle extra » — NON (deux fois non)

**Premier non — aucune surface appelable.** Recherche exhaustive de
`flask|FastAPI|uvicorn|gradio|app.run|@app` dans `scripts/` et `main.py` :
**zéro résultat**. Le seul `streamlit` du dépôt est une ligne d'`environment.yaml`,
jamais utilisée par le code. Stable Diffusion ici est un **script qui écrit des
fichiers**, pas un service. « Modèle extra » dans THEOLOGICUS suppose un `base`
OpenAI-compatible joignable par HTTP : il n'existe pas, et **rien dans le dépôt ne
prépare à en écrire un**.

**Second non — le dépôt est un artefact de recherche figé de 2022.** C'est plus
grave ici que la simple absence d'API :

1. **Abandonné.** Dernier commit `21f890f` du **2022-11-16**. Il **ne fonctionne pas
   sur une pile moderne** : Python 3.8.5 et **PyTorch 1.11.0** (2022) sont requis ;
   `transformers==4.19.2` de même. Installer cela en 2026 est un chantier à
   lui seul, et incompatible avec le Python 3.12/3.13 managé de cette machine.
2. **Poids : ~89 Mo d'assets + ~4 Go de poids** (`sd-v1-4.ckpt` ≈ 4 Go). Le dépôt
   entier fait **92 Mo** — à comparer aux 1,47 Mo de `THEOLOGICUS.html`. Et le
   README indique explicitement que **l'usage commercial est permis mais
   déconseillé sans mécanismes de sécurité supplémentaires** : *« The weights are
   research artifacts and should be treated as such. »*
3. **Licence CreativeML Open RAIL-M** — plus souple qu'AGPLv3 (permissive, usage
   commercial autorisé), mais **avec restrictions d'usage attachées** qui se
   propagent aux dérivés. Embarquer des poids dans un exe signé et une APK
   distribués obligerait à répercuter ces restrictions et à assumer la charge du
   Safety Checker.
4. **Matériel.** ≥ 10 Go de VRAM sur la machine de l'utilisateur. THEOLOGICUS est
   une app qui tourne sur un PC quelconque, et sur Android.

**Ce que le dépôt ne fournit pas non plus** : aucun serveur, mais aussi **aucun
client HTTP** — il n'appelle aucun service. On ne peut donc même pas le traiter
comme une passerelle vers un modèle distant.

## Contre-proposition honnête, si l'image compte

Le nom « Stable Diffusion » désigne désormais un **format de poids**, pas ce dépôt.
Les chemins réalistes, par ordre de coût croissant :

1. **API distante OpenAI-compatible** — une entrée `PROVIDERS` dans THEOLOGICUS,
   exactement comme Agnes AI en v118 (fal.ai, Replicate, Together, ou un endpoint
   `images/generations` d'OpenAI). **Aucun poids embarqué, aucun GPU requis.** C'est
   la voie qui respecte l'architecture existante.
2. **Serveur local côté utilisateur** — l'utilisateur installe
   **AUTOMATIC1111** ou **ComfyUI** (qui exposent, eux, une vraie API HTTP) et
   THEOLOGICUS s'y connecte comme il le fait déjà pour **Supertonic** ou
   **LibreTranslate** via `proxy_server.py`. Cette voie est déjà outillée ici.
3. **`diffusers`** (Hugging Face) — si un jour l'inférence locale devient un
   objectif, c'est `diffusers` qu'il faut viser, **pas ce dépôt de 2022**.

Dans les trois cas, **le dépôt CompVis n'est pas le bon point d'intégration** :
c'est un modèle de 2022 livré en script, que l'écosystème a remplacé depuis.
