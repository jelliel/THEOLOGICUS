// Banc v632h — ENCADRE ANNOTÉ : l'ancre TEXTE et le COMMENTAIRE survivent au reload.
//
// Pourquoi : le scénario 7 du banc v632 passait VACUEUSEMENT quand figures=0
// (« figures=0 » dans la sortie) : il n'y avait aucun encadré à contrôler.
// Ici on sème explicitement un encadré AVEC ancre + note, on recharge, et on
// exige que (1) le cadre existe, (2) son ancre porte le texte du passage,
// (3) la note soit toujours là, (4) le cadre soit sur le bon mot (0 px).
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8812;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v632h-0001";
const MSGTS = 1790600000777;
const TEXTE = "Au commencement etait le Verbe, et le Verbe etait avec Dieu, et le Verbe etait Dieu.";
// position canonique du premier « Verbe » (index 0-based) dans TEXTE
const IDX1 = TEXTE.indexOf("Verbe");
const SVG = '<path d="M4 4 L20 20 M20 4 L4 20" fill="none" stroke="cur" stroke-width="2"/>';

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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
  });

  // ── semer le chat avec un encadré ANNOTÉ ──
  // 🔴 v632h — le cadre est semé à une position DÉLIBÉRÉMENT PÉRIMÉE pour un
  // contenu décalé : texte décalé de 40 caractères (ce qui arrive quand un
  // module insère une fiche Wikipédia AVANT le passage). L'offset 25 enregistré
  // désigne alors « u commencement etait le Verbe, et le » — un texte qui ne
  // contient PAS « Verbe ». Seul un ancrage TEXTUEL peut le ramener sur le mot ;
  // un simple rejeu d'offset pose le cadre ailleurs.
  // Sans ce décalage, la copie pre-v632 passait le banc : la géométrie (10,10)
  // seule ne distinguait RIEN (mesuré — contrôle négatif invalide).
  const DECALAGE = 40;
  const TEXTE_SEME = ("Il y a donc bien des eclaircies dans ce passage ".slice(0, DECALAGE)
                      .padEnd(DECALAGE, " ")) + TEXTE;
  const shape = {
    id: "fv632h", x: 10, y: 10, w: 200, h: 76, shape: "Croix", color: "#4f8ef7",
    weight: 1.2, fill: "", rot: 0, svg: SVG, z: 6,
    // offset périmé : start/end = ceux de « Verbe » dans le texte ORIGINAL
    text: "Mon commentaire de banc v632h",
    ancre: { start: IDX1, end: IDX1 + 5, texte: "Verbe", dx: 0, dy: 0 },
  };

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs, shape }) => {
    const chat = { id: chatId, title: "Banc v632h", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [shape] },
    ] };
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
        tx.objectStore("chats").put(chat);
        tx.objectStore("settings").put({ id: "currentChatId", value: chatId });
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chatId);
    localStorage.setItem("theo_chat_id", chatId);
  }, { chatId: CHAT, texte: TEXTE_SEME, msgTs: MSGTS, shape });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      window.__disarm = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay");
        if (w) w.classList.remove("active");
      }, 250);
    });
  }

  async function lireFigures() {
    return page.evaluate((chatId) => {
      try {
        const ls = localStorage.getItem("theologicus_chat_" + chatId);
        if (ls) { const o = JSON.parse(ls); const m = o.messages[o.messages.length - 1]; return m.shapes || []; }
      } catch (e) {}
      return [];
    }, CHAT);
  }

  // Écart entre le bord du cadre et le rect du mot d'ancre (en px).
  async function ecartAuMot(figId, mot) {
    return page.evaluate(({ id, m }) => {
      const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
      if (!fb) return { ok: false, raison: "cadre absent" };
      const box = document.querySelector(".message-content");
      if (!box) return { ok: false, raison: "message absent" };
      // trouver le mot dans les nœuds TEXTE du message (hors cadres)
      const EX = ".atc-figbox, .theo-fig, .theo-src-chips, [data-no-anchor]";
      const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (n.parentElement && n.parentElement.closest(EX)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let cible = null;
      while (w.nextNode()) {
        const n = w.currentNode;
        const i = n.nodeValue.indexOf(m);
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(n, i); r.setEnd(n, i + m.length);
          cible = r; break;
        }
      }
      if (!cible) return { ok: false, raison: "mot introuvable" };
      const rr = cible.getBoundingClientRect(), fr = fb.getBoundingClientRect();
      const ecartX = Math.round(Math.max(fr.left - rr.left, rr.left - fr.right, 0));
      const ecartY = Math.round(Math.max(fr.top - rr.top, rr.top - fr.bottom, 0));
      return { ok: ecartX <= 6 && ecartY <= 6, ecartX, ecartY,
               contient: fr.left <= rr.left && fr.right >= rr.right && fr.top <= rr.top && fr.bottom >= rr.bottom,
               l: Math.round(fr.left), t: Math.round(fr.top) };
    }, { id: figId, m: mot });
  }

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector(".message-content", { timeout: 20000 });
    await page.waitForSelector('.atc-figbox[data-fig-id="fv632h"]', { timeout: 20000 });
    await page.waitForTimeout(1200);

    // A. le cadre s'est bien REPLACÉ sur le mot malgré sa géométrie semée (10,10)
    const a = await ecartAuMot("fv632h", "Verbe");
    ok("A. cadre semé en (10,10) : replacé sur son mot au rendu", a.ok, JSON.stringify(a));

    // B. l'ancre est encore là et porte le TEXTE du passage
    const f1 = await lireFigures();
    const fig1 = f1.find(x => x.id === "fv632h");
    ok("B. l'encadré existe avec son ancre", !!fig1 && !!fig1.ancre, "figures=" + f1.length);
    ok("C. l'ancre porte le TEXTE du passage", !!fig1 && fig1.ancre && fig1.ancre.texte === "Verbe",
      fig1 && fig1.ancre ? "texte=" + JSON.stringify(fig1.ancre.texte) + " start=" + fig1.ancre.start : "pas d'ancre");

    // D. le COMMENTAIRE est conservé
    ok("D. le commentaire de l'encadré est conservé", !!fig1 && fig1.text === "Mon commentaire de banc v632h",
      fig1 ? "text=" + JSON.stringify(fig1.text) : "absent");

    // E. après VRAI rechargement : toujours sur le mot, note intacte
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector('.atc-figbox[data-fig-id="fv632h"]', { timeout: 20000 });
    await page.waitForTimeout(1200);

    const e2 = await ecartAuMot("fv632h", "Verbe");
    ok("E. après RELOAD : le cadre est toujours sur son mot (< 6 px)", e2.ok, JSON.stringify(e2));

    const f2 = await lireFigures();
    const fig2 = f2.find(x => x.id === "fv632h");
    ok("F. après RELOAD : le commentaire est toujours là",
      !!fig2 && fig2.text === "Mon commentaire de banc v632h", fig2 ? "text=" + JSON.stringify(fig2.text) : "absent");
    ok("G. après RELOAD : l'ancre texte est intacte",
      !!fig2 && fig2.ancre && fig2.ancre.texte === "Verbe", fig2 && fig2.ancre ? "texte=" + JSON.stringify(fig2.ancre.texte) : "pas d'ancre");

    ok("aucune erreur JS", errJs.length === 0, errJs.slice(0, 2).join(" | "));
  } catch (e) {
    ok("exception du banc", false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
  }

  await browser.close();
  serveur.close();

  const bons = res.filter(r => r[0]).length;
  console.log("-".repeat(74));
  console.log(`RESULTAT : ${bons}/${res.length}`);
  console.log("-".repeat(74));
  process.exit(bons === res.length ? 0 : 1);
})();
