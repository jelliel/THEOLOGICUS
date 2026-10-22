// Banc v628 — LAZY-APPLY : les surlignages HORS viewport ne sont plus traités
// à chaque mutation ; ils le sont quand le message ENTRE dans le viewport.
//
// Protocole DÉTERMINISTE (indépendant du scroll initial de l'app) :
//   1. conversation LONGUE (21 paires) ; « alpha » dans le 1er message (haut),
//      « oméga » dans le dernier (bas).
//   2. scroll EN BAS -> mB (visible) appliquée.
//   3. on RETIRE mA du DOM (elle a pu être posée par l'apply initial si l'app
//      était en haut) puis on attend : hors viewport, elle NE REVIENNT PAS.
//   4. scroll vers le HAUT -> mA REVIENNT (le message est entré dans le viewport).
// Contrôle négatif (BENCH_ROOT = backup pre-v628) : à l'étape 3 la marque
// REVIENNT (l'ancien code traite TOUT l'historique) -> le banc échoue, il
// détecte bien la différence.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8809;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-lazy-0001";
const N_PAIRS = 21;
const BASE_TS = 1790500001000;
const LONG = "Voici une réponse détaillée pour remplir la conversation. Elle couvre plusieurs lignes de texte afin que chaque message occupe une hauteur réelle dans le fil. Cela permet de dépasser la hauteur du viewport avec un nombre raisonnable de messages.";

const messages = [];
for (let i = 0; i < N_PAIRS; i++) {
  messages.push({ role: "user", content: "Question numéro " + (i + 1) + " ?", ts: BASE_TS + i * 2 });
  if (i === 0) {
    messages.push({ role: "assistant", content: "Le mot alpha ouvre cette longue conversation. " + LONG, ts: BASE_TS + i * 2 + 1, marks: [{ id: "mA", text: "alpha", color: "yellow" }] });
  } else if (i === N_PAIRS - 1) {
    messages.push({ role: "assistant", content: "Le mot oméga clôt cette conversation. " + LONG, ts: BASE_TS + i * 2 + 1, marks: [{ id: "mB", text: "oméga", color: "green" }] });
  } else {
    messages.push({ role: "assistant", content: "Réponse " + (i + 1) + ". " + LONG, ts: BASE_TS + i * 2 + 1, marks: [] });
  }
}
const TS_TOP = BASE_TS + 1;           // 1er assistant
const TS_BOTTOM = BASE_TS + (N_PAIRS - 1) * 2 + 1;
const CORPS = JSON.stringify({ id: CHAT_ID, model: "mistral", messages: messages, title: "Banc lazy", updated: 1, fav: false });

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  const negatif = !!process.env.BENCH_ROOT;
  console.log("=".repeat(72));
  console.log("BANC v628 — LAZY-APPLY PAR VIEWPORT" + (negatif ? "  [CONTRÔLE NÉGATIF sur pre-v628]" : ""));
  console.log("=".repeat(72));
  if (negatif) console.log(`  [info] copie servie : ${SERVI}`);

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

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }, process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-lazy; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
    try {
      if (!localStorage.getItem("__lazy_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__lazy_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      /* v629/v631 — NE PAS retirer setup-wizard-overlay : une course avec
         initWizardEvents (DOMContentLoaded) coupe l'init -> chat jamais rendu
         (flaky CI constate). Desarmement EN BOUCLE : la classe "active" saute
         sous 300 ms, les retries Playwright passent, le noeud reste en place. */
      window.__disarmTimer = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay");
        if (w) w.classList.remove("active");
      }, 300);
    });
  }
  const inDom = (id) => page.evaluate((mid) => !!document.querySelector('[data-mark-id="' + mid + '"]'), id);
  function unwrapMark(id){
    return page.evaluate((mid) => {
      document.querySelectorAll('[data-mark-id="' + mid + '"]').forEach(function(sp){
        const p = sp.parentNode; if (!p) return;
        while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
        p.removeChild(sp); p.normalize();
      });
    }, id);
  }

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), TS_BOTTOM, { timeout: 60000 });
    await page.waitForTimeout(700);

    // 2. scroll en bas -> mB appliquée (message visible)
    await page.evaluate((ts) => { const el = document.getElementById("mc-" + ts); if (el) el.scrollIntoView({ block: "end" }); }, TS_BOTTOM);
    await page.waitForTimeout(900);
    const mB = await inDom("mB");
    ok("message visible (bas) : surlignage appliqué", mB, "mB in DOM=" + mB);

    // 3. retirer mA du DOM, attendre : hors viewport elle NE REVIENNT PAS
    await unwrapMark("mA");
    await page.waitForTimeout(1200);
    const mA1 = await inDom("mA");
    ok("hors viewport : la marque retirée NE revient PAS (lazy)", !mA1, "mA in DOM=" + mA1);

    // 4. scroll vers le HAUT -> mA revient
    await page.evaluate((ts) => { const el = document.getElementById("mc-" + ts); if (el) el.scrollIntoView({ block: "center" }); }, TS_TOP);
    await page.waitForTimeout(1200);
    const mA2 = await inDom("mA");
    ok("entré dans le viewport : la marque REvient (au scroll)", mA2, "mA in DOM=" + mA2);

    ok("aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("banc exécuté sans exception", false, String((e && e.message) || e));
  } finally {
    await browser.close();
    serveur.close();
  }

  const reussis = resultats.filter(r => r[0]).length;
  console.log("-".repeat(72));
  console.log(`RESULTAT : ${reussis}/${resultats.length}`);
  console.log("-".repeat(72));
  process.exit(reussis === resultats.length ? 0 : 1);
})();
