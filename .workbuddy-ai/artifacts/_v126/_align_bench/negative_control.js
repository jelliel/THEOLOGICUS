// Contrôle NÉGATIF : rejoue le banc d'alignement contre la version AVANT
// correctif (commit 3d24e1d:THEOLOGICUS.html), pour prouver que le banc
// échoue bien sans le fix. Sert le dépôt réel, mais remplace uniquement
// /THEOLOGICUS.html par la version pré-correctif extraite via `git show`.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const PORT = 8794;
const RACINE = path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const DIR = path.join(RACINE, ".workbuddy-ai", "artifacts", "_v126", "_align_bench");
const PREFIXE = "3d24e1d";

const REPONSE = [
  "Non, Tertullien n'a jamais écrit que le Livre d'Hénoc fut retiré *à cause des propriétés d'un Messie déjà venu*.",
  "En revanche :",
  "",
  "1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).",
  "2. Il **ne** justifie pas **son** exclusion du canon, **contrairement** à **Athanase** ou Épiphan**e**.",
  "3. La formulation que vous citez ressemble à une **interprétation ultérieure** (peut-être médiévale) de sa pensée.",
].join("\n");

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const cheminPre = path.join(DIR, "THEOLOGICUS.prefix.html");
  if (!fs.existsSync(cheminPre)) {
    const html = execFileSync("git", ["-C", RACINE, "show", PREFIXE + ":THEOLOGICUS.html"], { maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(cheminPre, html);
  }
  console.log(`[neg] version pré-correctif : ${PREFIXE}:THEOLOGICUS.html (${fs.statSync(cheminPre).size} o)`);

  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/" || p === "/THEOLOGICUS.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      fs.createReadStream(cheminPre).pipe(res);
      return;
    }
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8"
          : p.endsWith(".js") ? "application/javascript; charset=utf-8"
          : "application/octet-stream",
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", () => {});

  await page.addInitScript((reponse) => {
    try { document.cookie = "key_mistral=sk-test-mistral-align; path=/"; } catch (e) {}
    const _orig = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = String((init && init.method) || "GET").toUpperCase();
      if (method === "POST" && /chat\/completions|\/responses|\/v1\/messages/.test(url)) {
        const enc = new TextEncoder();
        const parts = (reponse.match(/[\s\S]{1,24}/g) || [reponse])
          .map(c => enc.encode("data: " + JSON.stringify({ choices: [{ delta: { content: c } }] }) + "\n\n"));
        parts.push(enc.encode("data: [DONE]\n\n"));
        let i = 0;
        const stream = new ReadableStream({ pull(c) { if (i >= parts.length) { c.close(); return; } c.enqueue(parts[i++]); } });
        return Promise.resolve(new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
      }
      if (_orig) return _orig(input, init);
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
  }, REPONSE);

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); });
  await page.waitForSelector("#user-input");
  await page.fill("#user-input", "Tertullien a-t-il dit cela ?");
  await page.evaluate(() => {
    document.getElementById("user-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await page.waitForFunction(() => /canonique/.test(document.getElementById("chat-container").textContent || ""), null, { timeout: 60000 });
  await page.waitForTimeout(800);

  const ts = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('[id^="mc-"]')).find(x => /canonique/.test(x.textContent || ""));
    return b ? b.id.replace("mc-", "") : null;
  });

  // Annotation via la bulle (même chemin que le banc principal)
  async function annoter(cible) {
    await page.evaluate(({ ts, cible }) => {
      const box = document.getElementById("mc-" + ts);
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
      let full = ""; const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
      const idx = full.indexOf(cible);
      let sc = null, so = 0, ec = null, eo = 0;
      for (const { node, start } of nodes) {
        const end = start + node.nodeValue.length;
        if (!sc && idx >= start && idx < end) { sc = node; so = idx - start; }
        if (!ec && (idx + cible.length) > start && (idx + cible.length) <= end) { ec = node; eo = (idx + cible.length) - start; }
      }
      const range = document.createRange();
      range.setStart(sc, so); range.setEnd(ec, eo);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      box.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    }, { ts, cible });
    await page.waitForTimeout(420);
    await page.evaluate(() => {
      const m = document.querySelector("#atc-bubble .atc-main");
      if (m) m.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(250);
  }

  const CIBLES = ["canonique", "marcionisme", "interprétation ultérieure"];
  for (const c of CIBLES) await annoter(c);
  await page.evaluate(() => { window.renderMessages(true); });
  await page.waitForTimeout(900);

  const apres = await page.evaluate((ts) => {
    const box = document.getElementById("mc-" + ts);
    const byId = new Map();
    box.querySelectorAll("[data-hl-id]").forEach(sp => {
      const id = sp.dataset.hlId;
      byId.set(id, (byId.get(id) || "") + sp.textContent);
    });
    const spans = Array.from(box.querySelectorAll("[data-hl-id]")).map(sp => (sp.textContent || "").trim());
    return { textes: Array.from(byId.values()).map(t => t.trim()), spans, vides: spans.filter(t => !t).length };
  }, ts);

  console.log("[neg] cadres après re-rendu :", JSON.stringify(apres.textes));
  console.log("[neg] spans individuels        :", JSON.stringify(apres.spans));
  console.log("[neg] cadres vides             :", apres.vides);
  let mauvais = 0;
  for (const c of CIBLES) if (!apres.textes.includes(c)) { mauvais++; console.log(`[neg] NON aligné : « ${c} »`); }
  console.log("-".repeat(72));
  console.log(mauvais > 0
    ? `CONTROLE NEGATIF OK : ${mauvais}/${CIBLES.length} cadres mal alignés SANS le correctif — le banc détecte bien le bug.`
    : `ATTENTION : aucun décalage observé sans le correctif — le banc ne prouve rien.`);
  console.log("-".repeat(72));

  await browser.close();
  serveur.close();
  process.exit(mauvais > 0 ? 0 : 1);
})().catch(e => { console.error("FATAL", e.message); process.exit(2); });