// Banc v523 — RAG ANCRÉ : les corpus entrent enfin dans le prompt.
//
// Preuve centrale : on INTERCEPTE la requête réellement envoyée au modèle et on
// vérifie qu'elle contient le bloc « PASSAGES PERTINENTS » avec de vraies
// références. On vérifie aussi : détection du chat principal, extraction de la
// question, récupération, barre des sources, et l'ARRÊT de l'ancrage (toggle).
//
// Usage : node verify_v523_rag.js [--port 8765]

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
  console.log("BANC v523 — RAG ANCRÉ SUR LES SOURCES");
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

  // Interception du modèle : on CAPTURE le corps réellement envoyé.
  let corpsEnvoye = '';
  const capturer = async (route) => {
    // On capture le CHAT PRINCIPAL (marqueur du prompt système), pas les appels utilitaires.
    try { const b = route.request().postData(); if (b && b.indexOf('"messages"') >= 0 && b.indexOf('RÈGLES DE VÉRIFICATION') >= 0) corpsEnvoye = b; } catch (e) {}
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Réponse de test ancrée.' } }] }) });
  };
  await page.route("**/proxy/**", capturer);
  await page.route("**/chat/completions", capturer);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_key", "sk-test");
      localStorage.setItem("mistral_api_key_v1", "sk-test");
      localStorage.removeItem("theo_rag_on_v1");
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
  await masquerWizard(page);
  await page.waitForTimeout(800);
  ok("le module v523 est chargé", await page.evaluate(() => !!window.__v523Rag));
  ok("l'ancrage est ACTIF par défaut", await page.evaluate(() => window.__v523Rag.actif()));
  // v524 s'enveloppe PAR-DESSUS v523 : le drapeau __v523 est sur la couche
  // INTERNE. On vérifie donc que les DEUX routes portent une couche RAG.
  ok("callLLM ET callLLMStream sont enveloppés (chaîne RAG)", await page.evaluate(() => {
    const f = window.callLLM, g = window.callLLMStream;
    return !!(f && g && (f.__v523 || f.__v524) && (g.__v523 || g.__v524));
  }));

  section("1. Détection du chat principal et extraction de la question");
  const det = await page.evaluate(() => {
    const sys = buildSystemPrompt();
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: 'Que dit la Genèse sur la création ?' }];
    return {
      principal: window.__v523Rag.estChatPrincipal(msgs),
      pasAutre: window.__v523Rag.estChatPrincipal([{ role: 'user', content: 'salut' }]),
      question: window.__v523Rag.derniereQuestion(msgs),
    };
  });
  ok("le chat principal est reconnu (prompt système présent)", det.principal);
  ok("un appel utilitaire n'est PAS confondu avec le chat", det.pasAutre === false);
  ok("la question de l'utilisateur est extraite", /Genèse/.test(det.question), det.question);

  section("2. Récupération de passages (moteur BM25 local)");
  await page.evaluate(() => window.__v520Rapid.prete());
  await page.waitForFunction(() => window.__v520Rapid.etat().pret === true, { timeout: 120000 });
  const ps = await page.evaluate(() => window.__v523Rag.passages('Au commencement Dieu créa le ciel et la terre'));
  ok("des passages sont récupérés", ps.length > 0, "n=" + ps.length);
  ok("le premier est Genèse 1:1", ps.length > 0 && ps[0].ref === 'Genèse 1:1', ps.slice(0, 3).map(p => p.ref).join(" | "));
  ok("chaque passage porte son texte", ps.every(p => typeof p.t === 'string' && p.t.length > 10));

  section("3. Bloc de contexte bien formé");
  const bloc = await page.evaluate(async () => window.__v523Rag.blocContexte(await window.__v523Rag.passages('Dieu créa')));
  ok("le bloc annonce les passages", /PASSAGES PERTINENTS/.test(bloc), bloc.slice(0, 60));
  ok("il contient des références réelles", /Genèse 1:1/.test(bloc), (bloc.match(/\[\d+\] [^\n]{0,40}/) || [""])[0]);
  ok("il porte la consigne d'ancrage", /EN PRIORITÉ/.test(bloc));

  section("4. PREUVE : le bloc est réellement ENVOYÉ au modèle");
  await page.evaluate(() => {
    try { state.model = 'agnes:agnes-2.5-flash'; } catch (e) {}
  });
  corpsEnvoye = '';
  await page.evaluate(() => { window.sendMessage('Au commencement Dieu créa le ciel et la terre'); });
  await page.waitForFunction(() => true, { timeout: 1000 }).catch(() => {});
  for (let i = 0; i < 40 && !corpsEnvoye; i++) await page.waitForTimeout(250);
  ok("une requête a été envoyée au modèle", !!corpsEnvoye, "taille=" + corpsEnvoye.length);
  ok("elle contient le bloc « PASSAGES PERTINENTS »", /PASSAGES PERTINENTS/.test(corpsEnvoye));
  ok("elle contient une référence biblique réelle", /Genèse 1:1/.test(corpsEnvoye));
  ok("le prompt système d'origine est toujours là", /RÈGLES DE VÉRIFICATION/.test(corpsEnvoye));

  section("5. La barre des sources s'affiche");
  const barre = await page.evaluate(() => {
    const b = document.getElementById('v523-bar');
    return { present: !!b, src: b ? document.getElementById('v523-src').textContent : '', sw: b ? document.getElementById('v523-sw').textContent : '' };
  });
  ok("la barre est présente au-dessus du composer", barre.present);
  ok("elle liste les sources utilisées", /Genèse 1:1/.test(barre.src), barre.src.slice(0, 70));
  ok("elle indique que l'ancrage est actif", /Ancré/.test(barre.sw), barre.sw);

  section("6. Désactiver l'ancrage STOPPE l'injection");
  await page.evaluate(() => window.__v523Rag.bascule());
  ok("l'ancrage est désactivé", !(await page.evaluate(() => window.__v523Rag.actif())));
  corpsEnvoye = '';
  await page.evaluate(() => { window.sendMessage('Dieu créa le ciel'); });
  for (let i = 0; i < 40 && !corpsEnvoye; i++) await page.waitForTimeout(250);
  ok("une requête part quand même", !!corpsEnvoye);
  ok("mais SANS bloc de passages", !/PASSAGES PERTINENTS/.test(corpsEnvoye));
  const barre2 = await page.evaluate(() => document.getElementById('v523-src').textContent);
  ok("la barre signale l'absence d'ancrage", /non ancrée|non ancrées/.test(barre2), barre2.slice(0, 60));

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
