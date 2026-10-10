// Banc v524 — MÉMOIRE PERTINENTE.
//
// Le défaut : buildSystemPrompt appelait memory.getRelevant("context", …) — mot
// littéral + importance toujours comptée → TOUTES les mémoires étaient
// injectées, sans pertinence. Ce banc vérifie que :
//   - getRelevant est bien remplacé ;
//   - une question sans rapport ne ramène PAS tout ;
//   - la question RÉELLE (dernier message utilisateur) est utilisée ;
//   - la mémoire pertinente sort en tête ; les « durables » restent ;
//   - la couche sémantique (Ollama) fonctionne si disponible, sinon le repli.
//
// Usage : node verify_v524_memoire.js [--port 8765]

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
  console.log("BANC v524 — MÉMOIRE PERTINENTE");
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
  await page.waitForTimeout(900);
  ok("le module v524 est chargé", await page.evaluate(() => !!window.__v524Memo));
  ok("memory.getRelevant a été remplacé", await page.evaluate(() => window.__v524Memo.patche()));

  section("1. Jeu d'essai : 3 mémoires dont une « durable »");
  await page.evaluate(() => {
    state.globalMemories = [
      { id: 'm1', content: 'Je préfère les réponses en français avec les références complètes', tags: ['preference'], importance: 1 },
      { id: 'm2', content: "Mon père est historien des religions comparées", tags: ['perso'], importance: 1 },
      { id: 'm3', content: 'Toujours citer le Catéchisme de l\'Église catholique en français', tags: ['preference'], importance: 4 },
    ];
    state.messages = [];
  });
  ok("les mémoires sont en place", (await page.evaluate(() => state.globalMemories.length)) === 3);

  section("2. LE DÉFAUT CORRIGÉ : plus de « tout injecter »");
  // Ancien comportement : getRelevant('context') renvoyait les 3 (importance >= 1).
  const sansQuestion = await page.evaluate(() => memory.getRelevant('context', 5));
  ok("sans question, on n'injecte PAS les 3 mémoires", sansQuestion.length < 3, "n=" + sansQuestion.length + " -> " + sansQuestion.length);
  ok("seule la mémoire DURABLE (importance 4) est conservée", sansQuestion.length === 1 && /Catéchisme/.test(sansQuestion[0]), JSON.stringify(sansQuestion));

  section("3. La VRAIE question est utilisée (dernier message utilisateur)");
  const q1 = await page.evaluate(() => {
    state.messages = [{ role: 'user', content: 'Quelles références dois-tu donner dans tes réponses ?' }];
    return memory.getRelevant('context', 5);
  });
  ok("la mémoire sur les références est retrouvée", q1.some(s => /références complètes/.test(s)), JSON.stringify(q1));
  ok("la mémoire hors sujet (père historien) est ÉCARTÉE", !q1.some(s => /historien/.test(s)), JSON.stringify(q1));

  section("4. Requête explicite et hors sujet");
  const q2 = await page.evaluate(() => memory.getRelevant('Catéchisme', 5));
  ok("« Catéchisme » fait remonter la bonne mémoire", q2.length > 0 && /Catéchisme/.test(q2[0]), JSON.stringify(q2));
  const q3 = await page.evaluate(() => memory.getRelevant('zoologie des abeilles et des fourmis', 5));
  // La mémoire DURABLE (importance >= 4) est TOUJOURS conservée : hors sujet,
  // on ne doit donc voir QU'ELLE (aucune correspondance lexicale parasite).
  ok("hors sujet : seul le durable subsiste, aucun parasite", q3.length === 1 && /Catéchisme/.test(q3[0]), JSON.stringify(q3));

  section("5. Le moteur de classement (IDF) est réel");
  const cl = await page.evaluate(() => window.__v524Memo.classe('références complètes', state.globalMemories).map(x => ({ id: x.m.id, s: +x.s.toFixed(3) })));
  ok("le classement ordonne par pertinence", cl.length > 0 && cl[0].id === 'm1', JSON.stringify(cl));
  ok("les scores sont strictement positifs et décroissants", cl.every((x, i) => x.s > 0 && (i === 0 || cl[i - 1].s >= x.s)), JSON.stringify(cl));

  section("6. Couche sémantique (Ollama) — testée si disponible, sinon repli");
  const ol = await page.evaluate(() => window.__v524Memo.ollamaOk());
  if (ol) {
    const sem = await page.evaluate(() => window.__v524Memo.semantique('je veux des références complètes dans mes réponses', 3));
    ok("Ollama joignable : la recherche sémantique renvoie un classement", Array.isArray(sem), "n=" + sem.length);
    ok("le résultat sémantique porte bien des mémoires", sem.every(x => x.m && typeof x.m.content === 'string'), JSON.stringify(sem.map(x => x.m.id)));
  } else {
    console.log("  (Ollama injoignable ici — la couche sémantique est ignorée)");
    ok("repli : le lexical fonctionne SANS Ollama", (await page.evaluate(() => memory.getRelevant('références', 5))).length > 0);
  }

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
