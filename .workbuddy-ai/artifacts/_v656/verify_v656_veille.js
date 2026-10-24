// Banc v656 — UNE HAUTEUR QUI CHANGE SANS MUTATION `childList` EST SUIVIE.
//
// POURQUOI CE BANC EXISTE.
// Le banc v634 a fait tomber la CI (shard 1, run 39978888742) :
//     [ECHEC] C. geometrie IDENTIQUE apres 5 rendus -- 149,240,672,90 | 149,301,672,90
//     [ECHEC] D. apres 3 RELOAD -- depart 149,240 | reloads 149,301 (x3)
// Reproduit localement : `depart 147,72` contre `reloads 149,301`. Le cadre est
// pose AVANT que le contenu ait fini de grandir, et rien ne le replace ensuite.
//
// Mais v634 n'echoue qu'1 fois sur 4 ou 5 : sa serie ne discrimine pas (10/10
// avec le correctif, 6/6 sans). Il fallait donc un banc DETERMINISTE.
//
// LE MECANISME ISOLE ICI.
// Le seul declencheur de re-placement est le MutationObserver de `#chat-container`,
// qui n'observe que `childList` + `subtree`. Une hauteur qui change SANS
// insertion de noeud — police qui arrive, image qui se charge, marge qui bouge —
// ne produit AUCUNE mutation : aucun re-placement n'est planifie. Le cadre reste
// a sa position provisoire. C'est exactement la consequence du defaut reel
// (mutation perdue pendant une passe, mesuree en v655), et c'est reproductible
// a volonte : on ajoute une marge, sans toucher au DOM.
//
// CONTRAT TESTE
//   A. premisse : la mise en page est calme, le cadre est pose ;
//   B. premisse : la hauteur du message grandit de >= 150 px, et le texte
//      SOUS l'insertion se deplace d'autant — mesure INDEPENDANTE du cadre ;
//   C. le cadre SUIT le texte : dy(cadre) == dy(texte), a 2 px pres ;
//   D. l'ancre enregistree n'est PAS touchee (lecon v651b : re-reparer
//      l'ancre degradait tout, 63/107 puis 21-33/107) ;
//   E. aucune erreur JavaScript.
//
// Controle negatif : BENCH_ROOT sur un build pre-v656 => C echoue (le cadre
// reste immobile alors que le texte s'est deplace de 180 px), A/B/D/E passent.
// Le banc refuse de conclure si B ne tient pas : sans croissance reelle, il n'y
// a rien a mesurer et il ne doit pas passer a vide.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9660;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v656-veille";
const MSGTS = 1795000000656;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

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

const PHRASE = "et cette designation porte une charge confessionnelle que la Septante avait deja preparee dans son usage du tetragramme rendu par ho kyrios";
const START = TEXTE.indexOf(PHRASE);
const END = START + PHRASE.length;

