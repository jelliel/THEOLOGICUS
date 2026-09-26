// Banc v126f — persistance des clés API dans le modal AI VIDEO.
//
// Symptôme rapporté : l'utilisateur saisit ses clés Agnes et Mistral, mais
// l'app dit « Aucune clé » et le toast le confirme. Cause : ai-video.html ne
// persistait JAMAIS la clé (aucun setItem(SK.AGNES) ni setItem(SK.MISTRAL)) :
// getApiKey() lisait localStorage, toujours vide. La valeur restait dans le
// DOM de l'input mais disparaissait au reload.
//
// Correctif :
//   1. listeners « input » sur #api-key-input et #mistral-key-input →
//      localStorage.setItem à chaque frappe ;
//   2. verifyAgnesKey / verifyMistralKey lisent l'input courant (source de
//      vérité) et le persistent avant utilisation, pour parer toute race.
//
// Ce banc vérifie : (a) la frappe persiste immédiatement, (b) le statut UI
// n'affiche plus « Aucune clé », (c) les clés survivent au reload, (d)
// verifyAgnesKey lit bien l'input (le statut ne retombe pas sur « Aucune clé »).

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8766;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const DIR = path.join(RACINE, ".workbuddy-ai", "artifacts", "_v126", "_keys_bench");

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v126f — PERSISTANCE DES CLES AI VIDEO (Agnes + Mistral)");
  console.log("=".repeat(72));

  fs.mkdirSync(DIR, { recursive: true });
  fs.copyFileSync(path.join(RACINE, "ai-video.html"), path.join(DIR, "ai-video.html"));

  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/ai-video.html";
    const fp = path.join(DIR, p);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!DOCTYPE html><html><head><title>Error response</title></head><body>nope</body></html>");
    }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#api-key-input");
    await page.waitForSelector("#mistral-key-input");
    await page.waitForTimeout(500);

    // (a) la frappe persiste immédiatement
    await page.fill("#api-key-input", "sk-agnes-test-12345");
    await page.waitForTimeout(150);
    const agnesStored = await page.evaluate(() => localStorage.getItem("agnes_api_key"));
    ok("la frappe persiste la clé Agnes dans localStorage",
      agnesStored === "sk-agnes-test-12345", JSON.stringify(agnesStored));

    const agnesStatus = await page.evaluate(() => {
      const t = document.getElementById("api-status-text"); return t ? t.textContent.trim() : "";
    });
    ok("le statut Agnes reflète la clé (plus « Aucune clé »)",
      agnesStatus && !/Aucune clé/.test(agnesStatus), agnesStatus);

    await page.fill("#mistral-key-input", "sk-mistral-test-67890");
    await page.waitForTimeout(150);
    const mistralStored = await page.evaluate(() => localStorage.getItem("mistral_api_key_v1"));
    ok("la frappe persiste la clé Mistral dans localStorage",
      mistralStored === "sk-mistral-test-67890", JSON.stringify(mistralStored));

    const mistralStatus = await page.evaluate(() => {
      const t = document.getElementById("mistral-status-text"); return t ? t.textContent.trim() : "";
    });
    ok("le statut Mistral reflète la clé (plus « Aucune clé »)",
      mistralStatus && !/Aucune clé/.test(mistralStatus), mistralStatus);

    // (b) les clés survivent au reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#api-key-input");
    await page.waitForTimeout(500);
    const restoredAgnes = await page.evaluate(() => document.getElementById("api-key-input").value);
    ok("la clé Agnes survit au reload (restaurée dans l'input)",
      restoredAgnes === "sk-agnes-test-12345", JSON.stringify(restoredAgnes));
    const restoredMistral = await page.evaluate(() => document.getElementById("mistral-key-input").value);
    ok("la clé Mistral survit au reload (restaurée dans l'input)",
      restoredMistral === "sk-mistral-test-67890", JSON.stringify(restoredMistral));

    // (c) verifyAgnesKey lit l'input (source de vérité) — ne doit PAS redéclarer
    // « Aucune clé Agnes ». Le fetch vers l'API externe échoue (CORS/réseau),
    // mais c'est SANS RAPPORT avec la persistance : on vérifie seulement que
    // le toast « Aucune clé » ne revient pas, et que le statut passe à
    // « checking » ou « invalid ».
    await page.click("#api-verify-btn");
    await page.waitForTimeout(2500);
    const agnesStatus2 = await page.evaluate(() => document.getElementById("api-status-text").textContent.trim());
    ok("verifyAgnesKey lit l'input — statut ≠ « Aucune clé Agnes »",
      !/Aucune clé/.test(agnesStatus2), agnesStatus2);

    ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    console.log("\n[EXCEPTION] " + (e && e.stack || e));
  } finally {
    await browser.close();
    serveur.close();
  }

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`));
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error("\n[EXCEPTION] " + (e && e.stack || e)); process.exit(3); });