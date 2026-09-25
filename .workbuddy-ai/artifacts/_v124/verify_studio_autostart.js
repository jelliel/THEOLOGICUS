/* Banc v124 — le STUDIO relance-t-il vraiment le service tout seul ?

   Ce que ce banc doit prouver, en pilotant un VRAI navigateur :

     1. Service ARRETE  -> l'ouverture du Studio declenche POST /mpt/start,
        le bandeau passe par « Demarrage », puis rend « Service detecte ».
     2. La liste des musiques (qui vient du SERVICE) se remplit APRES.
     3. Service deja en marche -> l'ouverture NE relance RIEN : deux `api.bat`
        concurrents se disputeraient le port.
     4. Dossier absent -> AUCUN bouton LANCER (un clic ne pourrait aboutir)
        et le message dit « introuvable », au lieu d'un unique bandeau rouge
        qui envoyait chercher une panne inexistante.
     5. Dossier present mais api.bat manquant -> message distinct.

   Pieges evites :
     * on attend la CONDITION (`waitForFunction`), jamais un delai fixe devant
       du reseau : un delai fixe mesure un etat transitoire ;
     * les cas 4 et 5 interceptent la REPONSE du relais — on ne touche ni au
       disque ni a la configuration vivante ;
     * le service et le relais vivent dans l'invocation qui lance ce script.

   Usage :
     node verify_studio_autostart.js [port]
*/
const { chromium } = require('playwright');
const fs = require('fs');

const PORT = process.argv[2] || '8765';
const CHROME_CANDIDATES = [
  'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
  'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find(p => fs.existsSync(p));
const AUTH_HASH = 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';

let ok = 0, ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok++; console.log('  [OK] ' + nom); }
  else { ko++; console.log('  [X ] ' + nom + (detail ? '  -> ' + detail : '')); }
};

