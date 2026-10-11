// Outil partagé des bancs Playwright THEOLOGICUS — Axe 4 (robustesse/CI), lot R1.
//
// Centralise ce que chaque banc réimplémentait imparfaitement et de façon
// divergente :
//   • isolation du magasin partagé (LOCALAPPDATA détourné) + chemin Playwright ;
//   • amorçage du relais sur un port (8765 par défaut, overridable via
//     THEO_BENCH_PORT pour des exécutions PARALLÈLES sans collision) ;
//   • arrêt PROPRE du relais par PID — élimine la course netstat/taskkill qui,
//     chez deux bancs lancés en parallèle, tuait le relais de l'autre (faux
//     silencieux, vécu : un banc vert par accident) ;
//   • amorce d'isolation navigateur (pas de synchro, pas d'assistant) ;
//   • login admin + lancement navigateur + rapport normalisé.
//
// Usage côté banc :
//   const H = require('../../../tools/bench_common.js');
//   const relais = await H.spawnRelay({ port: H.pickFreePort() });  // ou {} pour 8765
//   ... H.adminLogin(page); H.isolationInit via addInitScript ...
//   process.exitCode = H.report(resultats);
//   H.killRelay(relais);

'use strict';
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const RACINE = path.resolve(__dirname, '..');
const PY = process.env.PY_BIN || 'C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe';
const AUTH_HASH = 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';

// Port libre : on lie un socket sur 0, on récupère le port attribué, on ferme.
// Faible course (un autre process pourrait le prendre aussitôt) mais négligeable
// sur une machine de dev ; suffisant pour éviter la collision 8765 partagé.
function pickFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

// Amorce le relais proxy_server.py. Renvoie { child, port }.
async function spawnRelay(opts) {
  opts = opts || {};
  const port = opts.port || parseInt(process.env.THEO_BENCH_PORT, 10) || 8765;
  const env = Object.assign({}, process.env, {
    THEO_BENCH_PORT: String(port),
    NO_PROXY: '*', no_proxy: '*'
  });
  if (opts.localAppData) env.LOCALAPPDATA = opts.localAppData;
  if (opts.storeMaxBytes) env.THEO_STORE_MAX_BYTES = String(opts.storeMaxBytes);
  if (opts.storeMinChats) env.THEO_STORE_MIN_CHATS = String(opts.storeMinChats);
  const child = spawn(PY, ['-u', 'proxy_server.py'], {
    cwd: RACINE, stdio: 'ignore', windowsHide: true, env
  });
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/__theologicus_ping`, { signal: AbortSignal.timeout(2000) });
      if (r.status === 200) return { child, port };
    } catch (e) { /* relais pas encore prêt */ }
    if (child.exitCode !== null) break;
  }
  return { child, port };
}

function killRelay(handle) {
  if (handle && handle.child) {
    try { handle.child.kill('SIGKILL'); } catch (e) {}
  }
}

// À passer dans page.addInitScript(() => { ... }) — amorce d'isolation.
function isolationInit() {
  try {
    localStorage.setItem('theologicus_wizard_skipped', '1');
    localStorage.setItem('theo_sync_on_v1', '0');   /* pas de synchro */
  } catch (e) {}
}

async function adminLogin(page, hash) {
  await page.evaluate((h) => {
    const enc = new TextEncoder().encode('remember:' + h);
    return crypto.subtle.digest('SHA-256', enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('theologicus_remember', JSON.stringify({ v: 1, mode: 'admin', exp: Date.now() + 86400000 * 30, tok }));
    });
  }, hash || AUTH_HASH);
}

function launchBrowser() {
  const optionsNav = Object.assign({ args: ['--no-sandbox', '--no-proxy-server'] },
    process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {});
  return require('playwright').chromium.launch(optionsNav);
}

// resultats : tableau [bool, nom, detail?]. Renvoie le code de sortie.
function report(resultats) {
  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log('\n' + '='.repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) {
    console.log('\nÉchecs :');
    resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`));
  }
  console.log('='.repeat(72));
  return bons === total ? 0 : 1;
}

module.exports = {
  pickFreePort, spawnRelay, killRelay, isolationInit,
  adminLogin, launchBrowser, report, AUTH_HASH, PW, RACINE, PY
};
