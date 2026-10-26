// Banc v659 — LE LOGO CANARD EST EN PLACE DANS TOUS LES EMPLACEMENTS DE MARQUE.
//
// L'utilisateur a demande d'utiliser l'image canard (Duck-ai-image) comme
// logo de Theologicus, y compris pour les raccourcis apres installation.
// Cote app : une classe unique .app-duck-logo (data-URI webp en CSS) remplace
// la lettre « T » et les emblemes hexagonaux sur : panneau lateral (tpai),
// navbar, menu mobile, footer, hero, header de chat, ecran d'accueil (statique
// + 2 gabarits JS) et assistant de configuration.
//
// Contrat :
//   A. la regle CSS .app-duck-logo existe avec un data-URI image/webp ;
//   B. >= 8 elements .app-duck-logo dans le DOM initial ;
//   C. le canard de l'ecran d'accueil (.auth-duck) est present et visible
//      (taille rendue > 0) AVANT de retirer l'overlay ;
//   D. les emplacements hero et header ont une taille rendue correcte
//      (72x72 et 36x36 attendus) ;
//   E. aucune erreur JavaScript.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8961;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

(async () => {
  const serveur = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rq.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(rq);
    } else { rq.writeHead(404); rq.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });

  /* A. la regle CSS avec le data-URI webp */
  const css = await page.evaluate(() => {
    for (const f of document.styleSheets) {
      let rules; try { rules = f.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (r.selectorText === ".app-duck-logo" && /url\(["']data:image\/webp;base64,/.test(r.style.backgroundImage)) {
          return { trouve: true, tailleUri: r.style.backgroundImage.length };
        }
      }
    }
    return { trouve: false, tailleUri: 0 };
  });
  ok("A. regle CSS .app-duck-logo avec data-URI webp present",
     css.trouve && css.tailleUri > 10000, `uri=${css.tailleUri} caracteres`);

  /* B. les emplacements de marque portent le canard */
  const n = await page.evaluate(() => document.querySelectorAll(".app-duck-logo").length);
  ok("B. >= 8 emplacements .app-duck-logo dans le DOM initial", n >= 8, `trouves = ${n}`);

  /* C. ecran d'accueil : le canard est rendu (avant de toucher l'overlay) */
  const auth = await page.evaluate(() => {
    const d = document.querySelector(".auth-duck .app-duck-logo");
    if (!d) return { present: false };
    const r = d.getBoundingClientRect();
    return { present: true, w: Math.round(r.width), h: Math.round(r.height) };
  });
  ok("C. ecran d'accueil : canard present et dimensionne",
     auth.present && auth.w >= 60 && auth.h >= 60,
     auth.present ? `${auth.w}x${auth.h}` : "absent");

  /* D. tailles CSS des emplacements (mesure par CLONE : les sections hero et
     navbar sont display:none au demarrage — l'app ouvre sur le chat — mais
     leurs regles CSS s'appliquent quand meme ; le clone dans le body donne
     la taille reelle qu'aura le logo quand la vue est affichee). */
  const sizes = await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    const mesure = (sel) => {
      const cont = document.querySelector(sel);
      if (!cont) return null;
      const clone = cont.cloneNode(true);
      clone.style.position = "absolute";
      clone.style.left = "-9999px";
      document.body.appendChild(clone);
      const b = clone.getBoundingClientRect();
      const out = { w: Math.round(b.width), h: Math.round(b.height) };
      clone.remove();
      return out;
    };
    return { hero: mesure(".hero-logo"), header: mesure(".brand-logo"), navbar: mesure(".navbar-brand .logo-icon") };
  });
  ok("D. tailles CSS : hero 72x72, header 36x36, navbar 32x32",
     sizes.hero && sizes.hero.w === 72 && sizes.hero.h === 72 &&
     sizes.header && sizes.header.w === 36 && sizes.header.h === 36 &&
     sizes.navbar && sizes.navbar.w === 32 && sizes.navbar.h === 32,
     JSON.stringify(sizes));

  /* E. hygiene */
  ok("E. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const bons = res.filter(r => r[0]).length;
  console.log(`\n${bons}/${res.length} — ${bons === res.length ? "OK" : "ECHEC"}`);
  await browser.close(); serveur.close();
  process.exit(bons === res.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(2); });