const CROISSANCE = 180;   // px ajoutes sous le cadre, sans toucher au DOM

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

  /* Ancre SEMEE explicitement (start/end + ow/oh + ox/oy). Pourquoi :
     - pas de reparation, donc aucune dependance au moment ou elle s'execute
       (c'est la course qu'on ne veut PAS mesurer ici) ;
     - `ox: 0` / `oy: 0` sont des VALEURS : le code teste le TYPE, pas la
       veracite (`(f.x||10)` aurait transforme 0 en 10). */
  await page.evaluate(async ({ chatId, texte, msgTs, svg, start, end }) => {
    const chat = { id: chatId, title: "Banc v656", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [
        { id: "fveille", x: 40, y: 120, w: 420, h: 90, shape: "Rectangle", color: "#4f8ef7",
          weight: 1.2, fill: "", rot: 0, text: "", note: "note veille", svg: svg,
          ancre: { start: start, end: end, ow: 672, oh: 90, ox: 0, oy: 0 } },
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

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    // NE JAMAIS retirer setup-wizard-overlay (coupe l'init) : desarmer .active.
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    }, 250);
  });
  await page.evaluate(async (id) => {
    try { await window.loadChat(id); } catch (e) {}
    try { window.renderMessages(); } catch (e) {}
  }, CHAT);
  await page.waitForSelector('.atc-figbox[data-fig-id="fveille"]', { state: "attached", timeout: 30000 });

  /* Mesure : position du CADRE et du DERNIER BLOC STATIQUE, toutes deux
     relatives au conteneur du message — donc comparables sans se soucier du
     defilement.
     🔴 Le dernier enfant de `.message-content` est `.atc-figbox` (le cadre,
     `position: absolute`) : le prendre comme reference de texte faisait
     comparer le cadre A LUI-MEME, donc 0 contre 0 — un controle qui passait a
     vide. On prend le dernier bloc NON absolu qui porte du texte
     (`.theo-lex`, `.theo-fig` ou un paragraphe selon le rendu). */
  async function etat() {
    return await page.evaluate(() => {
      const mc = document.querySelector(".message-content");
      const fb = document.querySelector('.atc-figbox[data-fig-id="fveille"]');
      if (!mc || !fb) return null;
      const rmc = mc.getBoundingClientRect();
      const statiques = Array.from(mc.children).filter(function (el) {
        return getComputedStyle(el).position !== "absolute" &&
               (el.textContent || "").trim().length > 0;
      });
      const ref = statiques.length ? statiques[statiques.length - 1] : null;
      return {
        cadre: Math.round(fb.getBoundingClientRect().top - rmc.top),
        texte: ref ? Math.round(ref.getBoundingClientRect().top - rmc.top) : null,
        refCls: ref ? String(ref.className || ref.tagName) : "aucune",
        h: Math.round(mc.scrollHeight),
        blocs: mc.children.length,
      };
    });
  }

  /* Attendre le CALME REEL : 4 mesures identiques ET au moins 3 s ecoulees.
     Le plancher de temps est indispensable — mesure v655 : la mise en page
     croit par paliers pendant ~4 s, et deux mesures egales tombent aussi sur
     un palier intermediaire. */
  async function calme(minMs) {
    const t0 = Date.now();
    let prec = null, n = 0;
    for (let i = 0; i < 40; i++) {
      const cur = await etat();
      if (cur && prec && cur.cadre === prec.cadre && cur.h === prec.h) n++;
      else n = 0;
      prec = cur;
      if (n >= 4 && Date.now() - t0 >= (minMs || 3000)) break;
      await page.waitForTimeout(250);
    }
    return prec;
  }

  /* L'ancre telle que le STORE la connait. On la lit AVANT la croissance et
     APRES : c'est la comparaison qui compte, pas la valeur semee — l'app
     normalise l'ancre au premier rendu (mesure : `end` 265 -> 264). */
  async function lireAncre() {
    return await page.evaluate(async (chatId) => {
      const idb = await new Promise((ok2) => {
        const r = indexedDB.open("THEOLOGICUS_AI_DB");
        r.onsuccess = () => {
          const tx = r.result.transaction(["chats"], "readonly");
          const g = tx.objectStore("chats").get(chatId);
          g.onsuccess = () => ok2(g.result); g.onerror = () => ok2(null);
        };
        r.onerror = () => ok2(null);
      });
      const m = idb && idb.messages ? idb.messages.find(x => x.shapes && x.shapes.length) : null;
      const f = m ? m.shapes[0] : null;
      return f && f.ancre ? { start: f.ancre.start, end: f.ancre.end } : null;
    }, CHAT);
  }

  const e0 = await calme(3000);
  const ancre0 = await lireAncre();
  ok("A. premisse : le cadre est pose et la mise en page est calme",
     !!e0 && e0.cadre > 0 && e0.h > 0,
     e0 ? `cadre y=${e0.cadre}, texte y=${e0.texte}, hauteur ${e0.h}, ${e0.blocs} blocs` : "cadre ou message absent");

  /* ── LA CROISSANCE, SANS TOUCHER AU DOM ──────────────────────────────────
     `margin-top` sur le PREMIER bloc : la hauteur change, le texte descend,
     et AUCUN noeud n'est insere. Le MutationObserver (`childList`+`subtree`)
     ne peut donc rien voir — seul un echantillonnage de la hauteur le peut. */
  const applique = await page.evaluate((px) => {
    const mc = document.querySelector(".message-content");
    const premier = mc && mc.firstElementChild;
    if (!premier) return false;
    premier.style.marginTop = px + "px";
    return true;
  }, CROISSANCE);
  if (!applique) { console.log("premier bloc introuvable"); process.exit(2); }

  await page.waitForTimeout(2600);
  const e1 = await etat();

  const dTexte = (e1 && e0) ? e1.texte - e0.texte : -99999;
  const dCadre = (e1 && e0) ? e1.cadre - e0.cadre : -99999;
  const dH = (e1 && e0) ? e1.h - e0.h : -99999;

  ok("B. premisse : la hauteur a grandi de ~" + CROISSANCE + " px SANS insertion de noeud",
     dH >= 150 && dTexte >= 150 && (e1 && e0 && e1.blocs === e0.blocs),
     `hauteur ${dH >= 0 ? "+" : ""}${dH} px, texte ${dTexte >= 0 ? "+" : ""}${dTexte} px, ` +
     `blocs ${e0 ? e0.blocs : "?"} -> ${e1 ? e1.blocs : "?"} (inchange = aucune mutation childList)`);

  ok("C. le cadre SUIT le texte qui s'est deplace",
     Math.abs(dCadre - dTexte) <= 2,
     `cadre ${dCadre >= 0 ? "+" : ""}${dCadre} px contre texte ${dTexte >= 0 ? "+" : ""}${dTexte} px ` +
     `(ecart ${Math.abs(dCadre - dTexte)} px, tolerance 2)`);

  /* ── D. l'ancre n'a pas ete touchee ─────────────────────────────────────
     Lecon v651b : re-reparer l'ancre pendant la croissance a produit 63/107
     puis 21-33/107 figures deplacees. La veille ne doit QUE replacer. */
  const ancre1 = await lireAncre();

  ok("D. l'ancre enregistree n'a PAS ete touchee pendant la croissance",
     !!ancre0 && !!ancre1 && ancre0.start === ancre1.start && ancre0.end === ancre1.end,
     (ancre0 && ancre1)
       ? `avant ${ancre0.start}..${ancre0.end} -> apres ${ancre1.start}..${ancre1.end}`
       : "ancre absente du store");

  ok("E. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const total = res.length, bons = res.filter(r => r[0]).length;
  console.log(`\n  ${bons}/${total} — ${bons === total ? "OK" : "ECHEC"}`);
  await browser.close();
  serveur.close();
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
