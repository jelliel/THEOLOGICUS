// Banc v539 — CONTRAT D'ACCESSIBILITÉ DES PANNEAUX (Axe 3, lot C4).
//
// Le banc v508 a établi le contrat (role=dialog, aria-modal, aria-label, piège à
// tabulation, Échap, focus restitué) mais SEULEMENT pour deux panneaux. v539
// l'étend, de l'extérieur, aux panneaux créés depuis.
//
// ⚠️ Les panneaux sont créés À LA DEMANDE (appendChild à <body>) : le banc les
// ouvre par leur bouton HUD, ce qui exerce exactement le chemin réel (création
// → guet → équipement), et non un panneau pré-existant.
//
// v550 — 5 de ces boutons HUD (dossier, sources, concordance, themes, notes)
// vivent désormais dans le conteneur caché #v550-modales-palette : ils ne
// sont plus cliquables À LA SOURIS, mais la PALETTE (v535) les lance par
// el.click() — qui est devenu le chemin RÉEL. Le banc ouvre donc par un vrai
// clic souris quand le bouton est visible, sinon par el.click() programmatique
// (exactement ce que fait la palette). Et la restitution de focus vise le
// bouton d'origine S'IL EST AFFICHABLE, sinon retombe sur <body> (focus() sur
// un élément caché est sans effet — comportement a11y correct).
//
// Usage : node verify_v539_a11y_panneaux.js [--port 8765]

const path = require("path");
const { spawn, execSync } = require("child_process");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");
const H = require('../../../tools/bench_common.js');

for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "FTP_PROXY", "ftp_proxy"]) delete process.env[k];
process.env.NO_PROXY = "*"; process.env.no_proxy = "*";

const PORT = process.argv.includes("--port") ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY_BIN || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

