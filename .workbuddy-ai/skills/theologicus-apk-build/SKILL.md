---
name: theologicus-apk-build
description: "Build, verify and ship a signed Android APK for THEOLOGICUS (single-file HTML app wrapped with Capacitor) from the C:\\Theologicus workspace. Use when the user asks to build/rebuild the APK, apply a mobile fix and ship it, bump the version, or check that a fix really made it into the packaged app."
description_en: "Build and verify a signed THEOLOGICUS Android APK"
allowed-tools: Read,Write,Edit,Bash,Grep,Glob
display_name: "theologicus-apk-build"
agent_created: true
---

# Build & ship a signed THEOLOGICUS APK

The app is a single 1.1 MB file, `C:\Theologicus\THEOLOGICUS.html`, wrapped by
Capacitor 8. Every fix is an edit to that HTML file, then a rebuild.

## The 6 steps, in order

### 1. Edit `THEOLOGICUS.html`

Mark the change with a comment `/* vNN — ... */` (French, matching the file).
`vNN` is how you later prove the fix is inside the APK.

### 2. Regenerate `mobile/www/index.html`

Do **not** run `tools/prepare_mobile.py` — it does `shutil.rmtree` on 330 files
and trips the bulk-delete guard. Regenerate only the HTML (the data dirs
`bible/`, `quran/`, `tafsir/`, `libs/` are already populated):

```bash
cd /c/Theologicus && N=$(git rev-list --count HEAD) && \
C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe - "$N" <<'PY'
import sys, os
v = "2.0." + sys.argv[1]
src = open("THEOLOGICUS.html", encoding="utf-8", newline="").read()
old_vp = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
new_vp = '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
out = src.replace(old_vp, new_vp, 1) if old_vp in src else src
out = out.replace("__THEO_VERSION__", v, 1)
open("mobile/www/index.html", "w", encoding="utf-8", newline="").write(out)
open("mobile/www/version.txt", "w", encoding="utf-8", newline="").write(v + "\n")
print("version", v)
PY
```

`N` is passed as argv — a shell variable alone is not visible to the Python
process. The script also writes `mobile/www/version.txt` (prepare_mobile.py
does this via VERSION file; the inline variant does it directly).

### 3. Copy into the Android assets (never `npx cap sync` locally)

`npx cap sync android` fails on `removePluginsNativeFiles` (fs-extra) and can
**silently ship the previous code**. Copy directly:

```bash
cp mobile/www/index.html android/app/src/main/assets/public/index.html
grep -c 'vNN —' android/app/src/main/assets/public/index.html   # must be >= 1
```

CI runs `npx cap sync` (line 77 of build-apk.yml) and that one works because
the GitHub runner has a clean fs-extra version.

### 4. Build — with sandbox escalation

Gradle fails at the very end with `~/.gradle/.../metadata.bin (Access is denied)`
**after** running every task. Run with `dangerouslyDisableSandbox: true` and
reuse the warm `~/.gradle`.

Measured times (cache chaud, sur ce poste) :

| Cas | Durée | Notes |
|---|---|---|
| Warm cache (build précédent < 1 h) | **~60 s** | 165 tâches, 17 exécutées / 148 UP-TO-DATE |
| Cold cache | 5-8 min | Premier build après `./gradlew --stop` ou nettoyage |
| Froid total (sandbox `rm -rf` du `~/.gradle`) | ~22 min | À éviter |

```bash
cd android && export JAVA_HOME="C:/Users/toshr/.workbuddy-ai/binaries/android-tools/jdk21/jdk-21.0.12.1+1" \
  ANDROID_HOME="C:/Users/toshr/.workbuddy-ai/binaries/android-tools/android-sdk" \
  ANDROID_SDK_ROOT="C:/Users/toshr/.workbuddy-ai/binaries/android-tools/android-sdk" \
  APK_VERSION_NAME="2.0.$(git rev-list --count HEAD)" \
  APK_KEYSTORE_B64="$(cat 'C:/Users/toshr/.workbuddy-ai/keys/theologicus-release.jks.base64.txt')" \
  APK_KEYSTORE_PASS="$(cat 'C:/Users/toshr/.workbuddy-ai/keys/theologicus-release.PASSWORD.txt')" \
  APK_KEYSTORE_ALIAS="theologicus" && \
  ./gradlew assembleRelease --no-daemon
```

**`APK_VERSION_NAME` est obligatoire** — ne pas l'oublier. `android/app/build.gradle`
l. 48 fait `versionName System.getenv("APK_VERSION_NAME") ?: "1.0.${autoVersionCode}"`.
Sans la variable, l'APK s'annonce `1.0.<code>` alors que le HTML embarque la
bonne version : deux numeros differents pour le meme fichier. (Constate le
2026-09-18 : APK annonce `1.0.46` au lieu de `2.0.46`.) La CI, elle, la passe
toujours — le piege ne concerne que le build local.

