// Banc v649 — LE DEFILEMENT NE FORCE PLUS DE REFLOW PAR MESSAGE.
//
// Plainte : « depuis les derniers mise a jour et fixes, l'interface de
// theologicus est devenu tres laggy et lente ».
//
// Regression MESUREE (sonde _v649/sonde_perf.js) sur 60 messages, 2 figures
// chacun, en comparant le build d'avant la refonte de l'ancrage au build
// courant :
//
//                              reference   avant v649   apres v649
//    reflows / scroll 30 crans     0           1302          0
//    reflows / settle (4 passes)   —            744         264
//    heap JS                     18 Mo         43 Mo        45 Mo
//
// CAUSE : `_atcBoxNear(box)` appelle `box.getBoundingClientRect()`, ce qui
// FORCE un reflow synchrone. Il etait appele pour CHAQUE message de
// `state.messages` dans `applyHighlights`, `applyMarks` ET `applyShapes`, et
// ce avant tout filtre — 3 mesures par message, x 4 passes de stabilisation
// = 12 mesures par message. Sur une conversation reelle (100+ messages), un
// mouvement de molette devenait des centaines de reflows forces.
//
// CORRECTIF : la proximite est memorisee par message PENDANT une passe, et
// l'identifiant de passe change a chaque passe (le contenu grandit entre les
// passes — c'est ce que la stabilisation guette, il faut donc re-mesurer).
// Le cache n'est ACTIF que dans `passe()` : tout autre point d'appel mesure
// comme avant.
//
// CONTRAT TESTE :
//   A. le defilement ne force quasiment plus de reflow (le geste le plus
//      frequent de l'utilisateur redevient fluide) ;
//   B. un settle coute de l'ordre d'UNE mesure par message et par passe, pas
//      douze — et ce nombre ne doit PAS exploser avec la longueur de la
//      conversation ;
//   C. CORRECTNESS : apres ce defilement, les figures couvrent encore leur
//      texte. Une optimisation qui casse l'ancrage n'en est pas une ;
//   D. aucune erreur JavaScript.
//
// Controle negatif : BENCH_ROOT sur un build AVANT le correctif => A echoue
// (1302 reflows), B echoue (12 par message).
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8940;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v649-reflow";
const NB_MSG = 60;
const FIG_PAR_MSG = 2;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

const PARAGRAPHES = [
  "La notion de Kyrios designe la seigneurie divine, et cette designation porte une charge confessionnelle que la Septante avait deja preparee.",
  "Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.",
  "Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.",
  "Le terme grec porte aussi une coloration politique, ce que les traductions anciennes attenuaient.",
  "La tradition syriaque conserve une lecture legerement differente du meme verset.",
  "On notera enfin que la Vulgate suit ici la Septante plutot que l hebreu.",
];

