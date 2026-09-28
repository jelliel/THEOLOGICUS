// Capture du panneau « Références », avant/après, pour rendre visible une
// panne qui ne se voit pas dans le code : un glyphe qui hérite du bleu de lien
// par défaut du navigateur (rgb(0,0,238)) sur un panneau sombre.
//
// Le contraste mesuré suffit à établir le fait ; la capture sert à le MONTRER.
//
// Usage : node apercu_refpanel.js [--port 8931] [--sortie apercu.png]
//         BENCH_ROOT=… pour capturer une autre copie du fichier.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const arg = (n, d) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d;
const PORT = parseInt(arg("--port", "8931"), 10);
const SORTIE = arg("--sortie", "apercu_refpanel.png");
const THEME = arg("--theme", "glass");
const PANNEAU = arg("--panneau", "references-panel");
const SELECTEURS = (arg("--selecteurs", ".ref-item-icon,.ref-item-title,.ref-item-desc,.ref-header h3")).split(",");
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

if (!fs.existsSync(path.join(RACINE, "THEOLOGICUS.html"))) {
  console.error("THEOLOGICUS.html introuvable dans " + RACINE);
  process.exit(2);
}

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // L'application doit avoir une conversation à afficher : on la sème dans
  // localStorage AVANT le chargement, comme le fait audit_contraste_theme.js.
  // Sans cette graine, `#chat-container .message` reste vide et l'attente
  // expire sans autre indice.
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
      if (!localStorage.getItem("__apercu_seeded")) {
        localStorage.setItem("theologicus_chat_" + "audit-contraste", e.chat);
        localStorage.setItem("theologicus_currentChatId", "audit-contraste");
        localStorage.setItem("__apercu_seeded", "1");
      }
    } catch (x) {}
  }, { chat });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });
  await page.evaluate((id) => { window.loadArchiveChat(id, -1); }, "audit-contraste");
  await page.waitForFunction(() => document.querySelectorAll("#chat-container .message").length >= 2, null, { timeout: 60000 });

  // Thème voulu, puis ouverture du panneau demandé.
  await page.evaluate((args) => {
    const [th, panneau] = args;
    document.documentElement.setAttribute("data-theme", th);
    const p = document.getElementById(panneau);
    if (p) p.classList.add("active");
    const l = document.getElementById("ref-list");
    if (l) l.scrollTop = 0;
  }, [THEME, PANNEAU]);
  await page.waitForTimeout(1500);

  const mesures = await page.evaluate((args) => {
    const [panneau, selecteurs] = args;
    const lire = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(x => x !== "").map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const poser = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const fond = (el) => { const ch = []; let n = el;
      while (n && n.nodeType === 1) { const c = lire(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) ch.push(c); if (c && c.a >= 0.999) break; n = n.parentElement; }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = ch.length - 1; i >= 0; i--) base = poser(ch[i], base); return base; };
    const out = [];
    for (const sel of selecteurs) {
      const el = document.querySelector("#" + panneau + " " + sel);
      if (!el) { out.push({ sel, absent: true }); continue; }
      const cs = getComputedStyle(el); const f = lire(cs.color); const b = fond(el);
      const l1 = lum(poser(f, b)), l2 = lum(b);
      out.push({ sel, texte: el.textContent.trim().slice(0, 24), couleur: cs.color,
        fond: "#" + [b.r, b.g, b.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join(""),
        ratio: +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2) });
    }
    return out;
  }, [PANNEAU, SELECTEURS]);

  console.log(`theme ${THEME} — panneau #${PANNEAU} — racine ${RACINE}`);
  for (const m of mesures) {
    if (m.absent) { console.log(`  ${m.sel.padEnd(18)} (absent)`); continue; }
    console.log(`  ${String(m.ratio).padStart(6)}:1  ${m.sel.padEnd(18)} "${m.texte}"  ${m.couleur} sur ${m.fond}`);
  }

  const panneau = await page.$("#references-panel");
  if (panneau) await panneau.screenshot({ path: path.join(__dirname, SORTIE) });
  else await page.screenshot({ path: path.join(__dirname, SORTIE) });
  console.log(`capture écrite : ${path.join(__dirname, SORTIE)}`);

  await browser.close();
  serveur.close();
})();
