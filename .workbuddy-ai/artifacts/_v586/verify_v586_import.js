/* ═══════════════════════════════════════════════════════════════
   Banc v586 — IMPORT de compagnons OpenPets
   Paquets fabriques par fabriquer_paquet_test.py :
     cygne.zip  (valide, WebP 1536x2288)   faux.zip (1024x1024)
     hostile.zip (SVG avec script)         simple.zip (SVG conforme)
   Contrat : import valide → stocke + selectionnable + anime avec la
   geometrie OpenPets (11 rangees) ; paquets invalides REFUSES avec
   un message clair, rien en base ; survit au rechargement. ══════════ */
const H = require("../../../tools/bench_common.js");
const { chromium } = require("playwright");
const path = require("path"), os = require("os");
const P = path.join(__dirname, "paquets") + "/";   /* chemin relatif : valable en CI */
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}
(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v586_store_" + Date.now());
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = "http://127.0.0.1:" + port + "/THEOLOGICUS.html";
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    window.__toasts = [];
    if (typeof window.toast === "function") {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
  });

  /* ── 1. interface d import montee ── */
  section("1. Ligne d import presente dans les reglages des compagnons");
  const e1 = await page.evaluate(() => ({
    btn: !!document.getElementById("v586-import-btn"),
    inp: !!document.getElementById("v586-import-input"),
    api: !!(window.__v586Import && window.__v586Import.traiterFichiers)
  }));
  ok("bouton + champ de fichier montes", e1.btn && e1.inp, JSON.stringify(e1));
  ok("API d import exposee", e1.api === true);

  /* ── 2. import du paquet VALIDE ── */
  section("2. Paquet valide (cygne.zip) : accepte, stocke, selectionnable");
  await page.setInputFiles("#v586-import-input", P + "cygne.zip");
  await page.waitForFunction(() => (window.__toasts || []).some(t => t.indexOf("Compagnon importe") !== -1) || (window.__toasts || []).some(t => t.indexOf("refuse") !== -1), null, { timeout: 15000 });
  const e2 = await page.evaluate(async () => {
    const tous = await db.getAll("app_config");
    const rec = (tous || []).find(x => x && x.id === "pet::cygne");
    const sel = document.getElementById("v584-pet-sel");
    const opt = sel ? Array.prototype.slice.call(sel.options).find(o => o.value === "ext:cygne") : null;
    return {
      toast: (window.__toasts || []).slice(-1)[0] || "",
      stocke: !!rec,
      nom: rec ? rec.nom : null,
      dataUrl: rec ? String(rec.spritesheet).slice(0, 24) : null,
      option: !!opt,
      libelle: opt ? opt.textContent : null
    };
  });
  ok("toast de succes", /Compagnon importe/.test(e2.toast), e2.toast);
  ok("enregistre dans la base (pet::cygne)", e2.stocke && e2.nom === "Cygne de Test", JSON.stringify({ s: e2.stocke, n: e2.nom }));
  ok("spritesheet stocke en data URL WebP", /^data:image\/webp;base64,/.test(e2.dataUrl || ""), e2.dataUrl);
  ok("ajoute au selecteur des mascottes (📦)", e2.option && /Cygne de Test/.test(e2.libelle || ""), e2.libelle);

  /* ── 3. le compagnon importe s anime avec la geometrie OpenPets ── */
  section("3. Compagnon importe : affiche et anime (grille 8x11)");
  await page.evaluate(() => { document.getElementById("v584-on").click(); });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    await db.put("agents", { id: "v586-agt", name: "Agent Test", desc: "Import" });
    await window.activateAgent("v586-agt");
  });
  await page.waitForFunction(() => window.__v584Pets.etat().visible, null, { timeout: 8000 });
  await page.evaluate(() => {
    const s = document.getElementById("v584-pet-sel");
    s.value = "ext:cygne";
    s.dispatchEvent(new Event("change"));
  });
  await page.waitForFunction(() => { const h = document.getElementById("v584-pet"); return h && h.getAttribute("data-pet") === "ext:cygne"; }, null, { timeout: 8000 });
  await page.waitForFunction(() => { const h = document.getElementById("v584-pet"); return h && h.getAttribute("data-pet") === "ext:cygne" && h.getAttribute("data-anim") === "idle"; }, null, { timeout: 8000 });
  const e3 = await page.evaluate(() => {
    const h = document.getElementById("v584-pet");
    const b = h.querySelector(".v584-bob");
    const st = document.getElementById("v584-style").textContent;
    const bg = getComputedStyle(b).backgroundImage;
    return {
      pet: h.getAttribute("data-pet"),
      fond: bg.slice(0, 30),
      anim: getComputedStyle(b).animationName,
      kf11: st.indexOf("@keyframes v584-idle-ext_cygne") !== -1,
      ligneThinking: (function () { var i = st.indexOf("@keyframes v584-thinking-ext_cygne{"); if (i === -1) return false; var m = /background-position:([-\d.]+)px ([-\d.]+)px/.exec(st.slice(i, i + 200)); return !!m && Math.abs(parseFloat(m[2]) + 660.5) < 1; })()
    };
  });
  ok("compagnon importe affiche (ext:cygne)", e3.pet === "ext:cygne", e3.pet);
  ok("son spritesheet importe est utilise", /data:image\/webp/.test(e3.fond || ""), e3.fond);
  ok("animation propre (keyframes v584-idle-ext_cygne)", e3.kf11 && e3.anim === "v584-idle-ext_cygne", JSON.stringify({ k: e3.kf11, a: e3.anim }));
  ok("geometrie OpenPets respectee (thinking = ligne 8, y = -660.5 px)", e3.ligneThinking === true);

  /* ── 4. paquets invalides refuses ── */
  section("4. Paquets invalides : refus argumente, rien en base");
  await page.evaluate(() => { window.__toasts.length = 0; });
  await page.setInputFiles("#v586-import-input", P + "faux.zip");
  await page.waitForFunction(() => (window.__toasts || []).some(t => t.indexOf("refuse") !== -1), null, { timeout: 15000 });
  const e4 = await page.evaluate(async () => {
    const tous = await db.getAll("app_config");
    return { toast: (window.__toasts || []).slice(-1)[0] || "", enBase: (tous || []).some(x => x && x.id === "pet::faux") };
  });
  ok("mauvaises dimensions refusees avec la raison", /dimensions attendues 1536x|dimensions illisibles/.test(e4.toast), e4.toast.slice(0, 90));
  ok("aucun enregistrement cree", e4.enBase === false);
  await page.evaluate(() => { window.__toasts.length = 0; });
  await page.setInputFiles("#v586-import-input", P + "hostile.zip");
  await page.waitForFunction(() => (window.__toasts || []).some(t => t.indexOf("refuse") !== -1), null, { timeout: 15000 });
  const e5 = await page.evaluate(async () => {
    const tous = await db.getAll("app_config");
    return { toast: (window.__toasts || []).slice(-1)[0] || "", enBase: (tous || []).some(x => x && x.id === "pet::hostile") };
  });
  ok("SVG hostile (script) refuse", /contenu actif interdit/.test(e5.toast), e5.toast.slice(0, 90));
  ok("aucun enregistrement cree (hostile)", e5.enBase === false);

  /* ── 5. SVG conforme accepte ── */
  section("5. SVG conforme (simple.zip) : accepte");
  await page.evaluate(() => { window.__toasts.length = 0; });
  await page.setInputFiles("#v586-import-input", P + "simple.zip");
  await page.waitForFunction(() => (window.__toasts || []).some(t => t.indexOf("Compagnon importe") !== -1), null, { timeout: 15000 });
  const e6 = await page.evaluate(async () => {
    const tous = await db.getAll("app_config");
    const rec = (tous || []).find(x => x && x.id === "pet::simple");
    return { ok: !!rec, url: rec ? String(rec.spritesheet).slice(0, 26) : "", version: rec ? rec.version : null };
  });
  ok("paquet SVG conforme accepte et stocke", e6.ok === true);
  ok("stocke en data URL SVG", /^data:image\/svg\+xml/.test(e6.url || ""), e6.url);

  /* ── 6. persistance apres rechargement ── */
  section("6. Rechargement : les compagnons importes reviennent");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  const e7 = await page.evaluate(() => {
    const sel = document.getElementById("v584-pet-sel");
    const opts = sel ? Array.prototype.slice.call(sel.options).map(o => o.value) : [];
    return { cygne: opts.indexOf("ext:cygne") !== -1, simple: opts.indexOf("ext:simple") !== -1, atlas: Object.keys(window.__v585Atlas || {}).filter(k => k.indexOf("ext:") === 0).length };
  });
  ok("cygne toujours selectionnable apres rechargement", e7.cygne === true, JSON.stringify(e7));
  ok("simple toujours selectionnable apres rechargement", e7.simple === true);
  ok("les 2 atlas importes sont en memoire", e7.atlas === 2, "n=" + e7.atlas);

  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 2).join(" | "));
  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
