/* ═══════════════════════════════════════════════════════════════
   Banc v589 — EXPORT DES AGENTS EN MARKDOWN (.md)
   Demande : « donne moi aussi de pouvoir exporter les Agents en .md ».
   Contrat vérifié :
   1. un bouton 📄 par agent, et l'export écrit un VRAI fichier .md dans
      backups/ (on lit le DISQUE, pas un téléchargement simulé) ;
   2. le document est du Markdown structuré : titre, métadonnées, sections
      Instructions / Amorces / Termes interdits ;
   3. un nom d'agent hostile ( : / * ? ) donne un nom de fichier assaini ;
   4. « EXPORTER TOUT (.MD) » produit UN document avec sommaire et une
      section par agent ;
   5. le panneau des 20 agents théologiques 🎓 a son bouton .md ;
   6. le .md dit lui-même qu'il n'est PAS réimportable (pas d'attente fausse) ;
   7. le JSON continue de fonctionner (non-régression : agent-<nom>.json).
   NB : `#v583-info` n'est rempli QUE par le clic sur « 💾 Enregistrer le
   fichier » — les fonctions d'export, elles, ANNONCENT par un toast. Le banc
   lit donc les toasts (ce que l'utilisateur voit) et le DISQUE (ce qui existe).
   Magasin isolé (v559). ═══════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os"), fs = require("fs");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}
const RACINE = path.resolve(__dirname, "..", "..", "..");
/* le toast d'export TOUT se termine par « (N agents) » : ne pas l'avaler dans
   le chemin (première version du banc : `fs.existsSync` faux à cause de ça). */
