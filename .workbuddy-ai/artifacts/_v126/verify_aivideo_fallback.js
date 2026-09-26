// Banc v126e — repli embarqué : le modal AI VIDEO doit s'afficher MÊME si le
// serveur ne sert PAS ai-video.html (cas de l'exe packagé dont le dossier
// d'installation ignore le fichier séparé). Le document est alors injecté
// depuis la balise #aivideo-b64 via srcdoc.
//
// On sert THEOLOGICUS.html depuis un dossier SANS ai-video.html (serveur
// statique minimal, 404 sur le compagnon), exactement comme l'exe. Si le
// studio apparaît, le repli embarqué fonctionne. (Les appels /proxy/ de l'API
// du studio ne sont pas testés ici : on vérifie seulement le RENDU du studio.)

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

const DIR = path.join(RACINE, ".workbuddy-ai", "artifacts", "_v126", "_sans_compagnon");

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v126e — REPLI EMBARQUÉ (sans ai-video.html sur le serveur)");
  console.log("=".repeat(72));

  fs.mkdirSync(DIR, { recursive: true });
  fs.copyFileSync(path.join(RACINE, "THEOLOGICUS.html"), path.join(DIR, "THEOLOGICUS.html"));
  if (fs.existsSync(path.join(DIR, "ai-video.html"))) fs.unlinkSync(path.join(DIR, "ai-video.html"));

  // Serveur statique minimal : THEOLOGICUS.html oui, ai-video.html NON (404).
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(DIR, p);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ct = p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else {
      // 404 HTML comme proxy_server.SimpleHTTPRequestHandler (déclenche
      // l'évènement `load` de l'iframe, pas `error`) : c'est ce qui fait
      // jouer le repli embarqué.
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!DOCTYPE html><html><head><title>Error response</title></head>"
        + "<body>File not found.</body></html>");
    }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;
  const browser = await chromium.launch({ executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"), args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.evaluate((h) => {
      const enc = new TextEncoder().encode("remember:" + h);
      return crypto.subtle.digest("SHA-256", enc).then(buf => {
        const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("theologicus_remember", JSON.stringify({ v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok }));
      });
    }, AUTH_HASH);
    await page.evaluate(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);

    ok("le serveur ne sert PAS /ai-video.html (404)", (await (await fetch(`http://127.0.0.1:${PORT}/ai-video.html`)).status) === 404);

    await page.click("#open-aivideo-modal");
    await page.waitForFunction(() => {
      const f = document.getElementById("aivideo-frame");
      if (!f) return false;
      const d = f.contentDocument;
      return !!d && !!d.body && /AI VIDEO/.test(d.title || "");
    }, { timeout: 30000 });

    const interieur = await page.evaluate(() => {
      const f = document.getElementById("aivideo-frame");
      const d = f && f.contentDocument;
      if (!d) return null;
      return { titre: d.title || "", url: (f.contentWindow && f.contentWindow.location.href) || "", enfants: d.body ? d.body.children.length : 0, aLesStyles: /STYLE_CATEGORIES|ALL_STYLES/.test(d.documentElement.innerHTML) };
    });
    ok("le studio est rendu via le repli embarqué (titre AI VIDEO)", interieur && /AI VIDEO/.test(interieur.titre), interieur ? interieur.titre : "(nul)");
    ok("le document embarqué porte ses constantes (srcdoc a tourné)", interieur && interieur.aLesStyles);
    ok("le corps du document embarqué est peuplé", interieur && interieur.enfants > 3, interieur ? interieur.enfants : 0);

    const repli = await page.evaluate(() => { const z = document.getElementById("aivideo-indisponible"); return z ? z.hidden : null; });
    ok("le message de repli 404 reste caché (le studio s'affiche)", repli === true, String(repli));

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
