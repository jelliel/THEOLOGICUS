/* ═══════════════════════════════════════════════════════════════
   Banc v588 — EXPORT D'AGENTS : le fichier est RÉELLEMENT ÉCRIT.
   Symptôme utilisateur : « Fichier agent-Metaphysique.json — sur PC :
   dossier Téléchargements » … mais RIEN dans Téléchargements.
   Cause : la WebView (exe/APK) ne télécharge pas les blob URL — elle échoue
   SANS lever d'erreur, et l'ancien message l'affirmait quand même.
   Contrat vérifié ici :
   1. l'export écrit le fichier côté SERVEUR (/save-data) et le chemin annoncé
      est le VRAI chemin (le fichier existe sur disque, contenu conforme) ;
   2. l'info ne renvoie plus vers « Téléchargements » sur PC et nomme backups/ ;
   3. le bouton « 📂 Ouvrir le dossier » existe et l'endpoint /reveal-exports
      répond (mode « dry », SANS ouvrir de fenêtre sur la machine) ;
   4. sur natif (Android) avec serveur absent, on ne prétend PAS avoir
      téléchargé : on renvoie vers « Copier le JSON » ;
   5. le téléchargement navigateur reste tenté (bancs Playwright/vrai navigateur).
   Magasin isolé (v559). ════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os"), fs = require("fs");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}
const RACINE = path.resolve(__dirname, "..", "..", "..");

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v588_store_" + Date.now());
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

  /* capture des toasts pour vérifier ce qui est ANNONCÉ */
  await page.evaluate(() => {
    window.__toasts = [];
    const c = document.getElementById("toast-container");
    if (c) new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n && n.textContent) window.__toasts.push(n.textContent); }); });
    }).observe(c, { childList: true });
  });

  /* agent semé, nommé comme dans le rapport utilisateur */
  await page.evaluate(async () => {
    await db.put("agents", { id: "v588-meta", name: "Metaphysique", desc: "Métaphysique thomiste", instructions: "Méthode : partir de l'être." });
  });

  /* ── 1. export : le fichier est ÉCRIT ── */
  section("1. Export d’agent : le fichier existe sur disque (chemin réel annoncé)");
  await page.evaluate(() => window.exportAgent("v588-meta"));
  await page.waitForFunction(() => {
    const m = document.getElementById("v583-io-modal");
    return m && m.classList.contains("open");
  }, null, { timeout: 8000 });
  await page.evaluate(() => document.getElementById("v583-telech").click());
  await page.waitForFunction(() => {
    const i = document.getElementById("v583-info");
    return i && i.textContent.indexOf("Enregistré :") !== -1;
  }, null, { timeout: 15000 });
  const info = await page.evaluate(() => document.getElementById("v583-info").textContent);
  const m = info.match(/Enregistré\s*:\s*(.+)$/);
  const chemin = m ? m[1].trim() : "";
  ok("l’info annonce un CHEMIN d’enregistrement", !!chemin, chemin || info.slice(0, 120));
  ok("le chemin est bien dans le dossier « backups » de l’app",
     chemin.indexOf("backups") !== -1, chemin);
  ok("le chemin n’est PAS un dossier « Téléchargements »",
     !/T[eé]l[eé]chargements/i.test(chemin), chemin);
  const existe = chemin ? fs.existsSync(chemin) : false;
  ok("le fichier EXISTE réellement sur disque (le cœur du bug)", existe, chemin);
  let contenu = null;
  try { contenu = JSON.parse(fs.readFileSync(chemin, "utf8")); } catch (e) { contenu = null; }
  ok("le fichier est un JSON valide", !!contenu, contenu ? "ok" : "illisible");
  ok("il contient l’agent « Metaphysique » (et sa méthode)",
     !!contenu && contenu.name === "Metaphysique" && /être/.test(contenu.instructions || ""),
     contenu ? contenu.name : "(absent)");
  ok("le nom de fichier est agent-Metaphysique.json",
     path.basename(chemin) === "agent-Metaphysique.json", path.basename(chemin));
  ok("le fichier est sous la racine du projet (SERVE_DIR/backups)",
     path.resolve(chemin).indexOf(path.join(RACINE, "backups")) === 0,
     path.resolve(chemin));

  /* ── 2. le téléchargement navigateur est TOUJOURS tenté ── */
  section("2. Le téléchargement navigateur reste tenté (vrai navigateur)");
  const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  await page.evaluate(() => document.getElementById("v583-telech").click());
  const telecharge = await dl;
  ok("un événement « download » est bien déclenché", !!telecharge,
     telecharge ? telecharge.suggestedFilename() : "aucun");

  /* ── 3. bouton dossier + endpoint (mode dry, sans ouvrir de fenêtre) ── */
  section("3. « 📂 Ouvrir le dossier » : bouton présent, endpoint fonctionnel");
  const b3 = await page.evaluate(() => !!document.getElementById("v583-dossier"));
  ok("le bouton « Ouvrir le dossier » est dans la fenêtre", b3 === true);
  const rep = await page.evaluate(async () => {
    try {
      const r = await fetch("/reveal-exports?dry=1", { method: "POST" });
      const j = await r.json();
      return { status: r.status, j: j };
    } catch (e) { return { status: 0, j: null, err: String(e) }; }
  });
  ok("l’endpoint /reveal-exports répond en JSON", rep.status === 200 && !!rep.j, JSON.stringify(rep).slice(0, 140));
  ok("il renvoie le dossier des exports", !!rep.j && /backups$/.test(String(rep.j.dossier || "")),
     rep.j ? rep.j.dossier : "");
  ok("le mode « dry » n’ouvre PAS de fenêtre (ouvert=false)",
     !!rep.j && rep.j.ouvert === false, rep.j ? String(rep.j.ouvert) : "");

  /* ── 4. natif sans serveur : AUCUNE promesse de téléchargement ── */
  section("4. Android (natif) sans serveur : on ne prétend pas avoir téléchargé");
  const msg = await page.evaluate(async () => {
    window.Capacitor = { isNativePlatform: function () { return true; } };
    const vrai = window.fetch;
    window.fetch = async function (u) {
      if (String(u).indexOf("/save-data") !== -1) throw new Error("pas de serveur local sur natif");
      return vrai.apply(this, arguments);
    };
    window.__toasts = [];
    document.getElementById("v583-telech").click();
    await new Promise(r => setTimeout(r, 900));
    window.fetch = vrai;
    return window.__toasts.slice(-3);
  });
  const dernier = msg.length ? msg[msg.length - 1] : "";
  ok("le message renvoie vers « Copier le JSON »", /Copier le JSON/.test(dernier), dernier.slice(0, 110));
  ok("il ne prétend PAS « dossier Téléchargements »", !/T[eé]l[eé]chargements/.test(dernier), dernier.slice(0, 110));

  /* ── 5. propreté ── */
  section("5. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
