// Capture « avant / apres » du panneau memoire en v6-cyber, page ENTIERE.
//
// Pourquoi la page entiere : la capture par element (`elementHandle.screenshot`)
// puis par region (`page.screenshot({clip})`) donnaient toutes deux une image
// fausse — rectangle uni, puis zone a cote du panneau. La geometrie d'un panneau
// translate + anime n'est pas fiable a l'instant de la capture. La page entiere
// ne peut pas se tromper de cible : on voit le panneau dans son contexte, ce que
// l'oeil voit.
//
// Il faut DEVERROUILLER l'application (theologicus_remember) : sinon #auth-overlay
// recouvre tout et la capture est blanche.
//
// Usage : node capture_memoire.js [--theme v6-cyber] [--sortie nom.png] [--port 8848]
//         BENCH_ROOT=... pour capturer une autre copie du HTML.
const path = require("path");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright");

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const PORT = parseInt(arg("--port", "8848"), 10);
const THEME = arg("--theme", "v6-cyber");
const SORTIE = arg("--sortie", "capture_memoire.png");
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("non"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

  const remember = JSON.stringify({
    v: 1, mode: "admin", exp: Date.now() + 7 * 86400000,
    tok: crypto.createHash("sha256").update("remember:" + AUTH_HASH).digest("hex"),
  });
  const chat = JSON.stringify({
    id: "audit-contraste", model: "mistral", title: "Apercu contraste", updated: 1, fav: false,
    messages: [
      { role: "user", content: "Question sur la justification.", ts: 1790800000000 },
      { role: "assistant", content: "La justification est **déclarative**.", ts: 1790800001000, annotations: [], marks: [] },
    ],
  });
  await ctx.addInitScript((e) => {
    try { document.cookie = "key_mistral=sk-test-audit; path=/"; } catch (x) {}
    try {
      localStorage.setItem("theologicus_chat_audit-contraste", e.chat);
      localStorage.setItem("theologicus_currentChatId", "audit-contraste");
      localStorage.setItem("theologicus_remember", e.remember);
      localStorage.setItem("theologicus_wizard_skipped", "1");
    } catch (x) {}
  }, { chat, remember });

  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3000);

  const etat = await page.evaluate((th) => {
    document.documentElement.setAttribute("data-theme", th);
    // Les deux surcouches qui recouvrent tout et rendraient la capture inutile.
    // `theologicus_wizard_skipped` ne suffit pas : l'assistant s'affiche aussi
    // quand aucune identite d'IA n'est configuree.
    const ov = document.getElementById("auth-overlay");
    if (ov) ov.style.display = "none";
    const wz = document.getElementById("setup-wizard-overlay");
    if (wz) wz.style.display = "none";
    const p = document.getElementById("memory-panel");
    if (p) p.classList.add("active");
    return {
      overlay: ov ? getComputedStyle(ov).display : "absent",
      assistant: wz ? getComputedStyle(wz).display : "absent",
      fondPanneau: p ? getComputedStyle(p).backgroundColor : "absent",
    };
  }, THEME);
  console.log(`theme ${THEME} — auth-overlay: ${etat.overlay} — assistant: ${etat.assistant} — fond du panneau: ${etat.fondPanneau}`);

  await page.waitForTimeout(2000);
  const apres = await page.evaluate(() => {
    const p = document.getElementById("memory-panel");
    const cs = getComputedStyle(p);
    const r = p.getBoundingClientRect();
    return { opacite: cs.opacity, fond: cs.backgroundColor,
             rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  });
  console.log(`panneau a l'instant de la capture : ${JSON.stringify(apres)}`);

  const dest = path.join(__dirname, SORTIE);
  await page.screenshot({ path: dest });
  console.log(`capture ecrite : ${dest}`);

  await browser.close();
  serveur.close();
})();
