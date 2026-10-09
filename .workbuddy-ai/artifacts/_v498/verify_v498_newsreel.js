// Banc v498 — NewsReel (le JT par IA) fusionné dans AI VIDEO.
//
// Vérifie la FUSION « compagnon + config partagée » :
//   · AI VIDEO expose un bouton qui ouvre NewsReel dans un modal ;
//   · l'iframe charge /newsreel.html (live) et le document est bien NewsReel ;
//   · PONT DE CONFIG (sens AI VIDEO -> NewsReel) : la clé Agnes (agnes_api_key)
//     et les modèles personnalisés (cinema_noir_custom_models_v2) alimentent la
//     config fournisseurs de NewsReel (newsreel_provider_keys/_models) ;
//   · PONT DE CONFIG (sens NewsReel -> AI VIDEO) : enregistrer la config dans
//     NewsReel recopie la clé Agnes vers agnes_api_key.
//
// Aucune vraie API : tout est local (clé factice + modèles simulés).
//
// Usage : node verify_v498_newsreel.js [--port 8765]

const path = require("path");
const { spawn, execSync } = require("child_process");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");

// Neutralise tout mandataire système (sinon 127.0.0.1 est intercepte -> 502).
for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "FTP_PROXY", "ftp_proxy"]) {
  delete process.env[k];
}
process.env.NO_PROXY = "*";
process.env.no_proxy = "*";