(async () => {
  console.log('=== Banc v124 — cycle de vie du service (port ' + PORT + ') ===\n');
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });

  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  const appelsStart = [];
  page.on('request', r => { if (r.url().includes('/mpt/start')) appelsStart.push(Date.now()); });

  await page.goto('http://127.0.0.1:' + PORT + '/THEOLOGICUS.html?banc=' + Date.now(),
    { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  const tok = await page.evaluate(async (H) => {
    const x = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('remember:' + H));
    return Array.from(new Uint8Array(x)).map(v => v.toString(16).padStart(2, '0')).join('');
  }, AUTH_HASH);
  await page.evaluate(t => localStorage.setItem('theologicus_remember', JSON.stringify({
    v: 1, mode: 'admin', exp: Date.now() + 7 * 86400000, tok: t,
  })), tok);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.display = 'none'; }
  });
  await page.waitForTimeout(300);

  const lire = () => page.evaluate(() => {
    const b = document.getElementById('studio-status');
    const sel = document.getElementById('studio-bgm-name');
    return {
      texte: b ? b.textContent.replace(/\s+/g, ' ').trim() : '',
      start: !!document.getElementById('studio-start'),
      redetect: !!document.getElementById('studio-redetect'),
      musique: sel ? sel.options.length : -1,
    };
  });

  // ─── 1. Service arrete : relance automatique ────────────────────────
  console.log("--- 1. SERVICE ARRETE : RELANCE AUTOMATIQUE ---");
  // Le banc DOIT partir d'un service REELLEMENT arrete, sinon il ne prouve
  // rien : `mpt_status()` repondrait « deja » et aucun `api.bat` ne partirait.
  // Le lanceur (voir la commande d'invocation) tue MPT avant d'appeler ce
  // script ; on verifie ici que l'arret est effectif avant de continuer,
  // pour ne pas produire un faux succes.
  const etatDepart = await page.evaluate(async () => {
    const r = await fetch('/mpt/status', { cache: 'no-store' });
    return r.json();
  });
  check('le banc part bien d\'un service ARRETE',
    etatDepart.running === false,
    'running=' + etatDepart.running + ' port=' + etatDepart.port);
  check('le service est vu comme INSTALLE (sinon le cas 4 serait confondu)',
    etatDepart.installe !== false, 'installe=' + etatDepart.installe);

  appelsStart.length = 0;
  await page.evaluate(() => window.__studioOuvrirOnglet && window.__studioOuvrirOnglet('generation'));
  await page.evaluate(() => window.__studioOpen());

  const vuDemarrage = await page.waitForFunction(() => {
    const b = document.getElementById('studio-status');
    return !!b && /D[eé]marrage du service/i.test(b.textContent);
  }, null, { timeout: 10000 }).then(() => true).catch(() => false);
  check('le bandeau annonce « Demarrage du service… »', vuDemarrage);

  check('POST /mpt/start emis automatiquement', appelsStart.length >= 1,
    appelsStart.length + ' appel(s)');

  const verdict = await page.waitForFunction(() => {
    const b = document.getElementById('studio-status');
    return !!b && (/Service d[eé]tect[eé]/.test(b.textContent) ||
                   /Service arr[eê]t[eé]/.test(b.textContent) ||
                   /Service introuvable/.test(b.textContent));
  }, null, { timeout: 40000 }).then(() => true).catch(() => false);
  check('un verdict final est rendu', verdict);

  let e = await lire();
  check('verdict = « Service detecte »', /Service d[eé]tect[eé]/.test(e.texte),
    e.texte.slice(0, 100));
  check('le port 8080 est annonce', /8080/.test(e.texte), e.texte.slice(0, 100));
  check('aucun bouton LANCER quand tout va bien', e.start === false);

  // ─── 2. Les listes du service se remplissent ────────────────────────
  console.log('\n--- 2. LES LISTES DU SERVICE SE REMPLISSENT ---');
  const listeOk = await page.waitForFunction(() => {
    const s = document.getElementById('studio-bgm-name');
    return !!s && s.options.length > 1;
  }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  e = await lire();
  check('la liste des musiques est remplie', listeOk && e.musique > 1,
    e.musique + ' entree(s)');

  // ─── 3. Service deja en marche : aucune relance ─────────────────────
  console.log('\n--- 3. SERVICE EN MARCHE : AUCUNE RELANCE ---');
  await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    if (m) m.classList.remove('active');
  });
  await page.waitForTimeout(300);
  appelsStart.length = 0;
  await page.evaluate(() => window.__studioOpen());
  await page.waitForFunction(() => {
    const b = document.getElementById('studio-status');
    return !!b && /Service d[eé]tect[eé]/.test(b.textContent);
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  check('aucun POST /mpt/start quand le service repond',
    appelsStart.length === 0, appelsStart.length + ' appel(s)');

  // ─── 4. Dossier absent ──────────────────────────────────────────────
  console.log("\n--- 4. DOSSIER ABSENT : PAS DE BOUTON QUI ECHOUERAIT ---");
  await page.route('**/mpt/status*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      running: false, port: null, dir: 'C:\\chemin\\absent',
      dossier: 'C:\\chemin\\absent', installe: false, api_bat: false,
      peut_lancer: false, raison: 'no-dir', last_error: '',
    }),
  }));
  await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    if (m) m.classList.remove('active');
  });
  await page.waitForTimeout(300);
  appelsStart.length = 0;
  await page.evaluate(() => window.__studioOpen());
  await page.waitForFunction(() => {
    const b = document.getElementById('studio-status');
    return !!b && /introuvable/i.test(b.textContent);
  }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  e = await lire();
  check('le message dit « introuvable »', /introuvable/i.test(e.texte), e.texte.slice(0, 100));
  check('aucun bouton LANCER', e.start === false);
  check('un bouton RE-DETECTER reste disponible', e.redetect === true);
  check('aucun POST /mpt/start tente en vain', appelsStart.length === 0,
    appelsStart.length + ' appel(s)');

  // ─── 5. Dossier present, api.bat manquant ───────────────────────────
  console.log('\n--- 5. api.bat MANQUANT : MESSAGE DISTINCT ---');
  await page.unroute('**/mpt/status*');
  await page.route('**/mpt/status*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      running: false, port: null, dir: 'C:\\portatif',
      dossier: 'C:\\portatif', installe: true, api_bat: false,
      peut_lancer: false, raison: 'no-bat', last_error: '',
    }),
  }));
  await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    if (m) m.classList.remove('active');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__studioOpen());
  await page.waitForFunction(() => {
    const b = document.getElementById('studio-status');
    return !!b && /api\.bat/.test(b.textContent);
  }, null, { timeout: 10000 }).catch(() => {});
  e = await lire();
  check('le message parle de api.bat', /api\.bat/.test(e.texte), e.texte.slice(0, 120));
  check('toujours aucun bouton LANCER', e.start === false);
  await page.unroute('**/mpt/status*');

  // ─── 6. Le formulaire revient utilisable ────────────────────────────
  console.log('\n--- 6. LE FORMULAIRE RESTE UTILISABLE ---');
  await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    if (m) m.classList.remove('active');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__studioOpen());
  await page.waitForFunction(() => {
    const b = document.getElementById('studio-status');
    return !!b && /Service d[eé]tect[eé]/.test(b.textContent);
  }, null, { timeout: 15000 }).catch(() => {});
  const formVisible = await page.evaluate(() => {
    const f = document.getElementById('studio-form');
    return !!f && getComputedStyle(f).display !== 'none';
  });
  check('le formulaire est visible une fois le service detecte', formVisible);

  console.log('\n--- 7. AUCUNE ERREUR JS ---');
  check('aucune exception de page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  console.log('\n' + '='.repeat(60));
  console.log('VERDICT : ' + ok + '/' + (ok + ko));
  if (ko) console.log('  ' + ko + ' echec(s)');
  console.log('='.repeat(60));

  await browser.close();
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ERREUR BANC :', e); process.exit(2); });
