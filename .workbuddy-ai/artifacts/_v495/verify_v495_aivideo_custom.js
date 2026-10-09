// Banc v495 — MODÈLES PERSONNALISÉS dans AI VIDEO.
//
// Vérifie la NOUVELLE configuration permettant d'ajouter ses propres modèles
// (endpoint URL, clé API, model ID) avec un bouton « 🔄 Fetch models » et un
// bouton « 💾 Enregistrer », puis leur utilisation pour la GÉNÉRATION D'IMAGE
// (OpenAI-compatible /images/generations).
//
// Le banc n'utilise QUE des doublures : l'endpoint personnalisé est simulé par
// un routeur Playwright (aucune vraie API, aucun coût). Il vérifie que :
//   · le panneau de configuration existe (champs + boutons) ;
//   · « Fetch » interroge {endpoint}/models et remplit la liste ;
//   · « Enregistrer » persiste le modèle (localStorage) et l'affiche ;
//   · « Image » (toggle) marque le modèle comme modèle d'image ;
//   · genererImage route l'appel vers l'endpoint PERSONNALISÉ (pas Agnes) ;
//   · « 🗑️ » supprime le modèle.
//
// Usage : node verify_v495_aivideo_custom.js [--port 8765]

const path = require("path");
const { spawn } = require("child_process");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");
const net = require("net");
const { execSync } = require("child_process");

// L'environnement de dev peut exposer un mandataire (proxy) système. Celui-ci
// intercepte TOUTES les requêtes, y compris vers 127.0.0.1, et renvoie un 502
// (« upstream connect failed ») au lieu de laisser le navigateur joindre le
// relais local. On neutralise tout mandataire pour que Node (ping) ET Chromium
// (chargement de l'iframe /ai-video.html) atteignent bien le relais local.
for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "FTP_PROXY", "ftp_proxy"]) {
  delete process.env[k];
}
process.env.NO_PROXY = "*";
process.env.no_proxy = "*";

// TUE tout processus déjà collé sur le port du relais : une exécution
// précédente (plantée) peut avoir laissé un proxy_server.py périmé qui
// répondrait 404/502 sur /ai-video.html et ferait basculer l'iframe sur
// l'embarqué. Windows uniquement (no-op ailleurs).
function tuerPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const pids = new Set();
    out.split("\n").forEach(l => {
      // netstat -ano : « TCP  0.0.0.0:8765  0.0.0.0:0  LISTENING  21008 »
      // → le PID vient APRÈS « LISTENING » (et non avant). L'ancienne regex
      // (PID avant LISTENING) ne capturait rien : les relais périmés
      // survivaient et servaient une vieille copie d'ai-video.html.
      const m = l.match(new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`));
      if (m) pids.add(m[1]);
    });
    pids.forEach(p => { try { execSync(`taskkill /PID ${p} /F`, { stdio: "ignore" }); } catch (e) {} });
  } catch (e) { /* pas Windows ou rien à tuer */ }
}

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;

const RACINE = path.resolve(__dirname, "..", "..", "..");
// PY_BIN est fourni par la CI (python3) ; en local on retombe sur le Python
// géré. Même convention que verify_v458_montage_serveur.js.
const PY = process.env.PY_BIN || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";
const FAUX = "https://custom.test/v1";          // endpoint personnalisé simulé
const FAUX_HOTE = "custom.test";

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}
function section(t) { console.log("\n" + t); }
// Le setup-wizard peut réapparaître (selon le timing d'authentification) et
// intercepte alors tous les clics (overlay plein écran). On le masque
// explicitement après chaque navigation, en plus du drapeau addInitScript.
async function masquerWizard(page) {
  await page.evaluate(() => {
    const ov = document.getElementById('setup-wizard-overlay');
    if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; }
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
  }).catch(() => {});
}

let relais = null;
async function relaisVit() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`, { signal: AbortSignal.timeout(3000) });
    return r.status === 200;
  } catch (e) { return false; }
}
async function assurerRelais() {
  // On démarre TOUJOURS un relais propre depuis RACINE : un restant d'une
  // exécution précédente (plantée) pourrait servir depuis un mauvais
  // répertoire et renvoyer 404 sur /ai-video.html. On tue tout résidu.
  tuerPort(PORT);
  await new Promise(r => setTimeout(r, 600));
  console.log("  … lancement de proxy_server.py (port " + PORT + ")");
  relais = spawn(PY, ["-u", "proxy_server.py"], { cwd: RACINE, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await relaisVit()) return true;
    if (relais.exitCode !== null) return false;
  }
  return false;
}

