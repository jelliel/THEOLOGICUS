/* v683 — BULLE CLASSIQUE « Add to chat » UNIVERSELLE.
   Demande utilisateur : « je ne veux plus la barre v678 ; je veux que l'ancienne
   bulle « Add to chat » soit universelle » (messages, commentaires, hors message).
   La barre v678-sel-toolbar a été RETIRÉE du HTML.

   On vérifie :
   1. la bulle classique est exposée (window.__atcBubble) ;
   2. sélection DANS un commentaire (#atc-tip) → bulle classique #atc-bubble ;
   3. sélection DANS un message (.message-content) → bulle classique (universelle) ;
   4. sélection hors message → bulle classique (universelle) ;
   5. la barre v678 #sel-toolbar N'EXISTE PLUS ;
   6. aucune erreur JS.

   Banc DÉTERMINISTE (sème #atc-tip / .message-content), indépendant du rendu
   asynchrone des messages.
*/
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9694);

function trouverRacine() {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, "THEOLOGICUS.html"))) return d;
    d = path.dirname(d);
  }
  return path.resolve(process.env.BENCH_ROOT || process.cwd());
}
const RACINE = path.resolve(process.env.BENCH_ROOT || trouverRacine());
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]    " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + (detail ? "  -- " + detail : "")); }
}
const pause = ms => new Promise(r => setTimeout(r, ms));
const visible = (page, sel) => page.evaluate((q) => {
  const b = document.querySelector(q);
  if (!b) return false;
  const st = getComputedStyle(b);
  return st.display !== "none" && b.offsetWidth > 0 && b.offsetHeight > 0;
}, sel);
const selectionner = (page, sel) => page.evaluate((q) => {
  const el = document.querySelector(q);
  if (!el) return false;
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s.removeAllRanges(); s.addRange(r);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  return true;
}, sel);

(async () => {
  const APP = path.join(RACINE, "THEOLOGICUS.html");
  if (!fs.existsSync(APP)) {
    console.error("[ECHEC] application introuvable : " + APP + " (racine=" + RACINE + ")");
    process.exit(1);
  }

  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign(
    { args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });

  const attendreAppli = (ms) => page.waitForFunction(
    () => typeof window.__atcBubble === "object" && typeof window.sendMessage === "function",
    null, { timeout: ms }).then(() => true).catch(() => false);

  let appli = await attendreAppli(90000);
  if (!appli) {
    console.log("[DIAG] application non prête après 90 s — rechargement unique…");
    try { await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) {}
    appli = await attendreAppli(90000);
  }
  if (!appli) {
    const d = await page.evaluate(() => ({
      bubble: typeof window.__atcBubble, send: typeof window.sendMessage,
      modules: document.querySelectorAll("script[id]").length
    })).catch(e => ({ erreur: String(e.message) }));
    console.log("[DIAG] " + JSON.stringify(d));
  }

  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, route => route.abort());

  ok("M1 bulle classique exposée (window.__atcBubble)",
    await page.evaluate(() => typeof window.__atcBubble === "object"));
  ok("M2 barre v678 #sel-toolbar absente du DOM (module retiré)",
    await page.evaluate(() => !document.getElementById("sel-toolbar") && !document.getElementById("v678-sel-toolbar")));

  /* C1 — sélection DANS un commentaire (#atc-tip) → bulle classique. */
  await page.evaluate(() => {
    const tip = document.createElement("div");
    tip.id = "atc-tip";
    tip.innerHTML = '<div class="atc-tip-a">Commentaire de test : un passage a selectionner dans le popup du commentaire.</div>';
    document.body.appendChild(tip);
  });
  ok("C1a #atc-tip semé", await page.evaluate(() => !!document.getElementById("atc-tip")));
  await selectionner(page, "#atc-tip .atc-tip-a");
  await pause(800);
  ok("C1b sélection dans le commentaire → bulle classique #atc-bubble visible",
    await visible(page, "#atc-bubble"));
  ok("C1c la bulle classique contient « Add to chat » (.atc-main)",
    await page.evaluate(() => !!document.querySelector("#atc-bubble .atc-main")));

  /* C2 — sélection DANS un message → bulle classique AUSSI (universelle). */
  await page.evaluate(() => {
    const msg = document.createElement("div");
    msg.className = "message"; msg.dataset.msgId = "12345";
    const mc = document.createElement("div");
    mc.className = "message-content"; mc.id = "mc-12345";
    mc.textContent = "Un message de test avec du texte a selectionner pour la bulle.";
    msg.appendChild(mc); document.body.appendChild(msg);
  });
  await selectionner(page, ".message-content#mc-12345");
  await pause(800);
  ok("C2 sélection dans un message → bulle classique #atc-bubble visible (universelle)",
    await visible(page, "#atc-bubble"));

  /* C3 — sélection hors message → bulle classique (universelle). */
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.id = "v683-plain";
    p.textContent = "Texte libre hors message pour verifier la bulle universelle.";
    document.body.appendChild(p);
  });
  await selectionner(page, "#v683-plain");
  await pause(800);
  ok("C3 sélection hors message → bulle classique #atc-bubble visible (universelle)",
    await visible(page, "#atc-bubble"));

  /* C4 — aucune barre v678 ne réapparaît. */
  ok("C4 #sel-toolbar n'existe jamais (v678 retiré)",
    await page.evaluate(() => !document.getElementById("sel-toolbar")));

  ok("C5 aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  serveur.close();
  console.log(`\n${ok_n} OK, ${ko_n} ECHEC`);
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error("[FATAL] " + (e && e.stack || e)); process.exit(1); });
