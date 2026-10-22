// Banc v633 — UNE FIGURE SANS ANCRE EST REPAREE **SUR LE TEXTE QU'ELLE COUVRE**,
// PUIS ELLE SUIT CE TEXTE QUAND LE CONTENU SE DECALE.
//
// Contrat teste (et non une commodite du banc) :
//   A. la figure sans ancre recoit une ancre, et cette ancre porte le texte
//      que la boite recouvrait reellement ;
//   B. cette ancre est PERSISTEE (store) — sans quoi la reparation est refaite
//      a chaque demarrage et perdue : c'est le bug rapporte ;
//   C. apres injection d'une fiche Wikipedia AVANT, la figure a suivi SON texte
//      (c.-a-d. qu'elle s'est deplacee avec lui, pas reste sur ses pixels) ;
//   D. apres RELOAD, l'ancre persiste et la figure est toujours sur son texte.
//
// Controle negatif : avec BENCH_ROOT pointant sur un build pre-v633, aucune
// ancre n'est creee (A echoue) et la figure reste sur ses pixels (C echoue).
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8833;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v633-0001";
const MSGTS = 1790800000111;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

// La figure sera semee a (0,0) 200x60 : elle recouvre donc le DEBUT du message.
const TEXTE = [
  "1. Kyrios comme titre christologique",
  "",
  "**Paul de Tarse** utilise *Kyrios* dans ses epitres pour designer Jesus comme Seigneur.",
  "",
  "**Methode** :",
  "  1. Analyser Mar Yah dans les Targums.",
  "  2. Etudier Kyrios dans le NT.",
  "  3. Comparer avec la patristique.",
  "",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
  "",
  "2. Kyrios et la confession de foi",
].join("\n");

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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs, svg }) => {
    const chat = { id: chatId, title: "Banc v633", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [
        // svg NON VIDE : sanitizeChatMessages filtre f && f.id && f.svg.
        // AUCUNE ancre : c'est la situation mesuree sur 319/320 figures du store.
        { id: "fsans", x: 0, y: 0, w: 200, h: 60, shape: "Carré", color: "#4f8ef7",
          weight: 1.2, fill: "", rot: 0, text: "", note: "Note v633", svg: svg },
      ] },
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
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS, svg: SHAPE_SVG });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      // NE JAMAIS retirer setup-wizard-overlay (coupe l'init) : desarmer .active.
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
      }, 250);
    });
  }
  async function charger() {
    await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
    // state:"attached" — la boite est pointer-events:none (v621).
    await page.waitForSelector('.atc-figbox[data-fig-id="fsans"]', { state: "attached", timeout: 20000 });
    await page.waitForTimeout(1400);
  }

  // Etat expose : ancre persistee + geometrie du texte qu'elle designe.
  async function etat() {
    return page.evaluate((chatId) => {
      const fb = document.querySelector('.atc-figbox[data-fig-id="fsans"]');
      const box = document.querySelector(".message-content");
      if (!fb || !box) return { ok: false, raison: "cadre ou message absent" };
      let sh = null;
      try {
        const c = JSON.parse(localStorage.getItem("theologicus_chat_" + chatId) || "null");
        sh = c ? (c.messages.slice(-1)[0].shapes || []).find(s => s.id === "fsans") : null;
      } catch (e) {}
      const an = sh && sh.ancre ? sh.ancre : null;
      const fr = fb.getBoundingClientRect(), br = box.getBoundingClientRect();
      // rect du texte de l'ancre, mesure INDEPENDAMMENT du produit (walker locale)
      let rr = null;
      if (an && typeof an.start === "number") {
        const EX = ".atc-figbox, .theo-fig, .theo-src-chips, [data-no-anchor]";
        const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            if (n.parentElement && n.parentElement.closest(EX)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        let acc = 0, a0 = null, b0 = null;
        while (w.nextNode()) {
          const n = w.currentNode, L = n.nodeValue.length;
          if (!a0 && an.start < acc + L) a0 = { n: n, o: an.start - acc };
          if (!b0 && an.end <= acc + L) { b0 = { n: n, o: an.end - acc }; break; }
          acc += L;
        }
        if (a0 && b0) {
          const rg = document.createRange();
          rg.setStart(a0.n, Math.max(0, a0.o)); rg.setEnd(b0.n, Math.max(0, b0.o));
          const q = rg.getBoundingClientRect();
          rr = { l: Math.round(q.left), t: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) };
        }
      }
      // le cadre contient-il le texte ancre ? (comparaison au CONTENEUR, pas au viewport)
      let couvre = null;
      if (rr) {
        couvre = (fr.left <= rr.l + 1 && fr.right >= rr.l + rr.w - 1 &&
                  fr.top <= rr.t + 1 && fr.bottom >= rr.t + rr.h - 1);
      }
      return {
        ok: true,
        ancre: an ? { start: an.start, end: an.end, texte: (an.texte || "").slice(0, 60) } : null,
        note: sh ? sh.note : null,
        fig: { l: Math.round(fr.left), t: Math.round(fr.top), w: Math.round(fr.width), h: Math.round(fr.height) },
        boxTop: Math.round(br.top),
        texteAncre: rr, couvre
      };
    }, CHAT);
  }

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await charger();

    // A. une ancre a ete CREEE, portant un texte reel du message
    const e1 = await etat();
    ok("A. une figure SANS ancre recoit une ancre", !!(e1.ok && e1.ancre),
      e1.ancre ? JSON.stringify(e1.ancre.texte) : (e1.raison || "pas d'ancre"));

    // B. cette ancre est PERSISTEE (le store la porte)
    const persiste = await page.evaluate((chatId) => {
      const c = JSON.parse(localStorage.getItem("theologicus_chat_" + chatId) || "null");
      const sh = c && (c.messages.slice(-1)[0].shapes || []).find(s => s.id === "fsans");
      return sh && sh.ancre ? { start: sh.ancre.start, end: sh.ancre.end } : null;
    }, CHAT);
    ok("B. l'ancre reparee est PERSISTEE dans le store", !!persiste, JSON.stringify(persiste));

    // C. la figure couvre bien le texte de son ancre
    ok("C. la figure contient le texte de son ancre", e1.couvre === true, JSON.stringify({ fig: e1.fig, txt: e1.texteAncre }));

    // D. on insere une fiche Wikipedia AVANT -> le texte se decale
    const avantTop = e1.fig.t;
    await page.evaluate(() => {
      const box = document.querySelector(".message-content");
      const fig = document.createElement("div");
      fig.className = "theo-fig";
      fig.innerHTML = '<div class="theo-fig-t">Kyrios</div><div class="theo-fig-x">' +
        "Notice encyclopedique assez longue pour representer une fiche reelle et decaler le texte. ".repeat(4) +
        '</div><a class="theo-fig-l" href="#">Article Wikipedia</a>';
      box.insertBefore(fig, box.firstChild);
      if (typeof window.applyShapes === "function") window.applyShapes();
    });
    await page.waitForTimeout(1400);
    const e2 = await etat();
    // la figure a suivi : elle s'est DEPLACEE de la meme quantite que son texte
    const bouge = e2.ok && Math.abs(e2.fig.t - avantTop) > 20;
    ok("D. apres injection AVANT : la figure A SUIVI son texte", bouge && e2.couvre === true,
      JSON.stringify({ avantTop, apres: e2.fig.t, couvre: e2.couvre }));

    // E. vrai rechargement
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await charger();
    const e3 = await etat();
    ok("E. apres RELOAD : ancre conservee et figure sur son texte",
      !!(e3.ok && e3.ancre && e3.couvre === true),
      JSON.stringify({ ancre: e3.ancre && e3.ancre.texte, couvre: e3.couvre }));

    // F. le commentaire du cadre a survecu
    ok("F. le commentaire du cadre est conserve", !!(e3.ok && e3.note === "Note v633"), e3.note);

    ok("aucune erreur JS", errJs.length === 0, errJs.slice(0, 2).join(" | "));
  } catch (e) {
    ok("exception du banc", false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
  }

  await browser.close();
  serveur.close();
  const bons = res.filter(r => r[0]).length;
  console.log("-".repeat(74));
  console.log(`RESULTAT : ${bons}/${res.length}`);
  const sig = res.filter(r => !r[0]).map(r => r[1]);
  if (sig.length) console.log("SIGNATURES D'ECHEC : " + JSON.stringify(sig));
  console.log("-".repeat(74));
  process.exit(bons === res.length ? 0 : 1);
})();
