// Banc v634 — LA GEOMETRIE D'UN CADRE REPARE EST IDEMPOTENTE.
//
// C'est le test DIRECT du symptome rapporte : « a chaque demarrage ca change de
// place, et je vois que c'est pire en pire ». Une position qui depend du NOMBRE
// de rendus n'est pas une position : c'est une derive cumulative.
//
// Contrat teste :
//   A. une figure sans ancre est reparee (ancre creee, `ow` fige) ;
//   B. `ow`/`oh` SONT IMMUABLES : apres 5 rendus supplementaires, ils sont
//      inchanges (v633g les ecrasait avec `f.w`, donc ils grossissaient) ;
//   C. la geometrie (l,t,w,h) est IDENTIQUE apres 5 rendus (idempotence) ;
//   D. la geometrie est IDENTIQUE apres 3 RELOAD complets (ce que l'utilisateur
//      fait vraiment) ;
//   E. l'ancre d'une figure multi-lignes ne prend PAS la largeur du bloc :
//      `ow` reste proche de la largeur voulue et NE SATURE PAS au conteneur
//      (mesure reelle : 447 -> 1612 px, soit la largeur du .message-content).
//
// Controle negatif : BENCH_ROOT sur un build pre-v634 => B, C, D et E echouent.
// Ce banc est concu pour que l'ancien build ne PUISSE pas passer : il rejoue
// volontairement le rendu, ce que le build pre-v634 traite en recalculant tout.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8834;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v634-idem";
const MSGTS = 1794000000222;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

// Figure semee sur une PHRASE LONGUE qui s'enroule sur PLUSIEURS lignes.
// C'est precisement le cas qui saturait : rr.w d'un bloc multi-lignes = largeur
// du conteneur, et v633i prenait max(ow, rr.w+16) a chaque rendu.
const TEXTE = [
  "1. Kyrios comme titre christologique",
  "",
  "**Paul de Tarse** utilise *Kyrios* dans ses epitres pour designer Jesus comme Seigneur, et cette designation porte une charge confessionnelle que la Septante avait deja preparee dans son usage du tetragramme rendu par ho kyrios.",
  "",
  "**Methode** :",
  "  1. Analyser Mar Yah dans les Targums.",
  "  2. Etudier Kyrios dans le NT.",
  "  3. Comparer avec la patristique.",
  "",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
].join("\n");

// Phrase ancre voulue : 3 lignes a 1280 px de large. On la seme comme ancre
// EXACTE pour rendu deterministe (l'utilisateur, lui, la selectionne a la souris).
const PHRASE = "et cette designation porte une charge confessionnelle que la Septante avait deja preparee dans son usage du tetragramme rendu par ho kyrios";
const START = TEXTE.indexOf(PHRASE);
const END = START + PHRASE.length;

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