/* Panneau -> bouton qui l'ouvre. */
const PANNEAUX = [
  { id: 'v535-panel', bouton: 'open-palette',     nom: 'Palette de commandes' },
  { id: 'v536-panel', bouton: 'open-dossier',     nom: 'Dossier de passage' },
  { id: 'v529-panel', bouton: 'open-sources',     nom: 'Sources & éditions' },
  { id: 'v530-panel', bouton: 'open-concordance', nom: 'Concordance' },
  { id: 'v531-panel', bouton: 'open-themes',      nom: 'Index thématique' },
  { id: 'v533-panel', bouton: 'open-notes',       nom: 'Notes typées' },
  { id: 'v521-panel', bouton: 'open-corbeille',   nom: 'Corbeille' }
];

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]); console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`); return !!cond; }
function section(t) { console.log("\n" + t); }

let relais = null;

/* Ferme tout panneau resté ouvert (isolation entre les cas). */
const TOUT_FERMER = () => {
  document.querySelectorAll('.open').forEach(function (el) { el.classList.remove('open'); });
  return true;
};

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v539 — ACCESSIBILITÉ DES PANNEAUX");
  console.log(BASE);
  console.log("=".repeat(72));
relais = await H.spawnRelay({ port: PORT });
if (!relais.child || relais.child.exitCode !== null) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|jspdf|html2canvas/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });
  page.on("dialog", d => d.accept());

  await page.addInitScript(() => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("theo_sync_on_v1", "0");     /* isolation : pas de pull du magasin */
    } catch (e) {}
  });

  section("0. Ouverture de l'application");
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((h) => {
    const enc = new TextEncoder().encode("remember:" + h);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("theologicus_remember", JSON.stringify({ v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok }));
    });
  }, AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(() => {});
  await page.waitForTimeout(1200);
  ok("le module v539 est chargé", await page.evaluate(() => !!window.__v539A11y));
  ok("il déclare les 7 panneaux", await page.evaluate(() => Object.keys(window.__v539A11y.panneaux).length) === 7,
    await page.evaluate(() => Object.keys(window.__v539A11y.panneaux).length));
  ok("les panneaux sont créés À LA DEMANDE (aucun n'existe encore)",
    await page.evaluate((ids) => ids.every(i => !document.getElementById(i)), PANNEAUX.map(p => p.id)));

  for (const p of PANNEAUX) {
    section("• " + p.nom + " (" + p.id + ")");
    await page.evaluate(TOUT_FERMER);
    await page.waitForTimeout(150);

    /* Ouverture par le bouton HUD : chemin RÉEL. v550 — si le bouton vit dans
       le conteneur caché de la PALETTE, le clic programmatique el.click() EST
       le chemin réel (c'est ce que fait la palette) ; sinon vrai clic souris. */
    const boutonVisible = await page.evaluate((b) => {
      const el = document.getElementById(b);
      return !!el && el.offsetParent !== null;
    }, p.bouton);
    if (boutonVisible) await page.click('#' + p.bouton);
    else await page.evaluate((b) => { const el = document.getElementById(b); if (el) el.click(); }, p.bouton);
    await page.waitForFunction((id) => {
      const el = document.getElementById(id);
      return el && el.classList.contains('open');
    }, p.id, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);

    const a = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return { absent: true };
      return {
        role: el.getAttribute('role'),
        modal: el.getAttribute('aria-modal'),
        label: el.getAttribute('aria-label'),
        focusDedans: el.contains(document.activeElement),
        actif: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : 'aucun',
        nFocus: window.__v539A11y.focusables(el).length,
        equipe: !!el.__v539a11y
      };
    }, p.id);
    ok("le panneau est créé et équipé", !a.absent && a.equipe === true, JSON.stringify(a).slice(0, 120));
    ok("role=dialog", a.role === 'dialog', a.role);
    ok("aria-modal=true", a.modal === 'true', a.modal);
    ok("aria-label présent", !!a.label, a.label);
    ok("le focus est ENTRÉ dans le panneau", a.focusDedans === true, "actif=" + a.actif);

    /* Piège à tabulation : du DERNIER élément, Tab revient au PREMIER. */
    const piege = await page.evaluate((id) => {
      const el = document.getElementById(id);
      const f = window.__v539A11y.focusables(el);
      if (f.length < 2) return { n: f.length };
      f[f.length - 1].focus();
      return { n: f.length, pose: document.activeElement === f[f.length - 1] };
    }, p.id);
    if (piege.n >= 2) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(80);
      const revient = await page.evaluate((id) => {
        const el = document.getElementById(id);
        const f = window.__v539A11y.focusables(el);
        return document.activeElement === f[0];
      }, p.id);
      ok("le piège à tabulation ramène au premier élément", revient === true, "focusables=" + piege.n);
    } else if (piege.n === 1) {
      /* Certains panneaux n'ont QU'UN élément focusable (la palette n'a que son
         champ : elle se ferme par Échap ou par un clic à l'extérieur). Le piège
         doit alors simplement MAINTENIR le focus dedans. */
      await page.keyboard.press('Tab');
      await page.waitForTimeout(80);
      const reste = await page.evaluate((id) => document.getElementById(id).contains(document.activeElement), p.id);
      ok("le piège maintient le focus dans le panneau (un seul élément focusable)", reste === true);
    } else {
      ok("le piège à tabulation ramène au premier élément", false, "aucun élément focusable");
    }

    /* Échap ferme ET restitue le focus au bouton d'origine — SAUF si ce bouton
       est caché (v550, conteneur palette) : focus() sur un élément non
       affichable est sans effet, le focus retombe légitimement sur <body>.
       Contrat honnête : origine visible → bouton d'origine ; origine cachée →
       en tout cas PAS un élément du panneau fermé. */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const apres = await page.evaluate((id) => ({
      ouvert: document.getElementById(id).classList.contains('open'),
      actif: document.activeElement ? document.activeElement.id : 'aucun'
    }), p.id);
    ok("Échap ferme le panneau", apres.ouvert === false);
    if (boutonVisible) {
      ok("le focus est RESTITUÉ au bouton d'origine", apres.actif === p.bouton, "actif=" + apres.actif);
    } else {
      /* Mesuré : le module restitue la DERNIÈRE position focusée avant
         l'ouverture (ici open-palette, issu du lancement palette) —
         comportement a11y légitime. Contrat : focus HORS du panneau fermé,
         sur un élément affichable (ou le corps). */
      const etat = await page.evaluate((id) => {
        const pan = document.getElementById(id);
        const a = document.activeElement;
        return {
          pasCoincé: !pan || !pan.contains(a),
          actif: a ? (a.id || a.tagName) : 'aucun',
          affichable: a && a !== document.body ? a.offsetParent !== null : true,
          corps: a === document.body
        };
      }, p.id);
      ok("focus restitué hors du panneau, sur un élément affichable (origine cachée)",
         etat.pasCoincé && (etat.corps || etat.affichable), "actif=" + etat.actif);
    }
  }

  section("Propreté");
  ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  if (relais) H.killRelay(relais);

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) { console.log("\nÉchecs :"); resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`)); }
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error("\n[EXCEPTION] " + (e && e.stack || e)); if (relais) H.killRelay(relais); process.exit(3); });