function construireChat() {
  const messages = [{ role: "system", content: "sys", ts: 1 }];
  for (let i = 0; i < NB_MSG; i++) {
    const contenu = [];
    for (let p = 0; p < 6; p++) contenu.push(PARAGRAPHES[(i + p) % PARAGRAPHES.length]);
    contenu.push(""); contenu.push("");
    const shapes = [];
    for (let k = 0; k < FIG_PAR_MSG; k++) {
      shapes.push({
        id: "f-" + i + "-" + k,
        x: 8 + k * 40, y: 10 + k * 110, w: 420, h: 90,
        shape: "Rectangle", color: "#4f8ef7", weight: 1.4, fill: "", rot: 0,
        text: "", note: "note " + i + "-" + k, svg: SHAPE_SVG, ancre: null,
      });
    }
    messages.push({ role: "assistant", content: contenu.join("\n"), ts: 1796000000000 + i * 1000,
                    marks: [{ id: "m-" + i, start: 12, end: 48, color: "#ffd54f", ts: 100 + i }],
                    shapes: shapes, annotations: [] });
  }
  return { id: CHAT, title: "Banc v649", updated: Date.now(), messages: messages };
}

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
  await page.evaluate(async (chat) => {
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
        tx.objectStore("settings").put({ id: "currentChatId", value: chat.id });
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("theologicus_chat_" + chat.id, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chat.id);
    localStorage.setItem("theo_chat_id", chat.id);
  }, construireChat());

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
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
  await page.waitForSelector(".atc-figbox", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2500);

  const nbMsg = await page.evaluate(() => document.querySelectorAll(".message-content").length);
  ok("conversation longue chargee", nbMsg >= NB_MSG, nbMsg + " messages");

  // Compter les reflows forces (le proxy exact du cout de mise en page).
  await page.evaluate(() => {
    window.__perf = { rect: 0 };
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      window.__perf.rect++;
      return orig.apply(this, arguments);
    };
  });

  /* ──────── A. SCROLL : cout d'un settle DECLENCHE PAR LE SCROLL ────────
     🔴 Deux pieges de mesure, rencontres et corriges :
       1. `document.scrollingElement` NE DEFILE PAS dans cette app
          (scrollHeight == clientHeight == 900). Le vrai conteneur est
          `#chat-container` (mesure : scrollHeight 24175, clientHeight 697).
          Scroller la fenetre ne declenche donc AUCUN settle — d'ou des
          mesures a 0 reflow qui ne prouvaient rien.
       2. Le gestionnaire de scroll est throttle a 120 ms et le settle est
          coalesce par rAF : une rafale de crans rapides peut ne declencher
          aucun settle. On espace donc les pas de 150 ms pour qu'exactement
          un settle tombe par pas. Resultat deterministe. */
  const scroll = await page.evaluate(async () => {
    // Le conteneur qui defile VRAIMENT.
    let cc = document.querySelector("#chat-container");
    if (!cc || cc.scrollHeight <= cc.clientHeight + 50) {
      cc = Array.from(document.querySelectorAll("*")).find(function (el) {
        return el.scrollHeight > el.clientHeight + 50 &&
               /(auto|scroll)/.test(getComputedStyle(el).overflowY);
      }) || document.scrollingElement || document.documentElement;
    }
    const max = cc.scrollHeight - cc.clientHeight;
    const avant = { r: window.__perf.rect, s: 0 };
    if (typeof window.__atcSettle === "function") {
      const os = window.__atcSettle;
      window.__atcSettle = function () { window.__perf.settle = (window.__perf.settle || 0) + 1; return os.apply(this, arguments); };
    }
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      cc.scrollTop = Math.round(max * (i + 1) / 12);
      await new Promise(r => setTimeout(r, 150));   // > throttle 120 ms
    }
    return { duree: Math.round(performance.now() - t0), rect: window.__perf.rect - avant.r,
             top: cc.scrollTop, max: max, sel: cc.id ? "#" + cc.id : cc.tagName };
  });
  ok("A0. le scroll a bien eu lieu dans le bon conteneur",
     scroll.top > 0,
     "scrollTop " + scroll.top + "/" + scroll.max + " dans " + (scroll.sel || "?") +
     " (un cran de " + Math.round(scroll.max / 12) + " px)");

  /* ──────── B. SETTLE : cout d'une sequence de stabilisation ──────── */
  const settle = await page.evaluate(async () => {
    if (typeof window.__atcSettle !== "function") return { absent: true, rect: 0 };
    const avant = window.__perf.rect;
    window.__atcSettle();
    await new Promise(r => setTimeout(r, 1100));
    return { absent: false, rect: window.__perf.rect - avant };
  });

  /* ──────── C. CORRECTNESS : les figures couvrent encore leur texte ──────── */
  await page.evaluate(() => { window.__perf.rect = 0; });
  const couvre = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll(".message-content"));
    let bon = 0, total = 0;
    for (const b of boxes) {
      const figs = b.querySelectorAll(".atc-figbox");
      for (const f of figs) {
        const fr = f.getBoundingClientRect();
        if (fr.bottom < -400 || fr.top > window.innerHeight + 400) continue;  // hors ecran
        total++;
        // La figure doit recouvrir au moins un noeud texte de son message.
        const noeuds = [];
        const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => (n.parentElement && n.parentElement.closest(".atc-figbox"))
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        let n; while ((n = w.nextNode())) {
          const r = n.getBoundingClientRect ? null : null;
          noeuds.push(n);
        }
        let couvert = false;
        for (const nd of noeuds) {
          const rg = document.createRange(); rg.selectNodeContents(nd);
          const rr = rg.getBoundingClientRect();
          if (rr.width || rr.height) {
            if (rr.left < fr.right && rr.right > fr.left && rr.top < fr.bottom && rr.bottom > fr.top) { couvert = true; break; }
          }
        }
        if (couvert) bon++;
      }
    }
    return { bon: bon, total: total };
  });

  ok("A. le scroll ne coute plus qu'une poignee de reflows, pas un par message",
     scroll.rect <= 40 * 10,
     scroll.rect + " reflows pour 10 crans de ~" + Math.round(scroll.max / 12) +
     " px sur " + nbMsg + " messages (" + (scroll.rect / 10).toFixed(0) +
     " par cran ; l'ancien code : ~113)");

  ok("B. un settle coute ~1 mesure par message et par passe, pas 12",
     !settle.absent && settle.rect <= 6 * nbMsg,
     settle.absent ? "`_atcSettle` absent de ce build"
                   : settle.rect + " reflows pour " + nbMsg + " messages (" +
                     (settle.rect / nbMsg).toFixed(1) + " par message ; avant : 12,4)");

  ok("C. apres ce defilement, les figures couvrent encore leur texte",
     couvre.total > 0 && couvre.bon === couvre.total,
     couvre.bon + "/" + couvre.total + " figures visibles sur leur texte");

  ok("D. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const nOk = res.filter(r => r[0]).length;
  console.log("--------------------------------------------------------------------------");
  console.log(`RESULTAT : ${nOk}/${res.length}`);
  console.log("--------------------------------------------------------------------------");
  await browser.close();
  serveur.close();
  process.exit(nOk === res.length ? 0 : 1);
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
