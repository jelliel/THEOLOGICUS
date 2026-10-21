// Banc v630 — STATUT RÉSOLU sur les commentaires d'encadrés.
// Seed : figure avec note. Clic badge 💬 -> panneau -> « ✓ Résolu » ->
// badge ✓ + classe note-resolu + title [Résolu] ; persisté après reload ;
// « ↺ Rouvrir » remet le badge 💬 ; 0 erreur JS.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8813;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-res-0001";
const MSG_TS = 1790500001444;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Un encadré commenté.", ts: MSG_TS - 1 },
    {
      role: "assistant", content: "Voici un encadré avec un commentaire.", ts: MSG_TS, marks: [], shapes: [
        { id: "fg-1", x: 30, y: 30, w: 170, h: 100, shape: "Cœur", color: "#4f8ef7", weight: 1.2, fill: "", rot: 0, text: "", ancre: null, svg: SHAPE_SVG, note: "Question sur ce passage : que signifie la miséricorde ici ?", noteTs: 1790500001400 }
      ]
    }
  ], title: "Banc resolu", updated: 1, fav: false,
});

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v630 — COMMENTAIRE RÉSOLU (badge + persistance)");
  console.log("=".repeat(72));
  if (SERVI !== RACINE) console.log(`  [info] copie servie (contrôle négatif) : ${SERVI}`);

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
  page.on("pageerror", e => erreurs.push(String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)));

  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-res; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
    try {
      if (!localStorage.getItem("__res_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__res_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
    });
  }
  // showWizard(2) est rappelé ~500 ms après l'init si aiConfig absent, sans
  // vérifier wizard_skipped. On retire la classe 'active' (jamais le nœud :
  // showWizard n'a pas de garde null, et retirer le nœud crée une course avec
  // initWizardEvents).
  async function desarmeWizard() {
    await page.evaluate(() => {
      const w = document.getElementById("setup-wizard-overlay");
      if (w) w.classList.remove("active");
    });
  }
  const badge = () => page.evaluate(() => {
    const b = document.querySelector('.atc-figbox[data-fig-id="fg-1"] .fb-note');
    if (!b) return null;
    return { txt: b.textContent, cls: b.className, title: (b.title || "").slice(0, 20) };
  });
  const noteResoluStocke = () => page.evaluate(() => {
    try {
      const c = JSON.parse(localStorage.getItem("theologicus_chat_" + "chat-res-0001"));
      const m = c.messages.find(x => x.ts === 1790500001444);
      const s = m && m.shapes && m.shapes.find(x => x.id === "fg-1");
      return s ? (s.noteResolu === true ? true : (s.noteResolu === undefined ? false : "autre")) : "pas-shape";
    } catch (e) { return "err"; }
  });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForFunction(() => !!document.querySelector('.atc-figbox[data-fig-id="fg-1"]'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    await desarmeWizard();

    // état initial : badge 💬, pas résolu
    const b0 = await badge();
    ok("badge 💬 initial (note seedée)", !!b0 && b0.txt === "💬", JSON.stringify(b0));
    const r0 = await noteResoluStocke();
    ok("noteResolu non défini au départ", r0 === false, "noteResolu=" + r0);

    // clic badge -> panneau
    await desarmeWizard();
    await page.click('.atc-figbox[data-fig-id="fg-1"] .fb-note');
    await page.waitForSelector("#atc-fig-note", { timeout: 5000 });
    const resBtnTxt = await page.evaluate(() => {
      const b = document.querySelector("#atc-fig-note [data-res]");
      return b ? b.textContent : null;
    });
    ok("panneau ouvert, bouton « ✓ Résolu » présent", resBtnTxt === "✓ Résolu", "data-res=" + resBtnTxt);

    // marquer résolu
    await page.click("#atc-fig-note [data-res]");
    await page.waitForTimeout(250);
    const b1 = await badge();
    ok("badge devient ✓ + classe note-resolu + title [Résolu]", !!b1 && b1.txt === "✓" && b1.cls.indexOf("note-resolu") !== -1 && b1.title.indexOf("[Résolu]") === 0, JSON.stringify(b1));
    // laisser le save se terminer (throttle 350 ms + IndexedDB)
    await page.waitForTimeout(1300);
    const r1 = await noteResoluStocke();
    ok("noteResolu=true persisté", r1 === true, "noteResolu=" + r1);

    // reload -> badge ✓ persisté
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction(() => !!document.querySelector('.atc-figbox[data-fig-id="fg-1"]'), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(700);
    await desarmeWizard();
    const b2 = await badge();
    ok("après reload : badge ✓ conservé", !!b2 && b2.txt === "✓" && b2.cls.indexOf("note-resolu") !== -1, JSON.stringify(b2));

    // rouvrir
    await desarmeWizard();
    await page.click('.atc-figbox[data-fig-id="fg-1"] .fb-note');
    await page.waitForSelector("#atc-fig-note", { timeout: 5000 });
    const resBtnTxt2 = await page.evaluate(() => {
      const b = document.querySelector("#atc-fig-note [data-res]");
      return b ? b.textContent : null;
    });
    ok("panneau réouvert : bouton « ↺ Rouvrir »", resBtnTxt2 === "↺ Rouvrir", "data-res=" + resBtnTxt2);
    await page.click("#atc-fig-note [data-res]");
    await page.waitForTimeout(250);
    const b3 = await badge();
    ok("badge redevient 💬 (rouvert)", !!b3 && b3.txt === "💬" && b3.cls.indexOf("note-resolu") === -1, JSON.stringify(b3));
    await page.waitForTimeout(1300);
    const r3 = await noteResoluStocke();
    ok("noteResolu retiré après réouverture", r3 === false, "noteResolu=" + r3);

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
