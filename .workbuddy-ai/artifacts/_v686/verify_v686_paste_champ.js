/* v686 — APPUI LONG / « COLLER » SUR LES CHAMPS (Android WebView, Honor X8b).

   Bug : initDevtoolsProtection() appelait preventDefault() sur TOUS les
   `contextmenu` du document. Sur Android, l'appui long sur un <input> émet
   `contextmenu` : c'est lui qui affiche le menu natif « Coller ». Résultat :
   impossible de coller la clé API.

   Correctif : on laisse le menu NATIF sur input/textarea/select/[contenteditable],
   tout en gardant la protection DevTools sur le reste du document.

   Ce banc PROUVE les deux faces :
   - CONTRÔLE NÉGATIF (prémisse) : sur un élément de contenu quelconque, le
     contextmenu DOIT encore être annulé. Sans ça, le banc ÉCHOUE (il ne doit
     jamais passer à vide : la protection n'aurait pas été activée).
   - Sur #api-key-input, #wizard-api-key, un textarea et un contenteditable,
     le contextmenu ne doit PAS être annulé.
   - Le CSS ne doit plus mettre -webkit-touch-callout:none sur les champs.
*/
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9695);
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
    console.error("[ECHEC] application introuvable : " + APP);
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

  /* ACTIVE l'auth -> unlock() -> initDevtoolsProtection(). Sans ça le banc
     passerait à vide (aucun handler contextmenu). */
  await page.addInitScript(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try { sessionStorage.setItem("theologicus_auth", "true"); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
    { waitUntil: "domcontentloaded", timeout: 90000 });

  const attendreAppli = (ms) => page.waitForFunction(
    () => typeof window.sendMessage === "function",
    null, { timeout: ms }).then(() => true).catch(() => false);
  let appli = await attendreAppli(90000);
  if (!appli) {
    try { await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) {}
    appli = await attendreAppli(90000);
  }
  if (!appli) console.log("[DIAG] application non prête");
  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, r => r.abort());
  await pause(500);

  /* CONTRÔLE NÉGATIF — la protection DevTools est-elle bien ACTIVE ?
     Sur un div neutre, contextmenu doit être annulé. Si ce n'est pas le cas,
     le banc échoue : tous les tests suivants seraient des faux positifs. */
  const neutreAnnule = await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "v686-neutre";
    d.textContent = "contenu";
    document.body.appendChild(d);
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    d.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ok("P0 PRÉMISSE : protection DevTools active (contextmenu annulé hors champ)", neutreAnnule);
  if (!neutreAnnule) {
    console.log("[DIAG] protection non active — le banc ne peut pas conclure.");
    await browser.close(); serveur.close();
    console.log(`\n${ok_n} OK, ${ko_n} ECHEC`);
    process.exit(1);
  }

  /* Teste un sélecteur : true = menu NATIF conservé (defaultPrevented false). */
  const menuLibre = (page, sel) => page.evaluate((q) => {
    const el = document.querySelector(q);
    if (!el) return { absent: true, libre: false };
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return { absent: false, libre: !ev.defaultPrevented };
  }, sel);

  ok("C1 champ #api-key-input existe",
    await page.evaluate(() => !!document.getElementById("api-key-input")));
  const r1 = await menuLibre(page, "#api-key-input");
  ok("C1b appui long sur #api-key-input → « Coller » disponible (menu non annulé)",
    r1.libre, JSON.stringify(r1));

  /* Le champ du wizard (premier lancement) a le même problème. */
  const r2 = await menuLibre(page, "#wizard-api-key");
  ok("C2 #wizard-api-key → menu non annulé", r2.absent || r2.libre, JSON.stringify(r2));

  /* textarea + contenteditable génériques (couvre les futurs champs). */
  await page.evaluate(() => {
    const ta = document.createElement("textarea");
    ta.id = "v686-ta"; document.body.appendChild(ta);
    const ce = document.createElement("div");
    ce.id = "v686-ce"; ce.setAttribute("contenteditable", "true");
    ce.textContent = "zone editable"; document.body.appendChild(ce);
  });
  const r3 = await menuLibre(page, "#v686-ta");
  ok("C3 textarea → menu non annulé", r3.libre, JSON.stringify(r3));
  const r4 = await menuLibre(page, "#v686-ce");
  ok("C4 [contenteditable] → menu non annulé", r4.libre, JSON.stringify(r4));

  /* CSS : la règle fautive qui appliquait -webkit-touch-callout:none aux
     champs doit avoir DISPARU de la source. Test statique (Chromium desktop
     ne rapporte pas cette propriété en computed style : un test computed
     passerait à vide sur l'ancien build). */
  const htmlSrc = fs.readFileSync(APP, "utf8");
  const cssFautif = /button,\s*a,\s*input,\s*textarea,\s*select[^}]*\{[^}]*-webkit-touch-callout:\s*none/s.test(htmlSrc);
  ok("C5 le CSS ne met plus -webkit-touch-callout:none sur les champs",
    !cssFautif, "regle fautive presente=" + cssFautif);

  ok("C6 aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  serveur.close();
  console.log(`\n${ok_n} OK, ${ko_n} ECHEC`);
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error("[FATAL] " + (e && e.stack || e)); process.exit(1); });
