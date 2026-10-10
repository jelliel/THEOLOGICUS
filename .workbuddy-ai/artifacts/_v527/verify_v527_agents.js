// Banc v527 — AGENTS THÉOLOGIQUES PRÊTS.
//
// Vérifie que : les 8 pré-réglés s'installent (idempotent, JAMAIS destructif),
// apparaissent dans le sélecteur d'agents existant, et qu'en activer un change
// RÉELLEMENT le prompt système envoyé au modèle.
//
// Usage : node verify_v527_agents.js [--port 8765]

const path = require("path");
const { spawn, execSync } = require("child_process");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");

for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "FTP_PROXY", "ftp_proxy"]) delete process.env[k];
process.env.NO_PROXY = "*"; process.env.no_proxy = "*";

function tuerPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const pids = new Set();
    out.split("\n").forEach(l => { const m = l.match(new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)); if (m) pids.add(m[1]); });
    pids.forEach(p => { try { execSync(`taskkill /PID ${p} /F`, { stdio: "ignore" }); } catch (e) {} });
  } catch (e) {}
}

const PORT = process.argv.includes("--port") ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY_BIN || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]); console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`); return !!cond; }
function section(t) { console.log("\n" + t); }
async function masquerWizard(page) { await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {} }).catch(() => {}); }

let relais = null;
async function relaisVit() { try { const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`, { signal: AbortSignal.timeout(3000) }); return r.status === 200; } catch (e) { return false; } }
async function assurerRelais() {
  tuerPort(PORT); await new Promise(r => setTimeout(r, 600));
  console.log("  … lancement de proxy_server.py (port " + PORT + ")");
  relais = spawn(PY, ["-u", "proxy_server.py"], { cwd: RACINE, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); if (await relaisVit()) return true; if (relais.exitCode !== null) return false; }
  return false;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v527 — AGENTS THÉOLOGIQUES PRÊTS");
  console.log(BASE);
  console.log("=".repeat(72));
  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

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
  await masquerWizard(page);
  await page.waitForTimeout(1500);
  ok("le module v527 est chargé", await page.evaluate(() => !!window.__v527Agents));
  ok("le bouton « 🎓 AGENTS » est présent", await page.evaluate(() => !!document.getElementById('open-presets')));
  ok("8 pré-réglés sont définis", await page.evaluate(() => window.__v527Agents.presets.length) === 8);

  section("1. Installation des pré-réglés");
  const s1 = await page.evaluate(() => window.__v527Agents.seme());
  // L'installation est aussi faite SILENCIEUSEMENT au premier chargement :
  // on vérifie donc la PRÉSENCE en base, pas le nombre posé par cet appel.
  const enBase = await page.evaluate(() => db.getAll('agents').then(a => a.filter(x => /^preset-/.test(x.id)).length));
  ok("les 8 pré-réglés sont présents en base", s1.ok && enBase === 8, "poses=" + s1.poses + " enBase=" + enBase);
  const s2 = await page.evaluate(() => window.__v527Agents.seme());
  ok("une seconde installation ne fait RIEN (idempotent)", s2.poses === 0, "poses=" + s2.poses);

  section("2. Ils apparaissent dans le sélecteur d'agents existant");
  const sel = await page.evaluate(() => {
    const s = document.getElementById('agent-select');
    return Array.from(s.options).map(o => o.value).filter(v => /^preset-/.test(v));
  });
  ok("le sélecteur contient les 8 pré-réglés", sel.length === 8, "n=" + sel.length + " -> " + sel.join(", "));

  section("3. Activation : le prompt système CHANGE réellement");
  const avant = await page.evaluate(() => buildSystemPrompt());
  ok("le prompt n'a pas encore la méthode de l'exégète", !/contexte littéraire et historique/.test(avant));
  const act = await page.evaluate(() => window.__v527Agents.active('preset-exegete'));
  ok("l'activation réussit", act === true);
  const etat = await page.evaluate(() => ({ id: state.agent && state.agent.id, nom: state.agent && state.agent.name, sel: document.getElementById('agent-select').value }));
  ok("l'agent actif est l'exégète", etat.id === 'preset-exegete', JSON.stringify(etat));
  ok("le sélecteur suit", etat.sel === 'preset-exegete', etat.sel);
  const apres = await page.evaluate(() => buildSystemPrompt());
  ok("le prompt porte la MÉTHODE de l'exégète", /contexte littéraire et historique/.test(apres), (apres.match(/Méthode exégétique[^\n]{0,60}/) || [""])[0]);
  ok("il porte aussi l'interdit de l'exégète", /confondre exégèse/.test(apres));

  section("4. Un autre pré-réglé change bien de profil");
  await page.evaluate(() => window.__v527Agents.active('preset-islam'));
  const p2 = await page.evaluate(() => buildSystemPrompt());
  ok("le profil islamologue est actif", /comparative islamo-chrétienne|Ni dépendance ni accord/i.test(p2) || /tafsir/i.test(p2), (p2.match(/Rôle : [^\n]{0,60}/) || [""])[0]);
  ok("le profil exégète n'est PLUS actif", !/contexte littéraire et historique/.test(p2));

  section("5. Le panneau liste et active");
  await page.evaluate(() => window.__v527Agents.ouvre());
  await page.waitForFunction(() => { const p = document.getElementById('v527-panel'); return p && p.classList.contains('open'); }, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#v527-panel .it').length === 8, { timeout: 15000 });
  const ui = await page.evaluate(() => ({
    items: document.querySelectorAll('#v527-panel .it').length,
    actif: document.querySelectorAll('#v527-panel .it.actif').length,
    st: document.getElementById('v527-st').textContent,
  }));
  ok("les 8 agents sont listés", ui.items === 8, "items=" + ui.items);
  ok("le compteur indique les installés", /8 \/ 8/.test(ui.st), ui.st);
  ok("l'agent actif est mis en évidence", ui.actif === 1, "actifs=" + ui.actif);
  await page.evaluate(() => { const b = document.querySelector('#v527-panel [data-act="preset-catechiste"]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  ok("un clic sur « Activer » change l'agent", (await page.evaluate(() => state.agent && state.agent.id)) === 'preset-catechiste');

  section("6. JAMAIS destructif : un agent utilisateur survit");
  await page.evaluate(() => db.put('agents', { id: 'mon-agent-perso', name: 'Mon agent', desc: 'perso', instructions: 'Ne pas toucher', tags: [], style: 'concis', forbidden: '', memPrio: 3, created: Date.now() }));
  await page.evaluate(() => window.__v527Agents.seme());
  const perso = await page.evaluate(() => db.get('agents', 'mon-agent-perso').then(a => a && a.instructions));
  ok("l'agent utilisateur est intact", perso === 'Ne pas toucher', String(perso));
  const nb = await page.evaluate(() => db.getAll('agents').then(a => a.length));
  ok("le nombre total d'agents est 8 pré-réglés + 1 perso", nb === 9, "total=" + nb);

  section("7. Propreté");
  ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  if (relais) relais.kill();

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) { console.log("\nÉchecs :"); resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`)); }
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error("\n[EXCEPTION] " + (e && e.stack || e)); if (relais) relais.kill(); process.exit(3); });
