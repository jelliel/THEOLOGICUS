// Diagnostic v655 — QU'EST-CE QUI DEPLACE REELLEMENT LA MISE EN PAGE ?
//
// On a etabli que les cadres suivent correctement leur texte (ancre identique
// dans 18 cas sur 18) et que c'est LE TEXTE qui se deplace. Reste a savoir
// QUOI le deplace. Trois candidats, et je ne veux plus supposer :
//   1. les fiches Wikipedia (.theo-fig) inserees apres le rendu ;
//   2. les puces de sources (.theo-src-chips) ;
//   3. le CHARGEMENT DES POLICES — le swap de police change les metriques du
//      texte, donc la hauteur de TOUS les messages. Ce serait la meme
//      signature : la premiere ouverture differe, les suivantes sont stables.
//
// On mesure : la hauteur du conteneur dans le temps, et chaque mutation qui
// l'a fait changer (avec le type d'element insere).
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9400;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const FIXTURE = path.join(__dirname, "..", "_v651", "kyrios_reel.json");

(async () => {
  if (!fs.existsSync(FIXTURE)) { console.log("IGNORE — fixture absente"); process.exit(77); }
  const chat = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const CHAT = chat.id;

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

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (c) => {
    await new Promise((res2, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" });
      };
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction(["chats", "settings"], "readwrite");
        tx.objectStore("chats").put(c);
        tx.objectStore("settings").put({ id: "currentChatId", value: c.id });
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("currentChatId", c.id);
    localStorage.setItem("theo_chat_id", c.id);
  }, chat);

  // Observer installe AVANT le rendu, pour ne rien manquer.
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });

  await page.evaluate(() => {
    window.__diag = { hauteurs: [], mutations: [], polices: null };
    const t0 = performance.now();
    const sc = () => {
      const c = document.querySelector("#chat-container");
      return c ? c.scrollHeight : 0;
    };
    window.__diag.h0 = sc();
    // 1. la hauteur dans le temps
    const iv = setInterval(() => {
      window.__diag.hauteurs.push([Math.round(performance.now() - t0), sc()]);
      if (performance.now() - t0 > 6000) clearInterval(iv);
    }, 200);
    // 2. ce qui est insere
    const cc = document.querySelector("#chat-container") || document.body;
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          const cl = (n.className && typeof n.className === "string") ? n.className : n.tagName;
          window.__diag.mutations.push([Math.round(performance.now() - t0), cl.slice(0, 60), sc()]);
        }
      }
    });
    mo.observe(cc, { childList: true, subtree: true });
    // 3. les polices
    if (document.fonts) {
      window.__diag.polices = document.fonts.status;
      try { document.fonts.ready.then(function () {
        window.__diag.policesFini = Math.round(performance.now() - t0);
        window.__diag.polices = document.fonts.status;
        window.__diag.hApresPolices = sc();
      }); } catch (e) {}
    }
  });

  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    }, 250);
  });
  await page.evaluate(async (id) => {
    try { await window.loadChat(id); } catch (e) {}
    try { window.renderMessages(); } catch (e) {}
  }, CHAT);
  await page.waitForTimeout(9000);

  const d = await page.evaluate(() => ({
    h0: window.__diag.h0,
    hauteurs: window.__diag.hauteurs,
    mutations: window.__diag.mutations.slice(0, 40),
    nbMutations: window.__diag.mutations.length,
    polices: window.__diag.polices,
    policesFini: window.__diag.policesFini,
    hApresPolices: window.__diag.hApresPolices,
  }));

  // Mesure de la HAUTEUR FINALE sur 3 ouvertures : c'est elle qui decide.
  const finales = [];
  for (let i = 0; i < 3; i++) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
      }, 250);
    });
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForTimeout(9000);
    finales.push(await page.evaluate(() => {
      const c = document.querySelector("#chat-container");
      return { h: c ? c.scrollHeight : 0,
               lex: document.querySelectorAll(".theo-lex").length,
               fig: document.querySelectorAll(".atc-figbox").length };
    }));
  }
  console.log("  --- hauteur FINALE sur 3 ouvertures (apres 9 s) ---");
  finales.forEach((f, i) => console.log("    ouverture " + (i + 1) + " : " + f.h + " px, " + f.lex + " theo-lex, " + f.fig + " figures"));

  console.log("=== DIAGNOSTIC v655 — QU'EST-CE QUI DEPLACE LA MISE EN PAGE ? ===");
  console.log("  hauteur avant rendu : " + d.h0 + " px");
  console.log("  polices : " + d.polices + (d.policesFini !== undefined ? " (ready a " + d.policesFini + " ms, hauteur " + d.hApresPolices + ")" : ""));
  console.log("  --- hauteur dans le temps (ms -> px) ---");
  const paliers = [];
  for (const [t, h] of d.hauteurs) {
    if (!paliers.length || paliers[paliers.length - 1][1] !== h) paliers.push([t, h]);
  }
  paliers.forEach(p => console.log("    " + String(p[0]).padStart(5) + " ms -> " + p[1] + " px"));
  console.log("  --- insertions (" + d.nbMutations + " au total, 40 premieres) ---");
  const parClasse = {};
  for (const [t, cl] of d.mutations) {
    const k = cl.split(" ")[0] || cl;
    parClasse[k] = (parClasse[k] || 0) + 1;
  }
  Object.entries(parClasse).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .forEach(([k, n]) => console.log("    " + String(n).padStart(4) + " x  " + k));

  await browser.close();
  serveur.close();
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
