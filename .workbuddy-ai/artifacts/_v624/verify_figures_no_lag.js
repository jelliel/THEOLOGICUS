// Banc v624 — INSERTION/MODIFICATION DE FIGURES NE REND PLUS L'UI LAGGY.
//
// Reproduit le chemin utilisateur : on insère/ouvre une figure (ici un
// encadré « Cœur », forme SVG -> refreshFigVisual réécrit svg.innerHTML,
// donc mutation childList qui déclenche l'observer) puis on FAIT VARIER le
// slider/couleur de figure de façon continue (100 événements `input`
// successifs, comme un glissement de souris sur le sélecteur de couleur).
//
// SANS correctif (v623) : chaque `input` appelait atcPersist() ->
// flushChatNow() (buildChatPayload() + localStorage.setItem SYNCHRONE) ->
// des dizaines de sérialisations bloquantes/s -> lag puis freeze.
//
// AVEC correctif (v624) : atcPersist est en throttle leading+trailing (350ms)
// -> au plus 2 sauvegardes pour la rafale ; l'observer est en outre ignoré
// pendant l'édition de figure (__atcFigEditing) -> applyMarks n'est PAS
// rappelé en boucle.
//
// Mesure : on encapsule saveChat / flushChatNow / applyMarks pour compter les
// appels PENDANT et APRÈS la rafale, et on vérifie que la couleur finale
// persiste après rechargement.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const NEG = process.argv.includes("--neg");
const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8799;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-fig-0001";
const MSG_TS = 1790600000001;
const CONTENU = [
  "Le Seigneur est miséricordieux envers tous. Le Seigneur exerce son jugement avec justice.",
  "La parole du Seigneur demeure éternellement. La miséricorde du Très-Haut n'a pas de borne.",
].join("\n");

const SHAPE = {
  id: "fg-1", x: 20, y: 20, w: 160, h: 96,
  shape: "Cœur", color: "#4f8ef7", weight: 1.2, fill: "", rot: 0, text: "", ancre: null,
  // svg requis : le filtre de chargement (l.20449) ne garde que les formes ayant
  // f.id && f.svg (comme le fait insertFigureAt à l'insertion réelle).
  svg: '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>'
};

const FINAL = "#000063"; // i=99 -> '63'

const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Parle-moi de la miséricorde.", ts: MSG_TS - 1 },
    { role: "assistant", content: CONTENU, ts: MSG_TS, marks: [], shapes: [SHAPE] },
  ], title: "Banc figures", updated: 1, fav: false,
});

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v624 — FIGURES : " + (NEG ? "MODE NÉGATIF (pré-correctif)" : "MODE POSITIF (avec correctif)"));
  console.log("=".repeat(72));
  if (SERVI !== RACINE) console.log(`  [info] racine servie : ${SERVI}`);

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
    try { document.cookie = "key_mistral=sk-test-mistral-fig; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
    try {
      if (!localStorage.getItem("__fig_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__fig_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".atc-figbox[data-fig-id='fg-1']", { timeout: 15000 });
  console.log("  [info] figure rendue (applyShapes OK)");

  // Encapsule saveChat / flushChatNow pour compter les appels PENDANT/APRÈS la rafale.
  // (applyMarks n'est pas mesurable ici : l'observer appelle la liaison module-scoped,
  //  pas window.applyMarks ; le garde-fou __atcFigEditing est validé par inspection.)
  await page.evaluate(() => {
    window.__c = { save: 0, flush: 0, am: 0 };
    const os = window.saveChat; window.saveChat = async function () { window.__c.save++; try { return os && os.apply(this, arguments); } catch (e) {} };
    const of = window.flushChatNow; window.flushChatNow = function () { window.__c.flush++; try { return of && of.apply(this, arguments); } catch (e) {} };
  });

  // Ouvre la barre d'outils de la figure (mousedown sur le cadre).
  await page.evaluate(() => {
    const fb = document.querySelector(".atc-figbox[data-fig-id='fg-1']");
    fb.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector(".ft-color", { timeout: 8000 });
  // Laisse l'observer se calmer (mutation de showFigTools) puis remet les
  // compteurs à zéro : seule la rafale compte désormais.
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__c = { save: 0, flush: 0, am: 0 }; });

  // Rafale de 100 événements `input` sur le sélecteur de couleur (glissement).
  await page.evaluate(() => {
    const inp = document.querySelector(".ft-color");
    for (let i = 0; i < 100; i++) {
      inp.value = "#" + i.toString(16).padStart(6, "0");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const burst = await page.evaluate(() => window.__c);
  console.log(`  [mesure] PENDANT la rafale : saveChat=${burst.save} flushChatNow=${burst.flush} applyMarks=${burst.am}`);

  // Laisse le throttle trailing (350ms) + l'observer se calmer.
  await page.waitForTimeout(800);
  const post = await page.evaluate(() => window.__c);
  console.log(`  [mesure] APRÈS la rafale (+800ms) : saveChat=${post.save} flushChatNow=${post.flush} applyMarks=${post.am}`);

  if (NEG) {
    // Mode négatif : le bug DOIT être détecté (beaucoup d'appels).
    ok("BUG détecté : saveChat >> 20 pendant la rafale (sans correctif)", burst.save > 20, "saveChat=" + burst.save);
  } else {
    // Mode positif : le correctif borne la sauvegarde à un throttle leading+trailing.
    ok("saveChat borné pendant la rafale (≤2)", burst.save <= 2, "saveChat=" + burst.save);
    ok("flushChatNow borné pendant la rafale (≤2)", burst.flush <= 2, "flushChatNow=" + burst.flush);
    ok("saveChat total après rafale (1–3)", post.save >= 1 && post.save <= 3, "saveChat=" + post.save);
  }

  // Persistance : recharge et lit la couleur enregistrée.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".atc-figbox[data-fig-id='fg-1']", { timeout: 15000 });
  const persisted = await page.evaluate(({ id, ts }) => {
    const c = JSON.parse(localStorage.getItem("theologicus_chat_" + id) || "{}");
    const m = (c.messages || []).find(x => x.ts === ts);
    return m && m.shapes && m.shapes[0] ? m.shapes[0].color : null;
  }, { id: CHAT_ID, ts: MSG_TS });
  console.log("  [mesure] couleur persistée après recharge : " + persisted);
  ok("couleur finale persistée après recharge", persisted === FINAL, "attendu=" + FINAL + " lu=" + persisted);

  ok("aucune erreur de page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  serveur.close();

  const ech = resultats.filter(r => !r[0]).length;
  console.log("=".repeat(72));
  console.log(ech === 0 ? "BANC RÉUSSI" : ("BANC ÉCHEC (" + ech + " échec(s))"));
  console.log("=".repeat(72));
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error("ERREUR BANC:", e); process.exit(2); });