Le fichier `.base64.txt` est **sur une seule ligne** — `base64 -w0`.

Le skill original disait `assembleRelease assembleDebug` : seule la release
est utile à l'utilisateur final, et le debug ajoute 30 s. Sautable sauf
besoin spécifique.

### 5. Verify the APK — never trust the version number alone

```bash
APK=android/app/build/outputs/apk/release/app-release.apk
# version
"C:/Users/toshr/.workbuddy-ai/binaries/android-tools/android-sdk/build-tools/36.0.0/aapt2.exe" \
  dump badging "$APK" | grep ^package:
# the fix is REALLY inside (>= 1 par marqueur vNN — ...)
"C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe" -c "
import zipfile;h=zipfile.ZipFile('$APK').read('assets/public/index.html').decode('utf-8','replace')
print('v62=', h.count('v62'))
print('taille=', len(h))"
# signature — must stay 93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67
"C:/Users/toshr/.workbuddy-ai/binaries/android-tools/jdk21/jdk-21.0.12.1+1/bin/java.exe" \
  -jar "C:/Users/toshr/.workbuddy-ai/binaries/android-tools/android-sdk/build-tools/36.0.0/lib/apksigner.jar" \
  verify --print-certs "$APK"
```

### 5b. Verify the CI APK (after `git push`)

```bash
# statut des runs (sans auth — dépôt public)
curl -s https://api.github.com/repos/jelliel/THEOLOGICUS/actions/runs?per_page=3 | python -c "
import sys,json
for r in json.loads(sys.stdin.read())['workflow_runs']:
    print(r['id'], r['status'], r['conclusion'], r['head_sha'][:7])"
# attendre la fin du run : ~6-7 min du push au vert (queue incluse)
# PIEGE : imprimer `status` EN PREMIER. Sinon le glob `completed*` ne matche
# jamais et la boucle tourne ses 40 iterations pour rien (20 min perdues).
for i in $(seq 1 40); do
  S=$(curl -s "https://api.github.com/repos/jelliel/THEOLOGICUS/actions/runs?per_page=1" | python -c "
import sys,json
r=json.loads(sys.stdin.read())['workflow_runs'][0]
print(r['status'], r['conclusion'] or '-', r['id'])")
  echo "[$i] $S"
  case "$S" in completed*) break;; esac
  sleep 30
done
# release apk-v2.0.NN (tag = 2.0.{commit_count_after_push} — plus 1.0.x)
curl -s "https://api.github.com/repos/jelliel/THEOLOGICUS/releases/tags/apk-v2.0.NN" | python -c "
import sys,json
r = json.loads(sys.stdin.read())
print(r['tag_name'])
for a in r.get('assets',[]): print(' -', a['name'], a['size'])"
# télécharger.  PIEGE : /tmp n'est PAS accessible en écriture ici.
# Utiliser C:/Theologicus/.workbuddy-ai/artifacts/_verify/
curl -sL -o _verify/ci.apk https://github.com/jelliel/THEOLOGICUS/releases/download/apk-v2.0.NN/app-release.apk
JAVA="C:/Users/toshr/.workbuddy-ai/binaries/android-tools/jdk21/jdk-21.0.12.1+1/bin/java.exe"
"$JAVA" -jar .../apksigner.jar verify --print-certs _verify/ci.apk   # doit rester 93d832…
# contenu du fix + comptage des corpus locaux
python -c "import zipfile
z=zipfile.ZipFile('_verify/ci.apk'); n=z.namelist()
h=z.read('assets/public/index.html').decode('utf-8','replace')
print('vNN —', h.count('vNN —'))
for d in ['bible','quran','tafsir','summa','fathers','reformed','orthodox','islamic']:
    print(d, len([x for x in n if x.startswith('assets/public/%s/'%d)]))"
```

### 6. Commit & push

```bash
GIT_TERMINAL_PROMPT=0 git add THEOLOGICUS.html
GIT_TERMINAL_PROMPT=0 git commit -m "vNN: short description"
GIT_TERMINAL_PROMPT=0 git push origin main
```

Pushes **do** work (Git Credential Manager). Always pass `GIT_TERMINAL_PROMPT=0`
or the push hangs. CI status with no auth:
`curl -s https://api.github.com/repos/jelliel/THEOLOGICUS/actions/runs?per_page=3`

**A successful push does not mean a Release will be built.** The workflow
triggers on `push` **filtered by `paths:`**. A commit that touches none of the
listed paths is accepted by GitHub and silently ignored — no CI run, no Release,
which from the outside looks exactly like "the push never arrived". This
happened with a commit touching only `.workbuddy-ai/`.

Listed paths: `THEOLOGICUS.html`, `bible/**`, `quran/**`, `tafsir/**`,
`libs/**`, `android/**`, `tools/**`, `app.py`, `installer.iss`,
`build_installer.bat`, `THEOLOGICUS.ico`, `VERSION`, `package.json`,
`package-lock.json`, `capacitor.config.json`, `.github/workflows/build-apk.yml`.