const cheminDe = t => {
  const m = String(t).match(/Enregistré\s*:\s*(.+?)(?:\s*\(\d+\s*agents?\))?\s*$/);
  return m ? m[1].trim() : "";
};
const viderToasts = p => p.evaluate(() => { window.__toasts = []; });

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v589_store_" + Date.now());
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

  /* capture des toasts (c'est par là que les exports ANNONCENT) */
  await page.evaluate(() => {
    window.__toasts = [];
    const c = document.getElementById("toast-container");
    if (c) new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n && n.textContent) window.__toasts.push(n.textContent); }); });
    }).observe(c, { childList: true });
  });
  async function attendreToast(motif, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 15000)) {
      const t = await page.evaluate(() => (window.__toasts || []).slice(-8));
      const hit = t.filter(x => motif.test(x));
      if (hit.length) return hit[hit.length - 1];
      await page.waitForTimeout(200);
    }
    return "";
  }

  /* agents semés : un « normal » et un au nom à caractères interdits sous Windows */
  await page.evaluate(async () => {
    await db.put("agents", { id: "v589-meta", name: "Metaphysique", desc: "Métaphysique thomiste",
      instructions: "1. Partir de l’être.\n2. Distinguer l’essence et l’existence.",
      primer: "Tu es un métaphysicien thomiste.", tags: ["thomisme", "être"],
      forbidden: "Anachronismes", temperature: 0.4, maxTokens: 4096, style: "rigoureux", memPrio: 3 });
    await db.put("agents", { id: "v589-sale", name: "Test: a/b*c?", desc: "Nom hostile",
      instructions: "Peu importe." });
    if (typeof loadAgents === "function") await loadAgents();
  });
  await page.waitForTimeout(400);

  /* ── 1. bouton 📄 par agent + fichier .md écrit ── */
  section("1. Bouton 📄 par agent : un VRAI fichier .md est écrit");
  const nbBoutons = await page.evaluate(() => document.querySelectorAll('#agent-existing-list [onclick*="exportAgentMd"]').length);
  ok("un bouton « 📄 » d’export Markdown est présent par agent", nbBoutons >= 2, "n=" + nbBoutons);
  const titreBtn = await page.evaluate(() => {
    const b = document.querySelector('#agent-existing-list [onclick*="exportAgentMd"]');
    return b ? (b.getAttribute("title") || "") : "";
  });
  ok("son infobulle annonce le Markdown (.md)", /Markdown/.test(titreBtn) && /\.md/.test(titreBtn), titreBtn);

  await viderToasts(page);
  await page.evaluate(() => window.exportAgentMd("v589-meta"));
  const t1 = await attendreToast(/Enregistré\s*:/);
  const chemin1 = cheminDe(t1);
  ok("l’export ANNONCE un chemin d’enregistrement", !!chemin1, t1.slice(0, 120));
  ok("le chemin finit par .md", /\.md$/.test(chemin1), chemin1);
  ok("le nom de fichier est agent-Metaphysique.md", path.basename(chemin1) === "agent-Metaphysique.md", path.basename(chemin1));
  ok("le fichier EXISTE sur disque", !!chemin1 && fs.existsSync(chemin1), chemin1);
  const md1 = chemin1 && fs.existsSync(chemin1) ? fs.readFileSync(chemin1, "utf8") : "";
  ok("c’est du Markdown : titre de niveau 1 avec le nom",
     /^# Metaphysique\s*$/m.test(md1), md1.split("\n")[0] || "(vide)");
  ok("la description est en citation", /> Métaphysique thomiste/.test(md1));
  ok("les métadonnées sont listées (température, étiquettes)",
     /\*\*Température\*\* : 0\.4/.test(md1) && /thomisme/.test(md1));
  ok("la section Instructions est présente et fidèle (retours à la ligne gardés)",
     /^## Instructions$/m.test(md1) && /Distinguer l’essence et l’existence\./.test(md1) && md1.indexOf("1. Partir de l’être.") !== -1);
  ok("la section Amorces est présente", /^## Amorces$/m.test(md1) && /métaphysicien thomiste/.test(md1));
  ok("la section Termes interdits est présente", /^## Termes interdits$/m.test(md1) && /Anachronismes/.test(md1));
  ok("le document prévient qu’il n’est PAS réimportable",
     /réimporter/i.test(md1) && /JSON/i.test(md1));

  /* ── 2. nom d'agent hostile : nom de fichier assaini, écriture réussie ── */
  section("2. Nom d’agent hostile ( : / * ? ) : nom de fichier assaini");
  await viderToasts(page);
  await page.evaluate(() => window.exportAgentMd("v589-sale"));
  const t2 = await attendreToast(/Enregistré\s*:/);
  const chemin2 = cheminDe(t2);
  ok("le fichier hostile est bien écrit", !!chemin2 && fs.existsSync(chemin2), chemin2);
  ok("le nom de fichier ne contient plus de caractère interdit",
     !!chemin2 && !/[\\/:*?"<>|]/.test(path.basename(chemin2)), path.basename(chemin2 || ""));

  /* ── 3. EXPORTER TOUT (.MD) : un seul document, sommaire + sections ── */
  section("3. « EXPORTER TOUT (.MD) » : un document, sommaire, une section par agent");
  const btnTout = await page.evaluate(() => {
    const b = document.getElementById("export-all-agents-md-btn");
    return b ? b.textContent : null;
  });
  ok("le bouton « ⬇⬇ EXPORTER TOUT (.MD) » est installé", /EXPORTER TOUT \(\.MD\)/.test(String(btnTout)), String(btnTout));
  await viderToasts(page);
  await page.evaluate(() => window.__v583AgentsIo.exportToutMd());
  const t3 = await attendreToast(/Enregistré\s*:/);
  const chemin3 = cheminDe(t3);
  ok("un fichier .md unique est écrit", /\.md$/.test(chemin3) && fs.existsSync(chemin3), chemin3);
  const md3 = chemin3 && fs.existsSync(chemin3) ? fs.readFileSync(chemin3, "utf8") : "";
  ok("il y a un sommaire numéroté", /^## Sommaire$/m.test(md3) && /^\d+\. /m.test(md3));
  const sections = (md3.match(/^## /gm) || []).length - 1; /* moins « ## Sommaire » */
  const nbAgents = await page.evaluate(async () => (await db.getAll("agents")).length);
  ok("une section de niveau 2 par agent (" + nbAgents + ")", sections === nbAgents, "sections=" + sections);
  ok("les agents y figurent tous", /Metaphysique/.test(md3) && /Nom hostile/.test(md3));

  /* ── 4. panneau des 20 agents théologiques 🎓 ── */
  section("4. Panneau 🎓 : bouton d’export Markdown des 20 agents");
  await page.evaluate(() => { const b = document.getElementById("open-presets"); if (b) b.click(); });
  await page.waitForFunction(() => !!document.getElementById("v527-export-md"), null, { timeout: 8000 });
  const p527b = await page.evaluate(() => {
    const b = document.getElementById("v527-export-md");
    return b ? b.textContent : null;
  });
  ok("le bouton « Exporter les 20 (.md) » existe dans le panneau", /\(\.md\)/.test(String(p527b)), String(p527b));
  if (p527b) {
    await viderToasts(page);
    await page.evaluate(() => document.getElementById("v527-export-md").click());
    const t4 = await attendreToast(/agents-theologiques-theologicus\.md/, 20000);
    const chemin4 = cheminDe(t4) || path.join(RACINE, "backups", "agents-theologiques-theologicus.md");
    ok("le document des 20 agents est écrit sur disque", fs.existsSync(chemin4), chemin4);
    if (fs.existsSync(chemin4)) {
      const md4 = fs.readFileSync(chemin4, "utf8");
      const sec4 = (md4.match(/^## /gm) || []).length - 1;
      ok("il contient 20 sections d’agents", sec4 === 20, "sections=" + sec4);
      ok("l’agent « Exégète » y est", /Exégète/.test(md4));
    } else {
      ok("il contient 20 sections d’agents", false, "fichier absent");
      ok("l’agent « Exégète » y est", false, "fichier absent");
    }
  } else {
    ok("le document des 20 agents est écrit sur disque", false, "bouton absent");
    ok("il contient 20 sections d’agents", false, "bouton absent");
    ok("l’agent « Exégète » y est", false, "bouton absent");
  }

  /* ── 5. le JSON reste intact ── */
  section("5. Non-régression : le JSON fonctionne toujours");
  await viderToasts(page);
  await page.evaluate(() => window.exportAgent("v589-meta"));
  const t5 = await attendreToast(/Enregistré\s*:/);
  const chemin5 = cheminDe(t5);
  ok("l’export JSON écrit toujours agent-Metaphysique.json",
     path.basename(chemin5) === "agent-Metaphysique.json" && fs.existsSync(chemin5), path.basename(chemin5));
  let json5 = null;
  try { json5 = JSON.parse(fs.readFileSync(chemin5, "utf8")); } catch (e) {}
  ok("le JSON est valide et réimportable (name + desc)", !!json5 && json5.name === "Metaphysique" && !!json5.desc);

  /* ── 6. propreté ── */
  section("6. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
