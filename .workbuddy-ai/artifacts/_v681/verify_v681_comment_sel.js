/* v681 — SÉLECTION DANS UN COMMENTAIRE AFFICHÉ (#atc-tip) → barre flottante.
   Demande utilisateur : « dans un commentaire, quand je sélectionne un mot ou
   une phrase, je veux que le tooltip Add to chat (avec ses options) s'affiche
   comme dans une conversation normale ».

   On vérifie :
   1. le module v678 (barre) est présent ;
   2. un commentaire affiché (#atc-tip) porte data-msg-ts (msgTs source) ;
   3. sélectionner du texte DANS le commentaire fait apparaître #sel-toolbar ;
   4. NÉGATIF : sélectionner hors message et hors commentaire → PAS de barre ;
   5. aucune erreur JS pendant le scénario.

   ⚠ Ne doit pas passer à vide : si le commentaire ne s'affiche pas (C1), le
   banc ÉCHOUE (prémisse manquante), il ne saute pas le test.
*/
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9694);

function trouverRacine() {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, "THEOLOGICUS.html"))) return d;
    d = path.dirname(d);
  }
  return path.resolve(process.env.BENCH_ROOT || process.cwd());
}
const RACINE = path.resolve(process.env.BENCH_ROOT || trouverRacine());
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]    " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + (detail ? "  -- " + detail : "")); }
}
const pause = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const APP = path.join(RACINE, "THEOLOGICUS.html");
  if (!fs.existsSync(APP)) {
    console.error("[ECHEC] application introuvable : " + APP + " (racine=" + RACINE + ")");
    process.exit(1);
  }

  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign(
    { args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });

  const attendreAppli = (ms) => page.waitForFunction(
    () => typeof window.__v678SelToolbar === "object" && typeof window.sendMessage === "function",
    null, { timeout: ms }).then(() => true).catch(() => false);

  let appli = await attendreAppli(90000);
  if (!appli) {
    console.log("[DIAG] application non prête après 90 s — rechargement unique…");
    try { await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) {}
    appli = await attendreAppli(90000);
  }
  if (!appli) {
    const d = await page.evaluate(() => ({
      v678: typeof window.__v678SelToolbar,
      send: typeof window.sendMessage,
      modules: document.querySelectorAll("script[id]").length
    })).catch(e => ({ erreur: String(e.message) }));
    console.log("[DIAG] " + JSON.stringify(d));
  }

  /* Couper le réseau : aucun appel modèle/MCP pendant le banc */
  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, route => route.abort());
  await page.route("**/faux-llm", async (route) => {
    route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" },
      body: 'data: {"choices":[{"delta":{"content":"Reponse."}}]}\n\ndata: [DONE]\n\n' });
  });

  /* M1 — module v678 présent */
  ok("M1 module __v678SelToolbar exposé",
    await page.evaluate(() => typeof window.__v678SelToolbar === "object"));

  /* Préparer un message + une annotation (commentaire) dont le texte est
     présent dans le contenu du message, pour que __applyHighlights le wrappe
     dans un .atc-hl[data-hl-id]. */
  await page.evaluate(() => {
    if (typeof state !== "undefined" && state.messages) {
      state.messages.push({
        role: "assistant",
        content: "Voici un passage : la grace divine illumine le coeur de l homme et la foi est le fondement de toute esperance.",
        ts: Date.now(),
        annotations: [{ id: "ann-v681", text: "grace divine", a: "Commentaire de test sur la grace divine.", loading: false, error: null }],
        marks: [], shapes: []
      });
      if (typeof renderMessages === "function") renderMessages();
    }
  });
  await pause(700);
  await page.evaluate(() => { try { window.__applyHighlights && window.__applyHighlights(); } catch (e) {} });
  await pause(400);

  /* C1 — le commentaire (marque .atc-hl) est rendu. Sans lui, le banc ÉCHOUE
     (prémisse manquante), il ne passe pas à vide. */
  const markPresent = await page.evaluate(() => !!document.querySelector(".atc-hl[data-hl-id]"));
  ok("C1 marque d'annotation .atc-hl rendue", markPresent);
  if (!markPresent) {
    console.log("[DIAG] pas de .atc-hl : le scénario v681 ne peut pas être testé.");
    await browser.close(); serveur.close();
    console.log(`\n${ok_n} OK, ${ko_n} ECHEC`);
    process.exit(ko_n ? 1 : 0);
  }

  /* Ouvrir le commentaire : mouseover sur la marque (déclencheur bureau). */
  await page.evaluate(() => {
    const hl = document.querySelector(".atc-hl[data-hl-id]");
    hl.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
  });
  await pause(400);

  const tipInfo = await page.evaluate(() => {
    const t = document.getElementById("atc-tip");
    return t ? { present: true, msgTs: t.dataset.msgTs || null, hasBody: !!t.querySelector(".atc-tip-a") } : { present: false };
  });
  ok("C2 commentaire affiché (#atc-tip) présent", tipInfo.present, JSON.stringify(tipInfo));
  ok("C3 #atc-tip porte data-msg-ts (source)", !!(tipInfo.msgTs && String(tipInfo.msgTs).length), "msgTs=" + tipInfo.msgTs);

  /* Sélectionner du texte DANS le commentaire, puis mouseup (comme un vrai
     glisser de souris) : la barre v678 doit apparaître. */
  await page.evaluate(() => {
    const body = document.querySelector("#atc-tip .atc-tip-a");
    if (!body) return;
    const r = document.createRange();
    r.selectNodeContents(body);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await pause(800);

  const barVisible = await page.evaluate(() => {
    const b = document.getElementById("sel-toolbar");
    if (!b) return false;
    const st = getComputedStyle(b);
    return st.display !== "none" && b.offsetWidth > 0 && b.offsetHeight > 0;
  });
  ok("C4 sélection DANS le commentaire → barre #sel-toolbar visible", barVisible);

  /* C5 — NÉGATIF : sélection hors message et hors [data-msg-ts] → PAS de barre. */
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.id = "v681-plain";
    p.textContent = "Texte libre hors message pour le controle negatif du banc.";
    document.body.appendChild(p);
    const r = document.createRange();
    r.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await pause(800);
  const barVisible2 = await page.evaluate(() => {
    const b = document.getElementById("sel-toolbar");
    if (!b) return false;
    const st = getComputedStyle(b);
    return st.display !== "none" && b.offsetWidth > 0 && b.offsetHeight > 0;
  });
  ok("C5 hors message/commentaire → pas de barre (négatif)", !barVisible2);

  /* C6 — aucune erreur JS */
  ok("C6 aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  serveur.close();
  console.log(`\n${ok_n} OK, ${ko_n} ECHEC`);
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error("[FATAL] " + (e && e.stack || e)); process.exit(1); });
