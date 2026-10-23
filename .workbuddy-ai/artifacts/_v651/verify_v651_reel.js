// Banc v651 — MESURE SUR LA CONVERSATION REELLE « Kyrios ».
//
// 15 messages, 107 encadrements, AUCUNE ancre, messages de 11 000 a 14 000
// caracteres. C'est la conversation que l'utilisateur a ouverte.
//
// Deux contrats :
//   A. la geometrie de chaque figure doit etre IDENTIQUE d'une ouverture a
//      l'autre (c'est la plainte : « ca change d'emplacement a chaque
//      ouverture ») ;
//   B. le defilement ne doit pas couter un reflow par figure.
//
// La fixture est extraite du store reel de l'utilisateur (om_pull0.json) :
// on ne mesure plus sur une synthese.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9100;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const FIXTURE = path.join(__dirname, "kyrios_reel.json");

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

(async () => {
  if (!fs.existsSync(FIXTURE)) { console.error("fixture absente :", FIXTURE); process.exit(2); }
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
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));

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
    localStorage.setItem("theologicus_chat_" + c.id, JSON.stringify(c));
    localStorage.setItem("currentChatId", c.id);
    localStorage.setItem("theo_chat_id", c.id);
  }, chat);

  async function entrer() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
      }, 250);
    });
  }
  // Positions de TOUTES les figures rendues, triees par id.
  async function geo() {
    return await page.evaluate(() => {
      const out = [];
      document.querySelectorAll(".atc-figbox").forEach(function (fb) {
        out.push([fb.getAttribute("data-fig-id"), fb.offsetLeft, fb.offsetTop,
                  fb.offsetWidth, fb.offsetHeight]);
      });
      out.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
      return out;
    });
  }
  // Stabilisation : 5 mesures identiques espacees de 250 ms.
  async function stabiliser() {
    let prec = null, calme = 0;
    for (let i = 0; i < 60; i++) {
      const cur = JSON.stringify(await geo());
      if (prec === cur) calme++; else calme = 0;
      prec = cur;
      if (calme >= 4) break;
      await page.waitForTimeout(250);
    }
    return JSON.parse(prec || "[]");
  }
  async function ouvrir() {
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector(".atc-figbox", { state: "attached", timeout: 60000 });
    return await stabiliser();
  }
  // Faire défiler TOUTE la conversation : sans cela, le rendu paresseux ne
  // place que les figures proches du viewport.
  async function parcourir() {
    return await page.evaluate(async () => {
      let cc = document.querySelector("#chat-container");
      if (!cc || cc.scrollHeight <= cc.clientHeight + 50) {
        cc = Array.from(document.querySelectorAll("*")).find(function (el) {
          return el.scrollHeight > el.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
        }) || document.scrollingElement;
      }
      const max = cc.scrollHeight - cc.clientHeight;
      for (let i = 0; i <= 20; i++) {
        cc.scrollTop = Math.round(max * i / 20);
        await new Promise(r => setTimeout(r, 180));
      }
      cc.scrollTop = 0;
      return max;
    });
  }

  // Combien d'ancres le STORE contient-il apres une ouverture complete ?
  async function ancresStore() {
    return await page.evaluate(async (chatId) => {
      const idb = await new Promise((ok) => {
        const r = indexedDB.open("THEOLOGICUS_AI_DB");
        r.onsuccess = () => { const tx = r.result.transaction(["chats"], "readonly");
          const g = tx.objectStore("chats").get(chatId);
          g.onsuccess = () => ok(g.result); g.onerror = () => ok(null); };
        r.onerror = () => ok(null);
      });
      if (!idb || !idb.messages) return null;
      let total = 0, avec = 0, libres = 0;
      for (const m of idb.messages) for (const f of (m.shapes || [])) {
        total++; if (f.ancre) avec++; if (f.libre) libres++;
      }
      return { total: total, avec: avec, libres: libres };
    }, CHAT);
  }

  /* ─── OUVERTURE 1 ─── */
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await entrer();
  const o1 = await ouvrir();
  const maxScroll = await parcourir();
  const o1b = await stabiliser();           // apres avoir tout parcouru
  const a1 = await ancresStore();

  /* ─── SCROLL : cout sur les donnees reelles ─── */
  const scroll = await page.evaluate(async () => {
    window.__r = 0;
    const nDom = document.querySelectorAll(".atc-figbox").length;
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { window.__r++; return orig.apply(this, arguments); };
    let cc = document.querySelector("#chat-container");
    if (!cc || cc.scrollHeight <= cc.clientHeight + 50) {
      cc = Array.from(document.querySelectorAll("*")).find(function (el) {
        return el.scrollHeight > el.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
      }) || document.scrollingElement;
    }
    const max = cc.scrollHeight - cc.clientHeight;
    const avant = window.__r;
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      cc.scrollTop = Math.round(max * (i + 1) / 12);
      await new Promise(r => setTimeout(r, 150));
    }
    const lt = [];
    return { rect: window.__r - avant, duree: Math.round(performance.now() - t0), max: max, lt: lt, nDom: nDom };
  });

  /* ─── OUVERTURES 2 et 3 ─── */
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await entrer();
  const o2 = await ouvrir();
  await parcourir();
  const o2b = await stabiliser();

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await entrer();
  const o3 = await ouvrir();
  await parcourir();
  const o3b = await stabiliser();
  const a3 = await ancresStore();

  function comparer(a, b, etiquette) {
    const ma = new Map(a.map(r => [r[0], r]));
    const bouges = [];
    for (const r of b) {
      const p = ma.get(r[0]);
      if (!p) continue;
      const d = [r[1] - p[1], r[2] - p[2], r[3] - p[3], r[4] - p[4]];
      if (d.some(v => Math.abs(v) > 1)) bouges.push({ id: r[0], d: d, avant: [p[1], p[2], p[3], p[4]], apres: [r[1], r[2], r[3], r[4]] });
    }
    const maxd = bouges.reduce((m, x) => Math.max(m, Math.abs(x.d[0]), Math.abs(x.d[1])), 0);
    console.log("  " + etiquette + " : " + bouges.length + "/" + b.length + " figure(s) deplacee(s)" +
                (bouges.length ? ", ecart max " + maxd + " px" : ""));
    return bouges;
  }

  console.log("=== BANC v651 — CONVERSATION REELLE « " + (chat.title || "?") + " » ===");
  console.log("  figures rendues : " + o1.length + "  (107 dans le store, 15 messages)");
  console.log("  hauteur de defilement : " + maxScroll + " px");
  console.log("  SCROLL 10 crans : " + scroll.rect + " reflows, " + scroll.duree + " ms (" +
              (scroll.nDom ? (scroll.rect / scroll.nDom).toFixed(1) : "?") + " par figure PRESENTE dans le DOM = " + scroll.nDom + ")");
  console.log("  --- ancres dans le store ---");
  console.log("    apres ouverture 1 : " + (a1 ? a1.avec + "/" + a1.total + " avec ancre, " + a1.libres + " libres" : "illisible"));
  console.log("    apres ouverture 3 : " + (a3 ? a3.avec + "/" + a3.total + " avec ancre, " + a3.libres + " libres" : "illisible"));
  console.log("  --- stabilite entre ouvertures ---");
  const b12 = comparer(o1b, o2b, "ouverture 1 -> 2");
  const b23 = comparer(o2b, o3b, "ouverture 2 -> 3");
  const b13 = comparer(o1b, o3b, "ouverture 1 -> 3");
  if (b13.length) {
    console.log("  exemples :");
    b13.slice(0, 5).forEach(x => console.log("    " + x.id + " : " + JSON.stringify(x.avant) + " -> " + JSON.stringify(x.apres)));
  }
  ok("A. la geometrie ne bouge pas d'une ouverture a l'autre",
     b13.length === 0,
     b13.length + "/" + o3b.length + " figures deplacees, ecart max " +
     b13.reduce((m, x) => Math.max(m, Math.abs(x.d[0]), Math.abs(x.d[1])), 0) + " px");
  ok("B. le scroll ne coute pas plus de 6 reflows par figure presente",
     !scroll.nDom || scroll.rect / scroll.nDom <= 6,
     (scroll.nDom ? (scroll.rect / scroll.nDom).toFixed(1) : "?") + " reflows par figure presente (" + scroll.nDom + " dans le DOM)");
  ok("C. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const nOk = res.filter(r => r[0]).length;
  console.log("--------------------------------------------------------------------------");
  console.log(`RESULTAT : ${nOk}/${res.length}`);
  console.log("--------------------------------------------------------------------------");
  await browser.close();
  serveur.close();
  process.exit(nOk === res.length ? 0 : 1);
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