// Routeur de doublure pour l'endpoint personnalisé (et Agnes/Mistral → continue).
function armerRouteur(page, cpt) {
  return page.route("**/proxy/**", async (route) => {
    const u = route.request().url();
    // Endpoint personnalisé simulé.
    if (u.includes(FAUX_HOTE)) {
      if (u.endsWith("/models")) {
        await route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ data: [{ id: "sdxl-1.0" }, { id: "sdxl-2.0" }] }) });
        return;
      }
      if (u.endsWith("/images/generations")) {
        cpt.custom++;
        await route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ data: [{ b64_json: "AAAA" }] }) });
        return;
      }
      if (u.endsWith("/videos")) {
        cpt.video = (cpt.video || 0) + 1;
        await route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ video_id: "fake-vid-998" }) });
        return;
      }
      if (u.includes("/agnesapi")) {
        await route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ status: "succeeded", progress: 100, metadata: { url: "https://custom.test/v1/fake.mp4" } }) });
        return;
      }
    }
    // Tout le reste (Agnes/Mistral) : laissé au relais réel.
    await route.continue();
  });
}

const I = {
  set(id, val) { return `(d)=>{const e=d.getElementById('${id}'); if(e) e.value=${JSON.stringify(val)};}`; },
};

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v494 — MODÈLES PERSONNALISÉS (AI VIDEO)");
  console.log("Port relais : " + PORT);
  console.log(BASE);
  console.log("=".repeat(72));

  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const cpt = { custom: 0, agn: 0, video: 0 };
  // Connexion DIRECTE : aucun mandataire système ne doit intercepter
  // 127.0.0.1 (sinon l'iframe /ai-video.html tombe sur un 502 et bascule
  // sur l'embarqué périmé). --no-proxy-server est la méthode fiable.
  // executablePath n'est imposé QU'EN LOCAL (PW_DIR fourni) ; en CI, Playwright
  // utilise le Chromium qu'il a installé lui-même.
  const optionsNav = Object.assign(
    { args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {}
  );
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  // On ignore les erreurs RÉSEAU vers les fournisseurs externes (Agnes/Mistral…) :
  // en CI (sans clé réelle ni mandataire), la sonde de clé (_verifCle → GET
  // /models) renvoie un 401/403, et le navigateur journalise un
  // « Failed to load resource ». Ce n'est PAS une erreur du code testé (le
  // endpoint personnalisé, lui, est intercepté et renvoie 200). On ne tolère
  // QUE les vraies exceptions JS (pageerror) comme échecs.
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });
  await armerRouteur(page, cpt);

  section("0. Ouverture du modal AI VIDEO");
  // Le setup-wizard intercepte les clics (overlay plein écran). On le désactive
  // AVANT tout script de page, sur CHAQUE navigation, via addInitScript —
  // convention commune à tous les bancs. On pose aussi la clé Agnes (requise
  // par genererImage via getApiKey() dans l'iframe, même si on route ensuite
  // vers un endpoint personnalisé).
  await page.addInitScript(() => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_key", "sk-test");
    } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((h) => {
    const enc = new TextEncoder().encode("remember:" + h);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("theologicus_remember", JSON.stringify({ v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok }));
    });
  }, AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await masquerWizard(page);
  // v159 — le bouton AI VIDEO vit dans un panneau popup ouvert par « MEDIA ▾ ».
  const mediaBtn = await page.$("#v159-media-btn");
  if (mediaBtn) { await masquerWizard(page); await mediaBtn.click({ force: true }).catch(() => {}); await page.waitForTimeout(300); }
  await page.waitForSelector("#open-aivideo-modal", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.click("#open-aivideo-modal");
  await page.waitForFunction(() => {
    const f = document.getElementById("aivideo-frame"); const d = f && f.contentDocument;
    return !!d && !!d.body;
  }, { timeout: 30000 });
  const dv = () => page.evaluate(() => {
    const f = document.getElementById("aivideo-frame"); return f.contentDocument;
  });

  section("1. Le panneau de configuration existe");
  const champs = await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const ids = ["cm-name", "cm-endpoint", "cm-key", "cm-model-input", "cm-model-select", "cm-fetch-btn", "cm-save-btn", "cm-grid"];
    const present = {}; ids.forEach(i => present[i] = !!d.getElementById(i));
    return present;
  });
  ok("champ Nom présent", champs["cm-name"]);
  ok("champ Endpoint présent", champs["cm-endpoint"]);
  ok("champ Clé API présent", champs["cm-key"]);
  ok("champ Model ID présent", champs["cm-model-input"]);
  ok("select Model (Fetch) présent", champs["cm-model-select"]);
  ok("bouton Fetch présent", champs["cm-fetch-btn"]);
  ok("bouton Enregistrer présent", champs["cm-save-btn"]);
  ok("grille des modèles enregistrés présente", champs["cm-grid"]);

  section("2. « Fetch models » interroge l'endpoint et remplit la liste");
  await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    d.getElementById("cm-endpoint").value = "https://custom.test/v1";
  });
  await page.evaluate(() => document.getElementById("aivideo-frame").contentDocument.getElementById("cm-fetch-btn").click());
  await page.waitForTimeout(800);
  const fetchOk = await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const sel = d.getElementById("cm-model-select");
    return { visible: sel.style.display !== "none", opts: sel.options.length, txt: d.getElementById("cm-status-text").textContent };
  });
  ok("le select de modèles devient visible après Fetch", fetchOk.visible, JSON.stringify(fetchOk));
  ok("la liste contient les modèles renvoyés (2)", fetchOk.opts === 2, "opts=" + fetchOk.opts);

  section("3. « Enregistrer » persiste le modèle personnalisé");
  await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    d.getElementById("cm-name").value = "Mon SDXL";
    d.getElementById("cm-model-select").value = "sdxl-1.0";   // sélection via Fetch
  });
  await page.evaluate(() => document.getElementById("aivideo-frame").contentDocument.getElementById("cm-save-btn").click());
  await page.waitForTimeout(400);
  const sauve = await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const ls = JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2") || "[]");
    return { nb: ls.length, carte: d.querySelectorAll("#cm-grid .model-card").length, nom: ls[0] && ls[0].name, id: ls[0] && ls[0].id, ep: ls[0] && ls[0].endpoint };
  });
  ok("le modèle est persisté (localStorage)", sauve.nb === 1, JSON.stringify(sauve));
  ok("la carte s'affiche dans la grille", sauve.carte === 1, "cartes=" + sauve.carte);
  ok("le nom est conservé", sauve.nom === "Mon SDXL", sauve.nom);
  ok("l'endpoint est conservé", /custom\.test\/v1/.test(sauve.ep || ""), sauve.ep);

  section("3b. 🔌 Test de connexion (#1)");
  await page.evaluate(() => document.getElementById("aivideo-frame").contentDocument.getElementById("cm-test-btn").click());
  await page.waitForTimeout(700);
  const testOk = await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    return d.getElementById("cm-status-text").textContent;
  });
  ok("le test de connexion signale une connexion OK", /Connexion OK/i.test(testOk), testOk);

  section("3c. Paramètres par modèle (#5)");
  await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    // On ré-édite le modèle existant : endpoint + ID doivent être présents
    // (cmSave exige un Model ID).
    d.getElementById("cm-endpoint").value = "https://custom.test/v1";
    d.getElementById("cm-model-input").value = "sdxl-1.0";
    d.getElementById("cm-size").value = "768x768";
    d.getElementById("cm-quality").value = "hd";
    d.getElementById("cm-steps").value = "30";
  });
  await page.evaluate(() => document.getElementById("aivideo-frame").contentDocument.getElementById("cm-save-btn").click());
  await page.waitForTimeout(400);
  const params = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2") || "[]");
    const m = ls[0] || {};
    return { size: m.size, quality: m.quality, steps: m.steps };
  });
  ok("la taille est persistée", params.size === "768x768", "size=" + params.size);
  ok("la qualité est persistée", params.quality === "hd", "quality=" + params.quality);
  ok("les steps sont persistés", params.steps === "30", "steps=" + params.steps);

  section("3d. Cache du Fetch (#6)");
  const cache = await page.evaluate(() => {
    const cles = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("cinema_noir_cm_cache_v1") === 0) cles.push(k);
    }
    if (!cles.length) return null;
    return JSON.parse(localStorage.getItem(cles[0]));
  });
  ok("une entrée de cache existe pour l'endpoint", !!cache, JSON.stringify(cache));
  ok("le cache contient les 2 modèles listés", cache && cache.ids && cache.ids.length === 2, cache && ("ids=" + cache.ids));

  section("3e. Choix du modèle image à utiliser (#4)");
  await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const uid = JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2"))[0].uid;
    const sel = d.getElementById("cm-image-choice");
    sel.value = uid;
    sel.dispatchEvent(new Event("change"));
  });
  await page.waitForTimeout(300);
  const choix = await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const uid = JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2"))[0].uid;
    const cm = d.defaultView.customModelsImage ? d.defaultView.customModelsImage() : null;
    const ch = JSON.parse(localStorage.getItem("cinema_noir_cm_choice_v1") || "{}");
    return { id: cm && cm.id, choixImage: ch.image };
  });
  ok("customModelsImage() renvoie le modèle choisi", choix.id === "sdxl-1.0", "id=" + choix.id);
  ok("le choix image est persisté", choix.choixImage && choix.choixImage.length > 0, JSON.stringify(choix.choixImage));

  section("3f. Export / Import JSON (#3)");
  // Import d'un second modèle via un fichier temporaire.
  const tmpJson = require("path").join(require("os").tmpdir(), "cm_import_" + Date.now() + ".json");
  require("fs").writeFileSync(tmpJson, JSON.stringify({ version: 1, models: [{ uid: "cm_imp_1", name: "Importé XL", endpoint: "https://custom.test/v1", apiKey: "", id: "imported-xl", image: false, video: false, adapter: "agnes" }] }));
  await page.evaluate((p) => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const inp = d.getElementById("cm-import-file");
    inp.__setFileForTest = p;
  }, tmpJson);
  // Playwright : on pose le fichier via setInputFiles sur l'input réel.
  const importInput = await page.$("#aivideo-frame").then(() => page.evaluateHandle(() => document.getElementById("aivideo-frame").contentDocument.getElementById("cm-import-file")));
  await importInput.asElement().setInputFiles(tmpJson);
  await page.waitForTimeout(500);
  const importe = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2") || "[]");
    return { nb: ls.length, aImport: ls.some(m => m.id === "imported-xl") };
  });
  ok("l'import ajoute un modèle (total = 2)", importe.nb === 2, "nb=" + importe.nb);
  ok("le modèle importé est présent", importe.aImport);
  // Export : ne doit pas lever d'exception JS.
  await page.evaluate(() => document.getElementById("aivideo-frame").contentDocument.getElementById("cm-export-btn").click());
  await page.waitForTimeout(300);

  section("3g. Routage vidéo vers endpoint personnalisé (#7)");
  // On injecte un modèle VIDÉO perso et on vérifie que createVideoTask l'atteint.
  await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2") || "[]");
    ls.push({ uid: "cm_vid_1", name: "Mon Vidéo", endpoint: "https://custom.test/v1", apiKey: "", id: "vid-model-1", image: false, video: true, adapter: "agnes" });
    localStorage.setItem("cinema_noir_custom_models_v2", JSON.stringify(ls));
    localStorage.setItem("cinema_noir_cm_choice_v1", JSON.stringify({ image: "", video: "cm_vid_1" }));
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await masquerWizard(page);
  // rouvrir le modal après reload
  const mediaBtn2 = await page.$("#v159-media-btn");
  if (mediaBtn2) { await masquerWizard(page); await mediaBtn2.click({ force: true }).catch(() => {}); await page.waitForTimeout(300); }
  await page.waitForSelector("#open-aivideo-modal", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(500);
  await page.click("#open-aivideo-modal");
  await page.waitForFunction(() => { const f = document.getElementById("aivideo-frame"); const d = f && f.contentDocument; return !!d && !!d.body; }, { timeout: 30000 });
  cpt.video = 0;
  const vidRoute = await page.evaluate(async () => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const cm = d.defaultView.customModelsVideo ? d.defaultView.customModelsVideo() : null;
    if (!cm) return { cm: false };
    const vid = await d.defaultView.createVideoTask("une scène test", null, null, cm.id, null, cm);
    return { cm: true, videoId: vid };
  });
  ok("customModelsVideo() renvoie le modèle vidéo", vidRoute.cm, JSON.stringify(vidRoute));
  ok("createVideoTask a atteint l'endpoint personnalisé /videos", cpt.video >= 1, "appels video=" + cpt.video);
  ok("createVideoTask renvoie un video_id", typeof vidRoute.videoId === "string" && vidRoute.videoId.length > 0, "videoId=" + vidRoute.videoId);

  section("4. « Image » (toggle) marque le modèle comme modèle d'image");
  await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    d.querySelector('#cm-grid [data-cm-toggle]').click();
  });
  await page.waitForTimeout(300);
  const toggle = await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const ls = JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2") || "[]");
    const actif = d.querySelector("#cm-grid .model-card.selected") ? true : false;
    const cmCourant = window.__v459 ? null : null; // placeholder
    return { image: !!(ls[0] && ls[0].image), actif };
  });
  ok("l'indicateur image est enregistré", toggle.image, JSON.stringify(toggle));
  ok("la carte passe en surbrillance « Image »", toggle.actif);

  section("5. genererImage route vers l'endpoint PERSONNALISÉ (pas Agnes)");
  // Passer en mode image, saisir un prompt, puis générer.
  await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const modeBtn = d.querySelector('.mode-btn[data-mode="image"]'); if (modeBtn) modeBtn.click();
    const p = d.getElementById("main-prompt"); if (p) { p.value = "un champ de fleurs"; p.dispatchEvent(new Event("input")); }
  });
  await page.waitForTimeout(300);
  // Le bouton d'image (posé par v459) : #v459-img-btn
  const aBouton = await page.evaluate(() => !!document.getElementById("aivideo-frame").contentDocument.getElementById("v459-img-btn"));
  ok("le bouton « Générer une image » est présent", aBouton);
  cpt.custom = 0;
  if (aBouton) {
    await page.evaluate(() => document.getElementById("aivideo-frame").contentDocument.getElementById("v459-img-btn").click());
    await page.waitForTimeout(1500);
  }
  ok("genererImage a appelé l'endpoint personnalisé /images/generations", cpt.custom >= 1, "appels custom=" + cpt.custom);

  section("6. Suppression du modèle personnalisé");
  page.on("dialog", d => d.accept());   // confirmer la suppression
  const avantSuppr = await page.evaluate(() => JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2") || "[]").length);
  await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const del = d.querySelector('#cm-grid [data-cm-del]'); if (del) del.click();
  });
  await page.waitForTimeout(400);
  const apresUn = await page.evaluate(() => JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2") || "[]").length);
  ok("un clic sur 🗑️ retire exactement un modèle", apresUn === avantSuppr - 1, avantSuppr + " -> " + apresUn);
  // On supprime les modèles restants pour vérifier que la grille se vide.
  for (let k = 0; k < 10; k++) {
    const encore = await page.evaluate(() => !!document.getElementById("aivideo-frame").contentDocument.querySelector('#cm-grid [data-cm-del]'));
    if (!encore) break;
    await page.evaluate(() => {
      const d = document.getElementById("aivideo-frame").contentDocument;
      const del = d.querySelector('#cm-grid [data-cm-del]'); if (del) del.click();
    });
    await page.waitForTimeout(300);
  }
  const suppr = await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const ls = JSON.parse(localStorage.getItem("cinema_noir_custom_models_v2") || "[]");
    return { nb: ls.length, carte: d.querySelectorAll("#cm-grid .model-card").length };
  });
  ok("tous les modèles sont retirés (localStorage vide)", suppr.nb === 0, "nb=" + suppr.nb);
  ok("la grille est vide", suppr.carte === 0, "cartes=" + suppr.carte);

  section("7. Propreté");
  ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  if (relais) relais.kill();

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) {
    console.log("\nÉchecs :");
    resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`));
  }
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => {
  console.error("\n[EXCEPTION] " + (e && e.stack || e));
  if (relais) relais.kill();
  process.exit(3);
});
