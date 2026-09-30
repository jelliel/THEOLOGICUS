// Démo v127 — capture d'écran : flèches REMPLIES et TOURNÉES.
// Sert de preuve visuelle : chaque flèche est posée par le chemin réel
// (clic droit sur le message -> menu d'encadrement -> nuancier « Remplir » +
// curseur « Rotation » -> icône de la forme), puis la zone du message est
// capturée en PNG.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8803;
/* NB : ce script vit dans _align_bench/, un cran plus bas que les bancs de
   _v126/ — il faut donc QUATRE « .. ». Avec trois, on sert .workbuddy-ai/ :
   404 sur THEOLOGICUS.html, page de 154 octets, et le banc meurt sur un
   waitForFunction à 90 s (lu comme « l'app ne démarre pas »). */
const RACINE = path.resolve(__dirname, "..", "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const SORTIE = path.join(RACINE, ".workbuddy-ai", "artifacts", "_v126", "_align_bench", "figures_remplies_tournees.png");

const CHAT_ID = "chat-demo-fig";
const MSG_TS = 1790600000002;
const CONTENU = [
  "**Blocs fléchés — remplissage et rotation**",
  "",
  "Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies.",
  "",
  "1. Il **ne** justifie pas **son** exclusion du canon, contrairement à Athanase.",
  "2. La formulation ressemble à une **interprétation ultérieure** de sa pensée.",
  "3. Le passage reste cité comme témoignage utile, jamais comme norme.",
  "",
  "Voici des flèches posées sur ce texte : intérieur rempli, orientation libre.",
].join("\n");

const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Montre-moi les blocs fléchés", ts: MSG_TS - 1 },
    { role: "assistant", content: CONTENU, ts: MSG_TS, annotations: [] },
  ], title: "Démo figures", updated: 1, fav: false,
});

// x, y du clic droit, forme, remplissage, rotation
const FIGS = [
  { x: 40,  y: 18,  forme: "Flèche droite",  fill: "#ffd54f", rot: 0   },
  { x: 230, y: 18,  forme: "Flèche droite",  fill: "#81e68c", rot: 25  },
  { x: 430, y: 18,  forme: "Flèche double",  fill: "",        rot: 315 },
  { x: 40,  y: 96,  forme: "Flèche courbée", fill: "#ff96c8", rot: 0   },
  { x: 230, y: 96,  forme: "Bulle",          fill: "#4f8ef7", rot: 0   },
  { x: 430, y: 96,  forme: "Flèche quad",    fill: "#b388ff", rot: 45  },
];

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch({ executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"), args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test; path=/"; } catch (e) {}
    try { if (!localStorage.getItem("__demo_fig")) { localStorage.setItem("theologicus_chat_" + chatId, corps); localStorage.setItem("theologicus_currentChatId", chatId); localStorage.setItem("__demo_fig", "1"); } } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    });
    await page.addStyleTag({ content: "#setup-wizard-overlay{display:none !important}" });
    /* Les infobulles de confirmation couvriraient la capture. */
    await page.addStyleTag({ content: "#toast-container{display:none !important}" });
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(1200);

    for (const f of FIGS) {
      await page.evaluate(() => { const m = document.getElementById("atc-insert-menu"); if (m) m.style.display = "none"; });
      /* Le clic droit RÉEL est couvert par verify_figures_fill_rotate.js (27/27).
         Ici, pour une capture, on émet l'événement directement : c'est
         déterministe et ça évite les aléas de positionnement d'un vrai clic. */
      await page.evaluate(({ ts, x, y }) => {
        const box = document.getElementById("mc-" + ts);
        const r = box.getBoundingClientRect();
        box.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y,
        }));
      }, { ts: MSG_TS, x: f.x, y: f.y });
      await page.waitForSelector("#atc-insert-menu", { state: "visible", timeout: 10000 });
      await page.evaluate(({ fill, rot }) => {
        const r = document.querySelector("#atc-insert-menu input.im-rrot");
        if (r) { r.value = String(rot); r.dispatchEvent(new Event("input", { bubbles: true })); }
        const sw = document.querySelector('#atc-insert-menu .im-swatch[data-role="fill"][data-c="' + fill + '"]');
        if (sw) sw.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }, { fill: f.fill, rot: f.rot });
      await page.waitForTimeout(150);
      await page.locator(`#atc-insert-menu .im-ico[title="${f.forme}"]`).click();
      await page.waitForTimeout(200);
    }
    // Enlève les sélections/outils flottants avant la capture
    await page.evaluate(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      document.querySelectorAll(".atc-figbox").forEach(o => o.classList.remove("sel"));
    });
    await page.waitForTimeout(400);
    const box = page.locator("#mc-" + MSG_TS);
    await box.screenshot({ path: SORTIE });
    console.log("capture :", SORTIE);
    const nb = await page.evaluate(() => document.querySelectorAll(".atc-figbox").length);
    console.log("figures posées :", nb);
  } finally {
    await browser.close();
    serveur.close();
  }
})();