So: **when a Release is expected, confirm a run actually exists.** `git ls-remote`
proves the commit landed, nothing more. Compare the run's `head_sha` to your HEAD:

```bash
git rev-parse HEAD
curl -s "https://api.github.com/repos/jelliel/THEOLOGICUS/actions/runs?per_page=1" \
  | python -c "import sys,json;r=json.load(sys.stdin)['workflow_runs'][0];print(r['head_sha'],r['status'],r['conclusion'])"
```

If no run appears for your SHA, the commit is real but invisible to CI — add the
file you changed to the `paths:` filter (and revalidate the YAML before
committing; a syntax error there breaks every future build silently).

Note the release tag is `2.0.{commit_count_after_push}` — it jumps by one for the
triggering commit itself, so read the tag from the API rather than predicting it.

**Release assets cannot be downloaded from this sandbox** — `curl` against
`releases/download/...` returns an empty file. Verify the run instead by walking
the jobs and their steps via the API; a `success` on both `build` and `windows`
with no failing step is the strongest available evidence from here.

## Non-obvious traps

- **A new version number does not mean new code.** An APK once shipped with the
  bumped version and the *old* HTML, because `cap sync` failed silently. Grep
  the packaged assets for your marker every time.
- **`THEOLOGICUS.html` is CRLF.** Searching multi-line patterns with `\n` in the
  packaged assets returns a false negative. Use `\r\n`.
- **The `Edit` tool silently no-ops on some multi-line anchors here.** It returns
  "Successfully edited" but the text is absent (re-grep to confirm). Triggered by
  anchors matching >1 spot or spanning blank/`});` lines. Always re-grep after
  each Edit on this file; prefer short, distinctive, emoji-free anchors (a unique
  `/* vNN — … */` comment line) over long blocks.
- **Corpus-hook-dependent globals aren't ready at first chat render.** e.g.
  `window.__parseQuranRef` is only set when the Quran corpus hook fires, which a
  chat render may precede. For anything that must work on first paint (inline
  verification marks, etc.), define local parser/verify-state functions inside
  the engine instead of relying on those late globals.
- **Don't grep report labels.** Strings like `'direct: 1'` were labels printed by
  a check script, not code. Search the real code fragment instead.
- **`versionCode` = `git rev-list --count HEAD`**, so it bumps on every commit.
  CI needs `fetch-depth: 0`.
- **Without the keystore** at
  `C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.jks` (alias
  `theologicus`) there is no more publishable update — the signature must stay
  identical or users must uninstall first.
- **The root `VERSION` file is stale** (`1.0.10`) and `prepare_mobile.py` falls
  back to it. Always pass `APK_VERSION_NAME=2.0.<rev-list count>` so the version
  shown in the app matches the one in the APK — releases are tagged
  `apk-v2.0.<N>` since 2026-09-18, never `1.0.x`. Also copy
  `mobile/www/version.txt` into `android/app/src/main/assets/public/` — step 3
  only copies `index.html`, so `version.txt` otherwise keeps an ancient value.
- **Native memory**: `AndroidManifest.xml` has **no** `android:largeHeap`. Any
  bridge payload above a few tens of MB kills the app. Never pass a whole file
  as a Base64 string across the bridge — open the SAF session first, then push
  chunks (`SavePickerPlugin.saveAs` → `writeChunk` → `finish`).

## Testing UI behaviour without a phone

`_diag_v44.js` at the workspace root is a working CDP harness (Chrome headless,
`ws`, 412×915, `window.Capacitor = { isNativePlatform: () => true }`).
`_diag_v20.js` is the v2.0 one (105 checks A→N: corpora, Summa FR, chips).
Both are ignored by `.gitignore` (`_*.js`) — they never get committed, so run
them locally:

```bash
cd /c/Theologicus && NODE_PATH="C:/Users/toshr/.workbuddy-ai/binaries/node/workspace/node_modules" \
  C:/Users/toshr/.workbuddy-ai/binaries/node/versions/22.22.2-2/node.exe _diag_v20.js
```

It serves `mobile/www` — so **regenerate `mobile/www/index.html` (step 2) before
running it**, or you are testing yesterday's code.

- **Injecting a `<div>` into `<body>` does not survive**: the app re-renders
  `#chat-container` asynchronously and removes it, along with your selection.
  Create a real message via the internal state instead — `state` is a top-level
  `let` and `renderMessages()` a global, both reachable by name from
  `Runtime.evaluate`.
- Then **wait ~350 ms, select, and retry once** if `#atc-bubble` did not appear:
  the first attempt is often swallowed by a re-render.
- Pipeline a CDP script through `timeout 180 node …` **without** piping to
  `tail` — the pipe buffers and looks like a hang.
