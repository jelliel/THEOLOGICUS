// Banc v623b — RÉCUPÉRATION DE DÉRIVE : un offset périmé doit être corrigé
// pour respecter le TEXTE surligné (exigence utilisateur).
//
// On amorce un chat dont le message porte DÉJÀ une marque avec :
//   - text: "jugement" (ce que l'utilisateur a surligné)
//   - start/end: un offset PÉRIMÉ qui pointe en fait sur "miséricordieux"
// Le code actuel (applyMarks sans garde-fou) enveloppe l'offset périmé ->
// la marque atterrit sur "miséricordieux" (DÉRIVE). Le correctif (gardien
// d'alignement) doit détecter le désaccord et ré-ancrer sur "jugement".
//
// Contrôle négatif : sans le correctif (BENCH_ROOT pointant sur la copie
// non corrigée) le banc ÉCHOUSE.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8799;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-mk-drift";
const MSG_TS = 1790500000999;
const CONTENU = "Le Seigneur est miséricordieux envers tous. Le Seigneur exerce son jugement avec justice.";

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

// Offset périmé : on pointe sur "miséricordieux" (occurrence 1 dans le texte
// concaténé) alors que le texte déclaré est "jugement" (occurrence suivante).
// start/end calculés pour "miséricordieux" :
const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Parle-moi de la miséricorde.", ts: MSG_TS - 1 },
    { role: "assistant", content: CONTENU, ts: MSG_TS, marks: [
      { id: "mk-drift-1", text: "jugement", color: "yellow", start: 11, end: 21 }
    ] },
  ], title: "Banc dérive marque", updated: 1, fav: false,
});

async function attendreApp(page) {
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); });
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v623b — RÉCUPÉRATION DE DÉRIVE DE MARQUE (offset périmé)");
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

  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-drift; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try {
      if (!localStorage.getItem("__mkd_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__mkd_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp(page);
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(1200);

    const texte = await page.evaluate((ts) => {
      const mks = document.getElementById("mc-" + ts).querySelectorAll("[data-mark-id]");
      return Array.from(mks).map(m => m.textContent.replace(/\s+/g, ' ').trim());
    }, MSG_TS);
    ok("la marque est sur le TEXTE DÉCLARÉ « jugement » (pas l'offset périmé)",
      texte.length === 1 && texte[0] === "jugement", "texte(s)=" + JSON.stringify(texte));
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