// Tue tout relais perime sur le port. netstat -ano : le PID vient APRES
// « LISTENING » (lecon v497 — l'ancienne regex ne tuait rien).
function tuerPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const pids = new Set();
    out.split("\n").forEach(l => {
      const m = l.match(new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`));
      if (m) pids.add(m[1]);
    });
    pids.forEach(p => { try { execSync(`taskkill /PID ${p} /F`, { stdio: "ignore" }); } catch (e) {} });
  } catch (e) { /* pas Windows ou rien a tuer */ }
}

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY_BIN || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}
function section(t) { console.log("\n" + t); }

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

const MODELES = [
  { uid: "cm_img", name: "Mon SDXL", endpoint: "https://custom.test/v1", apiKey: "ck-img", id: "sdxl-1.0", image: true, video: false, adapter: "agnes" },
  { uid: "cm_vid", name: "Mon Vidéo", endpoint: "https://custom.test/v1", apiKey: "ck-vid", id: "vid-1", image: false, video: true, adapter: "agnes" },
];

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v498 — NEWREEL (JT) FUSIONNÉ DANS AI VIDEO");
  console.log(BASE);
  console.log("=".repeat(72));

  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign(
    { args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {}
  );
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });

  // Clé Agnes partagée + modèles perso, posés AVANT tout script (le pont de
  // NewsReel les lira à son chargement).
  await page.addInitScript((modeles) => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_key", "sk-test-agnes");
      localStorage.setItem("cinema_noir_custom_models_v2", JSON.stringify(modeles));
    } catch (e) {}
  }, MODELES);

  section("0. Ouverture de AI VIDEO puis du modal NewsReel");
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
  const mediaBtn = await page.$("#v159-media-btn");
  if (mediaBtn) { await masquerWizard(page); await mediaBtn.click({ force: true }).catch(() => {}); await page.waitForTimeout(300); }
  await page.waitForSelector("#open-aivideo-modal", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(500);
  await page.click("#open-aivideo-modal");
  await page.waitForFunction(() => {
    const f = document.getElementById("aivideo-frame"); const d = f && f.contentDocument;
    return !!d && !!d.body;
  }, { timeout: 30000 });

  section("1. Le bouton NewsReel existe dans AI VIDEO");
  const btn = await page.evaluate(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    return !!d.getElementById("open-newsreel-btn");
  });
  ok("le bouton « 📰 NewsReel » est présent", btn);

  section("2. Le modal ouvre /newsreel.html (live)");
  await page.evaluate(() => document.getElementById("aivideo-frame").contentDocument.getElementById("open-newsreel-btn").click());
  const charge = await page.waitForFunction(() => {
    try {
      const av = document.getElementById("aivideo-frame"); if (!av) return false;
      const f = av.contentDocument.getElementById("newsreel-frame"); if (!f) return false;
      const d = f.contentDocument; if (!d) return false;
      return /NewsReel/i.test(d.title || "");
    } catch (e) { return false; }
  }, { timeout: 30000 }).then(() => true).catch(() => false);
  ok("l'iframe NewsReel est chargée (titre « NewsReel »)", charge);
  const appli = await page.evaluate(() => {
    const av = document.getElementById("aivideo-frame");
    const f = av.contentDocument.getElementById("newsreel-frame");
    const d = f.contentDocument;
    return { titre: d.title, jt: !!d.getElementById("jt-btn"), provider: !!d.getElementById("provider-tabs") };
  });
  ok("le document est bien NewsReel Studio", /NewsReel/i.test(appli.titre || ""), appli.titre);
  ok("l'app NewsReel est rendue (bouton « Lancer le JT »)", appli.jt);
  ok("les onglets fournisseurs sont présents", appli.provider);

  section("3. Pont de config — AI VIDEO → NewsReel");
  const pont = await page.evaluate(() => {
    let keys = {}, models = {};
    try { keys = JSON.parse(localStorage.getItem("newsreel_provider_keys") || "{}"); } catch (e) {}
    try { models = JSON.parse(localStorage.getItem("newsreel_provider_models") || "{}"); } catch (e) {}
    return { agnes: keys.agnes, custom: keys.custom, img: models.custom && models.custom.image, vid: models.custom && models.custom.video, txt: models.custom && models.custom.text };
  });
  ok("la clé Agnes partagée est reprise (agnes_api_key -> newsreel_provider_keys.agnes)",
     pont.agnes === "sk-test-agnes", "agnes=" + pont.agnes);
  ok("le modèle image perso alimente custom.image",
     pont.img && /\/images\/generations$/.test(pont.img.url || "") && pont.img.model === "sdxl-1.0", JSON.stringify(pont.img));
  ok("le modèle vidéo perso alimente custom.video",
     pont.vid && /\/videos$/.test(pont.vid.url || "") && pont.vid.model === "vid-1", JSON.stringify(pont.vid));
  ok("le modèle texte perso alimente custom.text",
     pont.txt && /\/chat\/completions$/.test(pont.txt.url || ""), JSON.stringify(pont.txt));

  section("4. Pont de config — NewsReel → AI VIDEO (clé Agnes)");
  const miroir = await page.evaluate(() => {
    const av = document.getElementById("aivideo-frame");
    const f = av.contentDocument.getElementById("newsreel-frame");
    const w = f.contentWindow;
    try {
      // Chemin réel : on saisit la clé dans le formulaire NewsReel, on la
      // capture puis on enregistre la config (comme le bouton « Sauvegarder »).
      f.contentDocument.getElementById("agnes-key").value = "sk-modifie-depuis-newsreel";
      w.captureProviderForm("agnes");
      w.saveProviderConfig();
    } catch (e) { return { err: String(e) }; }
    return { agnes: localStorage.getItem("agnes_api_key") };
  });
  ok("enregistrer dans NewsReel recopie la clé vers agnes_api_key",
     miroir.agnes === "sk-modifie-depuis-newsreel", JSON.stringify(miroir));

  section("5. Repli embarqué (#newsreel-b64)");
  const repli = await page.evaluate(() => {
    const el = document.getElementById("newsreel-b64");
    if (!el) return { present: false };
    const b64 = (el.textContent || "").trim();
    let decode = "";
    try {
      const bin = atob(b64.slice(0, 4000));
      const oct = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) oct[i] = bin.charCodeAt(i);
      decode = new TextDecoder("utf-8").decode(oct);
    } catch (e) { return { present: true, err: String(e) }; }
    return { present: true, taille: b64.length, tete: decode.slice(0, 60) };
  });
  ok("la copie embarquée #newsreel-b64 existe", repli.present);
  ok("elle se décode en HTML NewsReel", /<!DOCTYPE html/i.test(repli.tete || ""), (repli.tete || "").replace(/\n/g, " "));

  section("6. Propreté");
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