- `Input.dispatchTouchEvent` can hang; test gesture logic with synthetic
  `TouchEvent`/`MouseEvent` instead.
- Measure with `getBoundingClientRect()` before touching layout CSS. Two
  a-priori reasoning attempts were wrong; one measurement settled it.
- `_diag_v46.js` replays synthetic `Touch`/`TouchEvent` gestures (long press,
  double tap, drag) and reports which menu opened. When testing a
  "close on outside tap" handler, pick a point **outside** the menu's rect —
  `elementFromPoint` at the menu's own coordinates hits the menu, and the
  handler correctly does nothing.
- `_diag_save.js` mocks the whole Capacitor bridge, not just one plugin. The
  mobile shim starts with `if (!FS) return;`, so **you must mock
  `Plugins.Filesystem` too** or the shim never installs and every test silently
  reports nothing. Make `ev()` inspect `r.result.exceptionDetails` — otherwise a
  broken test returns `undefined` and looks like a pass.

## The Windows build is a second packaging, with its own file list

The same repo has a `windows` job: PyInstaller (`app.py`, pywebview/WebView2)
→ `dist/THEOLOGICUS/` → `THEOLOGICUS-portable-win64.zip`, plus Inno Setup
(`installer.iss`) → `THEOLOGICUS-Setup-x64.exe`.

**Every new corpus must be added to three lists, not one:**

1. `COPY_DIRS` in `tools/prepare_mobile.py` (Android),
2. the `foreach` list in the `windows` job of `.github/workflows/build-apk.yml`,
3. `build_installer.bat` (local Windows build).

A forgotten list does **not** break the build — it produces 404s at runtime
(the five library tabs and the Summa silently returned 404 in the exe while the
APK had them). This is the Windows counterpart of the corpus plan: offline
means the files must be *shipped*, not just referenced.

The exe gets the HTML fix automatically (the job copies `THEOLOGICUS.html`), so
verify Windows by unzipping the published artifact and grepping the markers —
not by rebuilding locally. Version is injected into Inno with
`ISCC installer.iss /DMyAppVersion=2.0.N` (`#ifndef` guard in `installer.iss`);
in CI the installer step is `continue-on-error` so the portable zip still
ships if Inno Setup misbehaves. CI installers are **unsigned** (the local
`build_installer.bat` signs with a PFX that is not in the repo).

### The Windows exe reads the HTML from DISK — no rebuild needed

Measured, not assumed: `THEOLOGICUS.exe` (5.58 MB) contains **0** occurrences of
`<!DOCTYPE html` and of `detectScriptLang` — likewise
`build/THEOLOGICUS/THEOLOGICUS.pkg`. `app.py` line 120 sets

```python
proxy_server.SERVE_DIR = base   # base = folder of the exe
```

so the running app serves `THEOLOGICUS.html` **sitting next to the exe**.
**A fix to the HTML is live as soon as that file is replaced — there is nothing
to recompile.**

