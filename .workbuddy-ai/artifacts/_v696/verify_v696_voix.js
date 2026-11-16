/* v696 — NARRATION AUTOMATIQUE DES RÉPONSES.

   Vérifie que :
     - la case à cocher existe dans PARAMÈTRES → Lecture vocale ;
     - elle est DÉSACTIVÉE par défaut (rien ne change pour un utilisateur) ;
     - le réglage PERSISTE (localStorage) ;
     - narrer() appelle bien le moteur ttsEmission avec le texte nettoyé ;
     - narrerDerniere() ne fait RIEN quand l'auto est off, et parle la
       dernière réponse quand l'auto est on ;
     - sendMessage est bien enfilé (le déclencheur de la narration).

   Contrôle négatif : sur l'ancien build, window.__v696Voix n'existe pas.
*/
const path = require('path'), fs = require('fs'), net = require('net');
const http = require('http'), cp = require('child_process');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const PY = process.env.PY_BIN || 'python';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const CHROME = path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}
function portLibre() {
  return new Promise(res => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const pause = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const port = await portLibre();
  const proxy = cp.spawn(PY, [path.join(RACINE, 'proxy_server.py')], {
    cwd: RACINE,
    env: Object.assign({}, process.env, { THEO_BENCH_PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let sortie = '';
  proxy.stderr.on('data', d => { sortie += String(d); });
  proxy.stdout.on('data', d => { sortie += String(d); });
  let pret = false;
  for (let i = 0; i < 200; i++) {
    try {
      const r = await new Promise((res, rej) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/__theologicus_ping' }, x => {
          let b = ''; x.on('data', d => b += d); x.on('end', () => res({ status: x.statusCode, body: b }));
        });
        req.on('error', rej); req.end();
      });
      if (r.status === 200) { pret = true; break; }
    } catch (e) {}
    await pause(150);
  }
  ok('proxy démarré', pret, pret ? '' : sortie.slice(0, 300));
  if (!pret) { proxy.kill(); console.log('\nBANC V696 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1); }

  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  const charger = async () => {
    await page.goto('http://127.0.0.1:' + port + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  };
  await charger();
  const attendre = ms => page.waitForFunction(() => !!(window.__v696Voix && window.__v696Voix.narrer), null, { timeout: ms }).then(() => true).catch(() => false);
  let moduleOk = await attendre(90000);
  if (!moduleOk) { try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) {} moduleOk = await attendre(90000); }
  ok('module v696 chargé (contrôle négatif : absent sur l’ancien build)', moduleOk);
  if (!moduleOk) {
    await browser.close(); proxy.kill();
    console.log('\nBANC V696 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1);
  }

  const ui = await page.evaluate(() => {
    const c = document.getElementById('tts-auto-lecture');
    return {
      existe: !!c,
      dansPanneauTTS: !!(c && document.querySelector('#settings-panneau-tts #tts-auto-lecture')),
      dansHeader: !!document.querySelector('.header-controls #tts-auto-lecture'),
      coche: c ? c.checked : null,
      stock: (function () { try { return localStorage.getItem('theologicus-tts-auto'); } catch (e) { return null; } })()
    };
  });
  ok('case à cocher présente dans PARAMÈTRES → Lecture vocale', ui.existe && ui.dansPanneauTTS, JSON.stringify(ui));
  ok('rien dans .header-controls (v597/v598)', ui.dansHeader === false);
  ok('DÉSACTIVÉE par défaut', ui.coche === false && ui.stock === null, JSON.stringify(ui));

  const reglage = await page.evaluate(() => {
    const c = document.getElementById('tts-auto-lecture');
    c.checked = true;
    c.dispatchEvent(new Event('change'));
    return {
      stock: localStorage.getItem('theologicus-tts-auto'),
      auto: window.__v696Voix.auto()
    };
  });
  ok('le réglage est enregistré', reglage.stock === '1' && reglage.auto === true, JSON.stringify(reglage));

  /* Le moteur est espionné : on vérifie que la narration APPELLE bien TTS. */
  const spy = async () => page.evaluate(async () => {
    window.__v696Spy = [];
    const orig = window.ttsEmission;
    window.ttsEmission = function (texte, lang) {
      window.__v696Spy.push({ texte: String(texte), lang: String(lang) });
      return true;
    };
    try {
      const r = window.__v696Voix.narrer('Bonjour **le** monde.');
      await new Promise(res => setTimeout(res, 150));
      const appels = window.__v696Spy.slice();
      window.ttsEmission = orig;
      return { r, appels };
    } catch (e) {
      window.ttsEmission = orig;
      return { erreur: String(e && e.message || e), appels: window.__v696Spy.slice() };
    }
  });
  const s1 = await spy();
  ok('narrer() appelle le moteur TTS', !!(s1.r && s1.r.ok) && s1.appels.length >= 1, JSON.stringify(s1.appels));
  ok('le markdown est nettoyé avant la lecture',
    s1.appels.length >= 1 && s1.appels[0].texte.indexOf('**') < 0, JSON.stringify(s1.appels[0] || null));

  const off = await page.evaluate(() => {
    window.__v696Voix.reglerAuto(false);
    window.__v696Spy = [];
    const orig = window.ttsEmission;
    window.ttsEmission = function (t, l) { window.__v696Spy.push(String(t)); return true; };
    let r = null, e = null;
    try { r = window.__v696Voix.narrerDerniere(); } catch (err) { e = String(err); }
    const appels = window.__v696Spy.slice();
    window.ttsEmission = orig;
    return { r, e, appels };
  });
  ok('auto OFF → aucune narration', !!off.r && off.r.ok === false && off.appels.length === 0, JSON.stringify(off));

  const on = await page.evaluate(() => {
    window.__v696Voix.reglerAuto(true);
    window.__v696Spy = [];
    const orig = window.ttsEmission;
    window.ttsEmission = function (t, l) { window.__v696Spy.push(String(t)); return true; };
    let r = null, e = null;
    try {
      state.messages.push({ role: 'assistant', content: 'Réponse de démonstration.', ts: Date.now() });
      r = window.__v696Voix.narrerDerniere();
    } catch (err) { e = String(err && err.message || err); }
    const appels = window.__v696Spy.slice();
    window.ttsEmission = orig;
    return { r, e, appels };
  });
  ok('auto ON → la dernière réponse est narrée',
    !!(on.r && on.r.ok) && on.appels.length >= 1 && on.appels[0].indexOf('démonstration') >= 0,
    JSON.stringify(on));
  ok('narrerDerniere() ne plante pas', !on.e, String(on.e || ''));

  const branche = await page.evaluate(() => ({
    entoure: !!(window.sendMessage && window.sendMessage.__v696),
    narrerDerniere: typeof window.__v696Voix.narrerDerniere === 'function'
  }));
  ok('sendMessage est enfilé (déclencheur de la narration)', branche.entoure === true, JSON.stringify(branche));

  /* Persistance après rechargement. */
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await attendre(60000);
  const apres = await page.evaluate(() => {
    const c = document.getElementById('tts-auto-lecture');
    return { stock: localStorage.getItem('theologicus-tts-auto'), coche: c ? c.checked : null };
  });
  ok('le réglage survit au rechargement', apres.stock === '1' && apres.coche === true, JSON.stringify(apres));

  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  await browser.close(); proxy.kill();
  console.log('\nBANC V696 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('CRASH : ' + (e && e.stack || e)); process.exit(1); });