(async () => {
  if (START < 0) { console.log("PHRASE introuvable dans TEXTE"); process.exit(2); }

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
  await page.evaluate(async ({ chatId, texte, msgTs, svg, start, end }) => {
    const chat = { id: chatId, title: "Banc v634", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [
        // svg non vide (sanitizeChatMessages filtre f && f.id && f.svg).
        // AUCUNE ancre : la figure est posee « au pixel », comme 246/339 du store reel.
        { id: "fmulti", x: 40, y: 120, w: 420, h: 90, shape: "Rectangle", color: "#4f8ef7",
          weight: 1.2, fill: "", rot: 0, text: "", note: "note idem", svg: svg },
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
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS, svg: SHAPE_SVG, start: START, end: END });

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
  async function charger(sel) {
    await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
    await page.waitForSelector('.atc-figbox[data-fig-id="' + (sel || "fmulti") + '"]', { state: "attached", timeout: 20000 });
    /* 🔴 v642 — LAISSER LA MISE EN PAGE SE STABILISER AVANT DE MESURER.
       Le contenu du message s'agrandit APRES le premier rendu (fiches,
       puces de sources) : mesurer aussitot capture une position provisoire
       (240 px mesure) qui n'est PAS celle que l'utilisateur voit.
       🔴 v647 — DEUX MESURES CONCORDANTES NE SUFFISAIENT PAS.
       Mesure (sonde _v647/probe_flake_v634.js) : le contenu grandit PAR
       PALIERS — scrollHeight 391 -> 727 -> 788 -> 849 — et le cadre suit
       avec le retard d'une passe (y : 72 -> 240 -> 301). Deux mesures
       concordantes tombent donc AUSSI sur un palier intermediaire : la
       boucle coupait a t=321 ms sur le palier y=240, puis `mesure()`
       lisait 301. D'ou 6/6, 6/6, 4/6 sur le MEME build (fluctuation
       confirmee sur le build d'avant comme sur le corrige).
       Critere retenu : le couple (y du cadre, scrollHeight) doit etre
       INCHANGE sur 5 mesures consecutives espacces de 250 ms, soit ~1 s
       de calme — de quoi couvrir le dernier palier observe (540 ms) et la
       passe de placement qui le suit (646 ms). Aucun palier intermediaire
       observe ne dure assez longtemps pour produire 5 mesures egales. */
    let _prec = null, _calme = 0;
    for (let i = 0; i < 30; i++) {
      const cur = await page.evaluate(() => {
        const b = document.querySelector(".message-content");
        const f = document.querySelector('.atc-figbox[data-fig-id="fmulti"]');
        if (!b || !f) return null;
        const br = b.getBoundingClientRect(), fr = f.getBoundingClientRect();
        return [Math.round(fr.top - br.top + b.scrollTop), Math.round(b.scrollHeight)];
      });
      if (cur && _prec && cur[0] === _prec[0] && cur[1] === _prec[1]) _calme++;
      else _calme = 0;
      _prec = cur;
      if (_calme >= 4) break;
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(400);
  }

  // Geometrie + ancre engagee, lues dans DEUX sources independantes :
  //  - le DOM (position reelle du cadre)
  //  - le store (ancre et tailles de reference `ow`/`oh`)
  async function mesure() {
    return page.evaluate(async (chatId) => {
      const fb = document.querySelector('.atc-figbox[data-fig-id="fmulti"]');
      const box = document.querySelector(".message-content");
      if (!fb || !box) return { ok: false, raison: "cadre ou message absent" };
      const fr = fb.getBoundingClientRect(), br = box.getBoundingClientRect();
      // Coordonnees RELATIVES au conteneur (le seul espace ou la position a un sens)
      const rel = {
        l: Math.round(fr.left - br.left + box.scrollLeft),
        t: Math.round(fr.top - br.top + box.scrollTop),
        w: Math.round(fr.width), h: Math.round(fr.height),
      };
      /* 🔴 v642 — LIRE LE STORE CANONIQUE (IndexedDB), PAS localStorage.
         `saveChat` ecrit dans IDB via db.put ; localStorage n'est que le
         filet de secours (`flushChatNow`). Un banc qui lit localStorage
         conclut « le store n'apprend rien » alors que IDB est deja juste —
         erreur commise en v637-v641. */
      let sh = null;
      try {
        const idb = await new Promise((ok) => {
          const r = indexedDB.open("THEOLOGICUS_AI_DB");
          r.onsuccess = () => { const db = r.result;
            const tx = db.transaction(["chats"], "readonly");
            const g = tx.objectStore("chats").get(chatId);
            g.onsuccess = () => ok(g.result || null); g.onerror = () => ok(null); };
          r.onerror = () => ok(null);
        });
        sh = idb && idb.messages ? (idb.messages.slice(-1)[0].shapes || []).find(s => s.id === "fmulti") : null;
      } catch (e) {}
      if (!sh) {
        try {
          const c = JSON.parse(localStorage.getItem("theologicus_chat_" + chatId) || "null");
          sh = c ? (c.messages.slice(-1)[0].shapes || []).find(s => s.id === "fmulti") : null;
        } catch (e) {}
      }
      return {
        ok: true, rel,
        ancre: sh && sh.ancre ? { start: sh.ancre.start, end: sh.ancre.end } : null,
        ow: sh && sh.ancre ? sh.ancre.ow : null,
        oh: sh && sh.ancre ? sh.ancre.oh : null,
        persisted: sh ? { x: sh.x, y: sh.y, w: sh.w, h: sh.h } : null,
        boxW: Math.round(box.clientWidth),
      };
    }, CHAT);
  }

  const sig = (m) => m && m.ok ? [m.rel.l, m.rel.t, m.rel.w, m.rel.h].join(",") : "ko";

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await charger();

    // A. reparation effectuee
    const m1 = await mesure();
    ok("A. figure sans ancre reparee (ancre + ow/oh figes)",
      !!(m1.ok && m1.ancre && typeof m1.ow === "number"), m1.ok ? JSON.stringify({ ancre: m1.ancre, ow: m1.ow, oh: m1.oh }) : m1.raison);

    // B/C. cinq rendus supplementaires : ow/oh et geometrie doivent etre FIGES
    const sig0 = sig(m1);
    const larg = [sig0];
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => { try { window.renderMessages(); } catch (e) {} });
      await page.waitForTimeout(600);
      larg.push(sig(await mesure()));
    }
    const m2 = await mesure();
    /* 🔴 v644 — B/C/D ne doivent PAS pouvoir passer sans ancre : sur un build
       qui ne cree aucune ancre, `ow` vaut null des deux cotes et la geometrie
       reste sur les pixels semes (40,120). On exige donc une ancre REELLE avec
       une largeur numerique AVANT de comparer, sinon le controle est vide. */
    const ancreReelle = !!(m1.ok && m1.ancre && typeof m1.ow === 'number' && m1.ow > 0);
    const resteSurPixels = !!(m1.ok && Math.abs(m1.rel.l - 40) <= 1 && Math.abs(m1.rel.t - 120) <= 1);
    ok("B. ow/oh IMMUABLES apres 5 rendus",
      ancreReelle && m2.ok && m1.ow === m2.ow && m1.oh === m2.oh,
      ancreReelle ? `ow ${m1.ow}->${m2.ow} / oh ${m1.oh}->${m2.oh}` : "AUCUNE ancre : controle vide");
    const uniques = Array.from(new Set(larg));
    ok("C. geometrie IDENTIQUE apres 5 rendus (idempotence)",
      ancreReelle && !resteSurPixels && uniques.length === 1 && uniques[0] !== "ko",
      ancreReelle ? (uniques.join(" | ") + (resteSurPixels ? " [cadre reste sur les pixels semes]" : ""))
                  : "AUCUNE ancre : controle vide");

    // D. trois RELOAD complets — ce que l'utilisateur fait vraiment
    const sigReloads = [];
    for (let i = 0; i < 3; i++) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
      await attendreApp();
      await charger();
      sigReloads.push(sig(await mesure()));
    }
    const uniqR = Array.from(new Set(sigReloads.concat([sig0])));
    ok("D. geometrie IDENTIQUE apres 3 RELOAD",
      ancreReelle && !resteSurPixels && uniqR.length === 1 && uniqR[0] !== "ko",
      ancreReelle ? `depart ${sig0} | reloads ${sigReloads.join(" | ")}`
                  : "AUCUNE ancre : controle vide");

    // E. l'ancre multi-lignes ne sature pas la largeur du conteneur
    const mF = await mesure();
    ok("E. `ow` ne saturera pas la largeur du conteneur",
      ancreReelle && mF.ok && typeof mF.ow === "number" && mF.ow < mF.boxW * 0.95,
      ancreReelle ? `ow ${mF.ow} / boxW ${mF.boxW}` : "AUCUNE ancre : controle vide");

    // F. hygiene : aucun saut JS pendant toute la sequence
    ok("F. aucun pageerror", errJs.length === 0, errJs.slice(0, 2).join(" / "));

    const reussis = res.filter(r => r[0]).length;
    console.log(`\n${reussis}/${res.length} — ${reussis === res.length ? "OK" : "ECHEC"}`);
    await browser.close(); serveur.close();
    process.exit(reussis === res.length ? 0 : 1);
  } catch (e) {
    console.log("EXCEPTION " + (e && e.stack || e));
    try { await browser.close(); } catch (_) {}
    serveur.close();
    process.exit(1);
  }
})();
