// Cherche le déclencheur exact : rejoue la séquence réelle de l'app et
// inspecte le DOM après CHAQUE appel de applyHighlights (sans re-rendu).

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8795;
const RACINE = path.resolve(__dirname, "..", "..", "..", "..");
const PW = "C:/Users/toshr/AppData/Local/ms-playwright";
const DIR = path.join(RACINE, ".workbuddy-ai", "artifacts", "_v126", "_align_bench");
const PREFIXE = process.argv.includes("--prefix");

const REPONSE = [
  "Non, Tertullien n'a jamais écrit que le Livre d'Hénoc fut retiré *à cause des propriétés d'un Messie déjà venu*.",
  "En revanche :",
  "",
  "1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).",
  "2. Il **ne** justifie pas **son** exclusion du canon, **contrairement** à **Athanase** ou Épiphan**e**.",
  "3. La formulation que vous citez ressemble à une **interprétation ultérieure** (peut-être médiévale) de sa pensée.",
].join("\n");

(async () => {
  const cheminPre = path.join(DIR, "THEOLOGICUS.prefix.html");
  const cheminActuel = path.join(RACINE, "THEOLOGICUS.html");
  const servir = PREFIXE && fs.existsSync(cheminPre) ? cheminPre : cheminActuel;
  console.log("[cherche] sert :", servir.includes("prefix") ? "PRÉ-CORRECTIF" : "ACTUEL (corrigé)");

  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/" || p === "/THEOLOGICUS.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      fs.createReadStream(servir).pipe(res);
      return;
    }
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8"
          : p.endsWith(".js") ? "application/javascript; charset=utf-8" : "application/octet-stream",
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
  await page.fill("#user-input", "Tertullien ?");
  await page.evaluate(() => document.getElementById("user-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await page.waitForFunction(() => /canonique/.test(document.getElementById("chat-container").textContent || ""), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const ts = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('[id^="mc-"]')).find(x => /canonique/.test(x.textContent || ""));
    return b ? b.id.replace("mc-", "") : null;
  });

  const etat = async (etiquette) => {
    const e = await page.evaluate((ts) => {
      const box = document.getElementById("mc-" + ts);
      const spans = Array.from(box.querySelectorAll("[data-hl-id]")).map(sp => ({
        id: sp.dataset.hlId, t: (sp.textContent || "").trim(),
      }));
      const byId = new Map();
      spans.forEach(s => byId.set(s.id, (byId.get(s.id) || "") + s.t));
      return { spans, groupes: Array.from(byId.values()), vides: spans.filter(s => !s.t).length, n: spans.length };
    }, ts);
    console.log(`  [${etiquette}] n=${e.n} vides=${e.vides} groupes=${JSON.stringify(e.groupes)}`);
    if (e.vides) console.log(`             spans=${JSON.stringify(e.spans)}`);
    return e;
  };

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
    await page.waitForTimeout(300);
  }

  for (const c of ["canonique", "marcionisme", "interprétation ultérieure"]) {
    await annoter(c);
    await etat("après " + c);
  }

  // Dump des annotations telles que persistées (offsets start/end).
  const ann = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("theologicus_chat_")) continue;
      try {
        const p = JSON.parse(localStorage.getItem(k));
        (p.messages || []).forEach(m => (m.annotations || []).forEach(a => out.push({ text: a.text, start: a.start, end: a.end, occ: a.occ })));
      } catch (e) {}
    }
    return out;
  });
  console.log("  --- annotations persistées (offsets) ---");
  for (const a of ann) console.log(`    "${a.text}"  start=${a.start} end=${a.end} occ=${a.occ}`);

  // Offset réel dans la box au moment courant, pour comparer.
  const offs = await page.evaluate((ts) => {
    const box = document.getElementById("mc-" + ts);
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    let full = ""; const bornes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { bornes.push(full.length); full += n.nodeValue; }
    const res = {};
    for (const t of ["canonique", "marcionisme", "interprétation ultérieure"]) {
      const i = full.indexOf(t);
      res[t] = { idx: i, surBorne: bornes.includes(i) };
    }
    return { bornes, res, fullLen: full.length };
  }, ts);
  console.log("  --- offsets réels dans la box (nœuds texte) ---");
  console.log("    bornes de nœuds :", JSON.stringify(offs.bornes));
  for (const [t, v] of Object.entries(offs.res)) {
    console.log(`    "${t}" idx=${v.idx} surBorne=${v.surBorne}`);
  }

  console.log("  --- appels applyHighlights SANS re-rendu (chemin réel) ---");
  for (let k = 1; k <= 3; k++) {
    await page.evaluate(() => { window.__applyHighlights(); });
    await page.waitForTimeout(120);
    await etat("applyHighlights#" + k);
  }

  console.log("  --- re-rendu complet puis applyHighlights ---");
  await page.evaluate(() => { window.renderMessages(true); });
  await page.waitForTimeout(900);
  await etat("après re-rendu");

  await browser.close();
  serveur.close();
})().catch(e => { console.error("FATAL", e.message); process.exit(2); });