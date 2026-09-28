// Aperçu v129 — capture d'écran du bloc « Performance » et de la fiche GPU.
//
// Pourquoi ce script existe : l'aperçu livré à l'utilisateur doit montrer le
// code EXPÉDIÉ. La première capture datait de 16:36 alors que le correctif de
// contraste a été commis à 16:44 — elle montrait donc des libellés illisibles,
// c'est-à-dire un état qui n'existe plus. Un aperçu périmé est un faux témoignage.
//
// Il réutilise la mise en place du banc (semis de la conversation, retrait des
// surcouches) : voir verify_presets_gpu.js pour le détail des pièges.
//
// Usage : node apercu_prereglages.js [--port 8835]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8835;
// QUATRE niveaux : ce script vit dans _v126/_presets_bench/, un cran plus bas
// que les bancs. Avec trois niveaux il servait .workbuddy-ai/ — le HTML n'y est
// pas, le serveur renvoyait « 404 » en texte, et l'attente expirait à 90 s sans
// le moindre indice. D'où le garde-fou ci-dessous.
const RACINE = path.resolve(__dirname, "..", "..", "..", "..");
const PAGE = path.join(RACINE, "THEOLOGICUS.html");
if (!fs.existsSync(PAGE)) {
  console.error(`[!] THEOLOGICUS.html introuvable sous ${RACINE} — chemin de racine faux.`);
  process.exit(2);
}
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHAT = "apercu-presets";

function messages() {
  const out = [];
  const base = 1790800000000;
  for (let i = 0; i < 2; i++) {
    out.push({ role: "user", content: `Question ${i + 1} sur la justification.`, ts: base + i * 2000 });
    out.push({
      role: "assistant", ts: base + i * 2000 + 900, annotations: [], marks: [],
      content: `### Réponse ${i + 1}\n\nLa justification est **déclarative** et non infuse.\n`,
    });
  }
  return out;
}

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const env = {
    chat: JSON.stringify({
      id: CHAT, model: "mistral", messages: messages(),
      title: "Aperçu v129", updated: 1, fav: false,
    }),
  };
  // Le cookie DOIT exister au chargement : sans lui l'appli reste sur la
  // surcouche d'authentification et n'expose pas loadArchiveChat. Mesuré : la
  // version de ce script qui posait le cookie APRÈS goto expirait à 90 s.
  await ctx.addInitScript((e) => {
    try { document.cookie = "key_mistral=sk-test-presets; path=/"; } catch (x) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (x) {}
    try {
      if (!localStorage.getItem("__apercu_seeded")) {
        localStorage.setItem("theologicus_chat_apercu-presets", e.chat);
        localStorage.setItem("theologicus_currentChatId", "apercu-presets");
        localStorage.setItem("__apercu_seeded", "1");
      }
    } catch (x) {}
  }, env);

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
    { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });

  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
  });
  await page.addStyleTag({ content: "#setup-wizard-overlay{display:none !important}" });

  await page.evaluate((id) => { window.loadArchiveChat(id, -1); }, CHAT);
  await page.waitForFunction(() => document.querySelectorAll("#chat-container .message").length >= 2,
    null, { timeout: 60000 });
  await page.waitForFunction(() => window.__V129 && window.__V129.courant, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const dossier = __dirname;

  // ── 1. Menu « Plus » : c'est là que l'utilisateur va le chercher ────
  await page.evaluate(() => {
    const m = document.getElementById("v6-more-menu");
    if (m) m.classList.add("open");
  });
  await page.waitForTimeout(600);
  const bloc = page.locator("#v6-more-menu .v129-bloc").first();
  await bloc.screenshot({ path: path.join(dossier, "apercu_prereglages.png") });

  // ── 2. Fiche GPU seule, pour la lisibilité du diagnostic ────────────
  // Elle est prise DANS LE MENU : la copie du panneau « Personnaliser » vit
  // dans une section repliée (mesuré : capture impossible sans la déplier),
  // et le menu est de toute façon l'endroit où l'utilisateur la trouve.
  const carte = page.locator("#v6-more-menu .v129-gpu").first();
  if (await carte.count()) {
    await carte.screenshot({ path: path.join(dossier, "apercu_fiche_gpu.png") });
  }

  // Témoin chiffré : le contraste mesuré au moment de la capture.
  const mesure = await page.evaluate(() => {
    const el = document.querySelector("#v6-more-menu .v129-preset");
    if (!el) return null;
    const lum = (c) => {
      const a = c.match(/[\d.]+/g).map(Number);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]);
    };
    let n = el, fond = null;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const a = bg.match(/[\d.]+/g);
      if (a && (a.length < 4 || parseFloat(a[3]) > 0.5)) { fond = bg; break; }
      n = n.parentElement;
    }
    const t = getComputedStyle(el).color;
    if (!fond) return null;
    const l1 = lum(t), l2 = lum(fond);
    const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return { texte: t, fond, ratio: Math.round(r * 100) / 100 };
  });
  console.log("contraste au moment de la capture :", JSON.stringify(mesure));

  await browser.close();
  serveur.close();
  console.log("aperçus écrits dans", dossier);
})();
