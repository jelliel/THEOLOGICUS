// Banc v126m — DÉRIVE : le cadre doit suivre le TEXTE ANNOTÉ, pas un offset périmé.
//
// Mécanisme visé (symptôme de la capture 2026-09-28 132735 : « les cadres
// colorés décalent pour aller sur d'autres mots ») :
//   Pour une annotation posée depuis la bulle « Add to chat »,
//   `window._atcSel` ne renseigne PAS `occ` (voir le code) : le placement
//   repose donc sur l'OFFSET `start/end`, qui a la PRIORITÉ sur la recherche
//   par texte. Dès que le rendu change entre la capture et la réapplication
//   (markdown réécrit, section ajoutée/retirée, réponse prolongée ou
//   régénérée), l'offset désigne une AUTRE portion de texte : le cadre se
//   pose sur un autre mot — et il y restait, l'ancien code réutilisant même
//   le span fautif tel quel au passage suivant.
//
// Ce banc construit ce désaccord par le CHEMIN RÉEL (sélection souris ->
// bulle -> annotation) : il capture l'offset d'un mot (« docétisme ») pour
// l'attribuer à un autre (« marcionisme ») — exactement ce que produit un
// rendu qui a bougé entre-temps.
//
// Attendu : le cadre porte le TEXTE ANNOTÉ. Contrôle négatif : servir une
// copie SANS le garde-fou (BENCH_ROOT) doit faire ÉCHOUER ce banc.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8797;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

const CHAT_ID = "chat-drift-0001";
const MSG_TS = 1790500000001;
const CONTENU = [
  "1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).",
  "2. Il **ne** justifie pas **son** exclusion du canon, **contrairement** à **Athanase** ou Épiphan**e**.",
].join("\n");
const SELECTION = "docétisme";      // ce que l'on sélectionne (=> offset capturé)
const TEXTE_ANNOTE = "marcionisme"; // ce que l'annotation déclare porter

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Tertullien a-t-il dit cela ?", ts: MSG_TS - 1 },
    { role: "assistant", content: CONTENU, ts: MSG_TS, annotations: [] },
  ], title: "Banc dérive", updated: 1, fav: false,
});

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v126m — LE CADRE SUIT LE TEXTE ANNOTÉ (offset périmé)");
  console.log("=".repeat(72));
  if (SERVI !== RACINE) console.log(`  [info] copie servie (contrôle négatif) : ${SERVI}`);

  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  /* Init : clé API factice, journal [DIAG] DÉMASQUÉ (l'app masque les lignes
     [DIAG] par défaut via `theo_debug` — voir le script v18-quiet-console),
     et graine de conversation écrite une seule fois (marqueur) pour que l'app
     la charge dès le premier passage. */
  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-mistral-drift; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () {
        try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {}
        return _cl.apply(null, arguments);
      };
    } catch (e) {}
    try {
      if (!localStorage.getItem("__bench_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__bench_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); });
  }
  async function lireCadre() {
    return page.evaluate((ts) => {
      const box = document.getElementById("mc-" + ts);
      if (!box) return null;
      const byId = new Map();
      box.querySelectorAll("[data-hl-id]").forEach(sp => byId.set(sp.dataset.hlId, (byId.get(sp.dataset.hlId) || "") + sp.textContent));
      return {
        groupes: Array.from(byId.entries()).map(([k, v]) => k + "=" + v.trim()),
        vide: Array.from(box.querySelectorAll("[data-hl-id]")).filter(sp => !(sp.textContent || "").trim()).length,
      };
    }, MSG_TS);
  }
  const diag = (pfx) => page.evaluate((p) => (window.__diagLog || []).filter(l => p.some(x => l.indexOf(x) !== -1)).slice(-8), pfx);

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const rendu = await page.evaluate((ts) => document.getElementById("mc-" + ts).textContent || "", MSG_TS);
    ok("le message de test est rendu", /docétisme/.test(rendu) && /marcionisme/.test(rendu));

    // ── 1. Sélection RÉELLE de « docétisme » -> la bulle s'ouvre ──
    await page.evaluate(({ ts, cible }) => {
      const box = document.getElementById("mc-" + ts);
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
      const nodes = []; let full = ""; let n;
      while ((n = walker.nextNode())) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
      const idx = full.indexOf(cible);
      let sc = null, so = 0, ec = null, eo = 0;
      for (const { node, start } of nodes) {
        const end = start + node.nodeValue.length;
        if (!sc && idx >= start && idx < end) { sc = node; so = idx - start; }
        if (!ec && (idx + cible.length) > start && (idx + cible.length) <= end) { ec = node; eo = (idx + cible.length) - start; }
      }
      const range = document.createRange();
      range.setStart(sc, so); range.setEnd(ec, eo);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      box.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    }, { ts: MSG_TS, cible: SELECTION });
    await page.waitForTimeout(500);
    const bulleOuverte = await page.evaluate(() => !!window._atcSel && !!document.querySelector("#atc-bubble .atc-main"));
    ok("la bulle « Add to chat » s'ouvre sur la sélection", bulleOuverte);

    // ── 2. Dérive : l'annotation déclare un AUTRE texte que l'offset capturé ──
    const derive = await page.evaluate((t) => {
      if (!window._atcSel) return null;
      const avant = window._atcSel.text;
      window._atcSel.text = t;
      return { avant, apres: window._atcSel.text };
    }, TEXTE_ANNOTE);
    ok(`l'annotation déclare « ${TEXTE_ANNOTE} » alors que l'offset est celui de « ${SELECTION} »`,
      !!derive && derive.avant === SELECTION && derive.apres === TEXTE_ANNOTE, JSON.stringify(derive));

    await page.evaluate(() => {
      const m = document.querySelector("#atc-bubble .atc-main");
      if (m) m.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(900);

    // ── 3. Re-rendu forcé (comme après un F5 / une réponse prolongée) ──
    await page.evaluate(() => { try { window.renderMessages(true); } catch (e) {} });
    await page.waitForTimeout(600);
    await page.evaluate(() => { try { window.__applyHighlights(); } catch (e) {} });
    await page.waitForTimeout(400);

    const cadre = await lireCadre();
    (await diag(["applyHighlights:", "onAddToChat:", "sanitizeChatMessages"])).forEach(l => console.log("  [diag] " + l.slice(0, 200)));
    ok("un cadre existe pour l'annotation", !!cadre && cadre.groupes.length > 0, JSON.stringify(cadre && cadre.groupes));
    const texte = cadre && cadre.groupes.length ? cadre.groupes[0].split("=").slice(1).join("=") : "";
    ok(`le cadre porte le TEXTE ANNOTÉ « ${TEXTE_ANNOTE} » (et non « ${SELECTION} »)`,
      texte === TEXTE_ANNOTE, `cadre = "${texte}"`);
    ok("aucun cadre vide résiduel", !!cadre && cadre.vide === 0, cadre ? "vides=" + cadre.vide : "n/a");
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