Two consequences, both learned the hard way (user report: *"sur Windows je vois
que ce n'est pas changé"*, while the repo was already correct):

1. **The HTML exists in FOUR places.** A fix applied only to the source shows up
   nowhere. Measured spread: `THEOLOGICUS.html` (source), `mobile/www/index.html`
   (APK), `dist/THEOLOGICUS/THEOLOGICUS.html` (Windows distribution),
   `_inst_v102/THEOLOGICUS.html` (the local install actually launched).
   **Run `python tools/sync_html.py` after every fix**, then
   `--check` to confirm. The script refuses to overwrite a *larger* target
   (a truncated source must never clobber a complete copy).
2. **WebView2 keeps the HTML loaded at start-up.** Replacing the file while the
   app is running changes **nothing on screen**. The user must **quit and
   relaunch**. Do not claim a Windows fix is visible without saying this.

**Which folder is the app actually using?** Do not try to read the process path
(`Get-Process .Path` returns empty, the `Win32_Process` query is refused, and
`cmd.exe` cannot be invoked from PowerShell under the sandbox). Use the log
instead: `THEOLOGICUS.log` is appended **inside the app's own folder** while it
runs, so the most recently written log names the live installation.

**Verify a copy by its VERDICT, never by a marker.** A header comment
containing "v107" proves nothing — `grep -c` on such a marker once counted the
very comments this skill's author had just written, while the file was stale.
Measure behaviour (`detectScriptLang(...)`, the chosen voice name) with
`_tts/mesure_cible.js`.

### Rebuilding the installer locally

**Use `py -3.12 tools/build_windows.py`.** It replays `build_installer.bat` step
for step and is the only route that works from the agent environment.

`build_installer.bat` itself is a dead end there, and so is every way of
launching it. Measured 2026-09-24, in order:

- `cmd //c build_installer.bat` — `cmd.exe` is refused by the **Bash** tool
  ("bypasses all command validation") and by the **PowerShell** tool.
- `& "…\build_installer.bat" *>&1 | Tee-Object` — PowerShell refuses to put a
  document in a pipeline: `CantActivateDocumentInPipeline`.
- Plain `& "…\build_installer.bat"` — returns in 574 ms, prints only
  `=== code de sortie : ===`, produces nothing.
- The decisive test: a 3-line `_test_bat.bat` that writes a proof file, launched
  from PowerShell, **created no proof file**. Batch files simply do not execute.

The steps `build_windows.py` performs:

1. Version = `git rev-list --count HEAD` → `2.0.<n>`; it **refuses to build**
   with a default version (that is how a build once announced 1.0.33).
2. PyInstaller **without `--clean`**, after moving the old dirs aside (below).
3. Copy `THEOLOGICUS.html`, each corpus dir, `libs/`, the icon, `tools/`;
   empty `theologicus_keys.json`; `tools/stamp_version.py dist/THEOLOGICUS 2.0.<n>`.
4. `signtool sign /f THEOLOGICUS_signing.pfx /p <pw> /fd SHA256 ...` on the exe.
5. `ISCC installer.iss /DMyAppVersion=2.0.<n>`, then sign the setup exe.

**Move aside, never delete.** The bulk-delete guard does not only block
`shutil.rmtree`: **PyInstaller's own `COLLECT` stage trips on it too**
(`Removing dir C:\Theologicus\dist\THEOLOGICUS`, 2961 targets →
`SAFE_DELETE_BULK_CONFIRM_REQUIRED`, threshold 50) and the build dies with a
bare `[X] Echec a l'etape : PyInstaller (code 1)`. `build_windows.py` renames`build/THEOLOGICUS` and `dist/THEOLOGICUS` to `*.retire` **before** PyInstaller
runs. COLLECT then finds no directory to remove, so it creates a clean one — and
because the directory is virgin, **the purge-after-PyInstaller step becomes
unnecessary**. That is strictly better than the `.bat`, which purges afterwards.

> Earlier guidance here said to purge `dist/THEOLOGICUS` before copying data in.
> That is still the *intent*; the rename achieves it without the guard, and
> without the risk of destroying the freshly built binary.

**`_internal` on an in-place upgrade: 44 stale files, harmless.** Measured: old
301 files, new 257, and **no file of the new set is missing from the old one**.
All 44 are `api-ms-win-*-l1-1-0.dll` API-set stubs PyInstaller no longer ships.
No `[InstallDelete]` was added to `installer.iss` — a measured decision, not a
precaution.

**Nuance on the purge order.** PyInstaller's `COLLECT` step **recreates** the
directory and writes the exe into it — so the correct sequence is: move aside →
PyInstaller → copy data *over* the result. Purging after PyInstaller destroys
the binary and makes `signtool` fail with `File not found`.

### Proving what the INSTALLER actually ships (v120)

**The tree on disk is not evidence of what was packaged.** After a build,
`sync_html.py` re-copies the *unstamped* source over `dist`'s stamped file, so
`dist/THEOLOGICUS/THEOLOGICUS.html` shows `STAMPED = '__THEO_VERSION__'` while
`dist/version.txt` still says `2.0.155`. Reading that as "the build shipped a
pre-fix HTML" is a **false alarm** — and it is an easy one to raise, because the
disk genuinely looks wrong. Use one of these instead:

- **Run the published installer silently and read what it drops.** This is the
  only direct proof:
  ```
  cmd //c "THEOLOGICUS-Setup-x64.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART \
      /DIR=C:\tmp\dest /LOG=C:\tmp\dest\install.log"
  ```
  then grep the delivered `THEOLOGICUS.html` for the feature marker **and** the
  stamp, and read `version.txt`. Keep `/DIR` outside the install dir.
  **Launch it through `cmd //c` in Git Bash.** A direct `./Setup.exe /DIR=...`
  from Bash returns **`EXIT=0` and installs nothing** — backslashes are eaten,
  the log is never written, and the exit code lies.
- **Never infer the HTML from the exe.** The PyInstaller archive holds **13
  entries and none of them is the HTML** — only `app.py` is embedded, and the
  app reads the HTML from disk. A raw `strings` scan finds no version either:
  `dist/THEOLOGICUS/THEOLOGICUS.exe` contains **no `2.0.` at all**, in ASCII or
  UTF-16. The version is legible only via `version.txt` and the HTML stamp.
  (A raw scan of the exe also cannot see `proxy_server.py`'s routes — PyInstaller
  **compresses**; walk the **zlib streams** instead.)

**Prove the exe, not the source.** `proxy_server.py` is compiled **into** the
exe, so reading the source proves nothing about what ships.
`.workbuddy-ai/artifacts/_tts/verifie_exe.py` launches the real exe with
`THEOLOGICUS_NO_WINDOW=1` and probes its routes. Two traps it avoids: a **closed
port answers 502** here, so `curl … && echo OK` is a false positive (use
`urllib`, which raises, and validate the JSON body); and **each shell invocation
has its own network namespace**, so launching the exe and probing it must share
a single process — an exe started in one invocation is unreachable from the
next. Reference result: 23 checks, 0 failures.

**The local `dist/` is a vestige and must not be trusted.** It does not refresh
itself; a 6-day-old installer carried only `bible quran tafsir libs` with no
`biblehb`, and an afternoon `dist/` still carried the pre-fix
`#verse-mini-tip{z-index:130000}` after that defect had been fixed in source.
Always grep the built `dist/THEOLOGICUS/THEOLOGICUS.html` for the *specific fix*
you shipped — the version stamp alone proves nothing about content.

**Proving the delivered HTML matches the source.** `stamp_version.py` replaces
the literal `__THEO_VERSION__` placeholder, so a naive comparison always shows a
small diff. Neutralise **both** sides — the placeholder *and* the stamped value —
then require exact equality:

```python
na = re.sub(r'2\.0\.\d+|__THEO_VERSION__', '__V__', source)
nb = re.sub(r'2\.0\.\d+|__THEO_VERSION__', '__V__', delivered)
assert na == nb
```

**Never overwrite a target that is bigger than the source (v117).** Two
consecutive builds on 2026-09-24 wrote a `dist/THEOLOGICUS/THEOLOGICUS.html`
**9 bytes older** than `THEOLOGICUS.html`, which `robocopy /E` then pushed to
`_inst_v102` — the app served a version predating the fix just written. This is
the "an unsynced fix is invisible" trap again, in a new place. `copier()` in
`build_windows.py` now **refuses and exits** when the destination already exists
and is larger than the source; a shrink is always a bad overwrite, never
compression.

**`sync_html.py` used to cry "PERIMEE" falsely.** Because the build stamps the
version, `dist`/`_inst_v102` are legitimately a few bytes *smaller* than the
source — and the script reported that as stale, so the "fix" was to re-copy a
file that was already correct, over and over. It now recognises the stamp
(`var STAMPED = '<value>'` where the value is not the placeholder) and reports
`deployee (version estampillee par le build)`. Check the stamp before concluding
anything about staleness.

**...but the stamp alone is NOT proof of freshness (v120).** This is the same
trap turned inside out, and it reached the installed app. `sync_html.py`
accepted ANY target carrying a version stamp as up to date, **without ever
comparing freshness**. The stamp only proves the file came out of a build — not
that it is recent. After the v120 build, `_inst_v102/THEOLOGICUS.html` was a
file from **05:53, 1 472 675 bytes**, missing the new STUDIO VIDÉO button, while
`sync_html.py` happily printed `OK` and `0 copie(s) mise a jour`. The app that
ships to the user was missing the feature just written, and every green light
said otherwise.

The check now also requires the target to be at least as recent as the source
(`os.path.getmtime(cible) >= os.path.getmtime(source)`); otherwise it prints
`deployee mais PLUS ANCIENNE que la source` and copies. The copy path was moved
inside `if not estampille:` so a stale-but-stamped file is never skipped.

Rule to carry: **a freshness verdict must compare `mtime`, never a marker.**
Any check that infers "up to date" from a content property rather than from the
source's timestamp is a false negative waiting to happen. After every build,
assert the 4 copies are identical by md5 — not by the script's own verdict.

### The port must be stable, or the browser store is empty (v117)

**The symptom looked like storage loss and was a port bug.** An origin is
`scheme://host:port`. Two ports are two origins, hence two distinct browser
stores — localStorage, IndexedDB *and* cookies. `app.py` used
`bind(("127.0.0.1", 0))` as a fallback, and port 0 returns a **pseudo-random**
port. So the moment anything else held 8765, the app started on a fresh origin
and the API key and configuration appeared wiped, while `GET /theologicus-keys`
and `GET /config` were returning **200 on every launch**.

Measured on the machine: a foreign `python.exe serve.py` held **8765, 8766 and
8767**, and `THEOLOGICUS.exe` was listening on **61568**. A random port is not
reproducible, which is why the symptom read as intermittent.

Current design: port range **8765–8780**, first free port wins (deterministic,
never random); an already-running instance is detected via the
`/__theologicus_ping` identity probe (falling back to sniffing `THEOLOGICUS.html`
so an instance from an older exe is still recognised) and its port is **reused**,
guaranteeing the same origin. The chosen port is **logged at startup** — without
it this symptom was undiagnosable, which is a large part of why it took so long.

Two things that were *not* the cause, both verified: the WebView2 profile **is**
persistent (pywebview's `init_storage()` uses `%APPDATA%/pywebview` when
`private_mode=False` and `storage_path` is unset, and `app.py` passes
`private_mode=False`), and the durable config files were being served correctly.
Bench: `_v117/verify_port.py`, 10/10.

Neutralising only the numbered side leaves a ~10-byte phantom diff that looks
like a content divergence.

**Then install it for real.** `THEOLOGICUS-Setup-x64.exe /VERYSILENT
/SUPPRESSMSGBOXES /NORESTART /DIR=<tmp> /LOG=<tmp>\install.log`, and assert on
what landed on disk (corpus dir count, `version.txt`, and the same
placeholder-neutralised HTML comparison against the installed copy). A `grep`
over `dist/` does not prove what Inno deposited.

`signtool` prints `exit=0` even on failure — read the output, not the return
code. `verify /pa` always fails with "root certificate not trusted" for a
self-signed PFX; that is expected, not a defect.

## Self-update: the app looks for release assets by exact name

Since v74 the app checks
`https://api.github.com/repos/jelliel/THEOLOGICUS/releases/latest` and
installs the matching asset: **`app-release.apk`** on Android (Capacitor
plugin `UpdateBridge`), **`THEOLOGICUS-Setup-x64.exe`** on Windows (pywebview
`js_api` → `DesktopApi.install_update` in `app.py`).

**Renaming an asset in the workflow silently breaks updates** — the build still
passes, nothing warns, and the user just never gets offered anything (or falls
back to opening the download page). If you touch the release step, keep those
two names.

The compiled parts cannot be checked by grepping the published installers
(Inno compresses with lzma2, PyInstaller stores Python in a compressed PYZ).
Verify them the other way round: `./gradlew compileReleaseJavaWithJavac` for
any Java change (~30 s, catches a plugin that would crash CI), and
`python -c "import app; app.DesktopApi().install_update('http://x/y.exe')"`
for the Windows API.

## Animations on the Android WebView — the trap that cost three releases

**A CSS `@keyframes` animation can be armed, reported by
`getComputedStyle(el).animationName`, and never run.** Two marquee versions
shipped like that: every harness check passed, the phone showed a truncated
chip with `…`. The declaration lies; only the measurement counts.

Rules:

- Drive motion from JavaScript (`el.animate(...)`), not from CSS.
- **Never assert on `animationName`** in a test — it cannot fail. Advance the
  animation by hand (`anim.currentTime = delay + duration * 0.5`) and read
  `getComputedStyle(el).transform` (parse `matrix(...)` index 4 for tx).
- **Verify at runtime on the device**: ~900 ms after the element becomes
  visible, measure the real displacement. If it is still 0, fall back to a
  layout that needs no animation (wrap on several lines). The user then reads
  the whole text either way.
- Gate on `IntersectionObserver` (pause off-screen) and pause on `pointerdown`,
  with a ~1.5 s safety resume: `pointerup` is not guaranteed on Android.

Related DOM traps on the same WebView:

- **`scrollWidth` is frozen to `clientWidth`** on an element with
  `overflow:hidden` + `text-overflow:ellipsis`. Measure the **inner** element
  (no ellipsis) instead.
- **A zero measurement is not "it fits"** — the element may simply not be laid
  out yet. Re-measure later (bounded retries) instead of concluding.
- **Measure the available width before calling it a bug.** A component that
  overflows on a 412 px phone can fit perfectly in a 1011 px desktop column, so
  the "missing" animation is simply not armed — correct behaviour, unexpected
  by the user. Probe several window widths (`Emulation.setDeviceMetricsOverride`
  over 1280/1024/820/412/360) before touching the engine-level code.
  Fixing that case means changing the *layout* (cap the width, e.g.
  `max-width: min(100%, 420px)` with a plain `100%` fallback line before it),
  not the animation.

## Debugging mobile-only complaints

- **"I get A *in addition to* B"** often means B was **never closed**, not that
  two triggers fire. Check the close handlers first. On Android a long press
  emits `contextmenu` but **no** `mousedown`, so any `mousedown`-only close
  handler silently never runs.
- Before guessing, **list every caller** of the function that opens the UI.
  Eliminating the ones that cannot match the described gesture found a cause
  that two plausible hypotheses had been competing with.

## Repo hygiene — the rules that must not be relearned

- **The user wants a commit + push for EVERY fix.** Not batched, not offered.
  Commit messages in **English**, via `git commit -F <fichier>` (never `printf`:
  a literal `100%` invalidates the format string).
- **`git add -A` on this repo can die on SIGTERM and leave a stale
  `.git/index.lock`.** Measured 2026-09-25: with ~99 changed entries plus a
  1.5 MB `THEOLOGICUS.html`, `git add -A && git commit` exceeded the timeout,
  was killed, and the orphan lock then made every later call fail with
  *"Another git process seems to be running"*. Two habits that work:
  1. **Stage the paths explicitly** — `git add THEOLOGICUS.html proxy_server.py
     .workbuddy-ai/artifacts/_vNNN ...` — then `git commit -F`. Staging the few
     real files is instant; `-A` walks everything.
  2. If an attempt is killed, **`rm -f .git/index.lock`** before retrying. An
     empty (0-byte) lock left by a dead process is always safe to remove; check
     the timestamp first if unsure.
  A SIGTERM mid-command is **not** a failure of the commit itself — always
  re-read `git log --oneline -1` before assuming the work is lost.
- **NEVER run `git stash` in this workspace.** An interrupted `git stash`
  (SIGTERM) destroyed `.git/refs` **and** the `.pack` on 2026-09-22; git then
  answers *"not a git repository"*. The remote is the backup — everything pushed
  is recoverable, nothing local is.
- **The workflow filters on `paths:`** — a push touching none of the listed paths
  triggers **NOTHING**. Watched: `THEOLOGICUS.html`, `bible/**`, `quran/**`,
  `tafsir/**`, `libs/**`, `android/**`, `tools/**`, `app.py`, `installer.iss`,
  `build_installer.bat`, `THEOLOGICUS.ico`, `VERSION`, `package*.json`,
  `capacitor.config.json`, the workflow itself.
- **After a push, prove a CI run exists** —
  `api.github.com/repos/jelliel/THEOLOGICUS/actions/runs`, compare `head_sha`.
  The sandbox blocks downloading Release assets, so verify through the Actions
  API, never by fetching the binary.
- `git fetch` does **not** write tracking refs here: use `git ls-remote` for the
  remote state. To verify a published file, `curl -sL` from
  `raw.githubusercontent.com` then `cmp`.
- **Never commit**: `android/local.properties`, `android/release.keystore`,
  `mobile/www/*`, `theologicus_keys.json`.
- **Secrets live at the repo root**: `THEOLOGICUS_signing.pfx`, `signing_key.pem`,
  `signing_cert.pem`, `mistral api key.txt`. `.gitignore` patterns: `*.pfx`
  `*.p12` `*.jks` `*.keystore` `*.pem` `*.key` + `*api key*.txt` `*secret*`
  `*credential*` `*.apk` `*.aab`. **Mandatory control** —
  `git ls-files | git check-ignore --stdin` must return **empty**.
- **Whatever must stay out of the repo is written in `.gitignore`; it is not
  remembered.** Verify with `git check-ignore` and `git add -An`.
- Version = `git rev-list --count HEAD` (2.0.N). **Never announce a number before
  reading it from the API.**
- Drive C: is full (99 %). CDP bench Chrome profiles live in `%TEMP%\theo-*` —
  clean them up after a campaign. The `artifacts/` `.apk` files (~428 MB) are
  local residue and **the user has decided nothing gets deleted**.

## Vérifier ce qui est LIVRÉ, jamais le dépôt (v121)

Une chaîne de preuve complète, sur la release publiée :

1. **Télécharger** `THEOLOGICUS-Setup-x64.exe` depuis la release.
2. **Installer en silence** dans un dossier jetable :
   `cmd //c "Setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR=C://Temp//test"`
   (**`cmd //c` obligatoire** depuis Git Bash — un `./Setup.exe /DIR=…` direct
   rend `EXIT=0` et n'installe **rien**).
3. **Inspecter le HTML livré** : `STAMPED = 'x.y.z'`, présence des nouveaux
   identifiants, **absence** des anciens, présence des correctifs symptomatiques
   (`_SEL = id => document.getElementById`).
4. **Démarrer l'exe INSTALLÉ** et sonder les routes **en HTTP réel**.

**Comparer les empreintes md5 ne prouve RIEN ici.** Le Setup local et le Setup
publié **diffèrent** légitimement : deux compilations du même commit produisent
des horodatages et un ordre de compression différents (mesuré :
`63ef08f1…` en local contre `f6a15786…` en publié, même source). C'est le
**contenu** qu'il faut inspecter.

**L'exe windowed se ferme** quand le shell qui l'a lancé en arrière-plan se
détache (mesuré : ~26 s). Conséquence pratique : lancer l'exe et **sonder dans
la même invocation**, sinon le probe tombe sur `ERR_CONNECTION_REFUSED` et on
croit à tort que les routes manquent.

**Lire les constantes compilées** pour vérifier un `proxy_server.py` embarqué :
les chaînes sont dans le PYZ, un `open(exe,'rb')` et un `count()` rendent **0**
et laisseraient croire à un build périmé.

```python
from PyInstaller.archive.readers import CArchiveReader
from PyInstaller.loader.pyimod01_archive import ZlibArchiveReader
ar = CArchiveReader(exe); open(tmp,'wb').write(ar.extract('PYZ.pyz'))
z = ZlibArchiveReader(tmp); code = z.extract('proxy_server')
# co_names des fonctions, co_consts des routes
```

Attention : `ZlibArchiveReader` veut un **chemin**, pas un `BytesIO` (il fait
`rfind('?')` sur le nom).
