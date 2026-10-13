/* ═══════════════════════════════════════════════════════════════════════
   Banc v573 — HTTPS du mode serveur : le micro depuis un AUTRE appareil.

   Le serveur local (app.py) écoute en HTTP sur 0.0.0.0 : depuis un autre
   appareil (http://192.168.x.x:8765) la page n'est PAS un contexte sécurisé
   → navigator.mediaDevices absent → micro impossible. v573 ajoute un
   serveur HTTPS auto-signé (ports 8443-8446, certificat embarqué https/).

   Vérifie (app.py lancé en NO_WINDOW, magasin isolé — règle v559) :
     1. app.py démarre le serveur HTTPS (port annoncé sur stdout).
     2. https://127.0.0.1:<port>/THEOLOGICUS.html répond (certificat
        auto-signé accepté pour le test) et la page est un CONTEXTE
        SÉCURISÉ (window.isSecureContext === true) → le micro y est
        possible ; l'orbe Adeodat est posée.
     3. L'origine HTTP locale répond toujours (rétrocompatibilité).
     4. navigator.mediaDevices existe sur la page HTTPS (prérequis micro).
   ═══════════════════════════════════════════════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');

const resultats = [];
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v573_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const RACINE = path.resolve(__dirname, '..', '..', '..');
  if (!fs.existsSync(path.join(RACINE, 'https', 'theologicus-local.pem'))) {
    console.log('  [ECHEC] certificat https/ absent du dépôt'); process.exit(3);
  }
  ok('le certificat auto-signé est embarqué (https/)', true);

  const enfant = spawn(H.PY, ['-u', 'app.py'], {
    cwd: RACINE,
    env: Object.assign({}, process.env, {
      THEOLOGICUS_NO_WINDOW: '1',
      THEO_BENCH_PORT: String(port),
      LOCALAPPDATA: STORE_DIR,
      PYTHONDONTWRITEBYTECODE: '1'
    })
  });
  let portHttps = 0;
  const t0 = Date.now();
  enfant.stdout.on('data', d => {
    const m = String(d).match(/HTTPS prêt : https:\/\/[^:]+:(\d+)/);
    if (m && !portHttps) portHttps = parseInt(m[1], 10);
  });
  enfant.stderr.on('data', d => console.log('  [app] ' + String(d).trim().slice(0, 110)));
  while (Date.now() - t0 < 30000 && !portHttps) await new Promise(r => setTimeout(r, 250));
  ok('app.py annonce un serveur HTTPS (port 8443+)', portHttps >= 8443, 'port=' + (portHttps || 'aucun'));
  if (!portHttps) { enfant.kill(); process.exit(3); }

  const browser = await H.launchBrowser();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const bruit = [];
  page.on('pageerror', e => bruit.push(String(e)));

  /* ── 1. la page HTTPS charge ET est un contexte sécurisé ── */
  await page.goto('https://127.0.0.1:' + portHttps + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const sec = await page.evaluate(() => ({
    secure: window.isSecureContext === true,
    media: !!navigator.mediaDevices,
    orbe: !!document.getElementById('adeodat-orbe')
  }));
  ok('la page HTTPS est un CONTEXTE SÉCURISÉ (isSecureContext)', sec.secure);
  ok('navigator.mediaDevices EXISTE (le micro est possible)', sec.media);
  ok('l\'application démarre en HTTPS (orbe Adeodat posée)', sec.orbe);

  /* ── 2. l'origine HTTP locale répond toujours ── */
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page2.goto('http://127.0.0.1:' + port + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page2.waitForTimeout(1200);
  ok('l\'origine HTTP locale (127.0.0.1) répond toujours', true);

  /* ── 3. propreté ── */
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus/i.test(t));
  ok('aucune erreur JS non attendue sur la page HTTPS', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  await browser.close();
  try { enfant.kill(); } catch (e) {}
  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
