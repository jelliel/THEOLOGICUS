// Banc v120 — le bouton STUDIO VIDÉO doit RÉELLEMENT ouvrir le modal.
//
// Ce banc existe parce que le défaut d'origine était invisible : `$` est
// `document.querySelector`, et le bloc studio l'appelait sans `#`
// (`$("studio-modal")`). `querySelector("studio-modal")` cherche une BALISE de
// ce nom, ne trouve rien, rend `null` — et `if (m)` saute en silence. Aucune
// exception, aucun message : le bouton semblait simplement mort.
//
// Leçon de méthode : un selecteur faux ne produit AUCUNE erreur. Un banc qui se
// contente de vérifier « le code s'exécute sans lever » passe au vert sur un
// bouton qui ne fait rien. Il faut donc OBSERVER L'ÉTAT APRÈS LE CLIC.
//
// Usage :
//   node verify_studio.js            (serveur attendu sur 127.0.0.1:8765)
//   node verify_studio.js <port>

const { chromium } = require('playwright');

const PORT = process.argv[2] || '8765';
const CHROME_CANDIDATES = [
  'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
  'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
];
const fs = require('fs');
const CHROME = CHROME_CANDIDATES.find(p => fs.existsSync(p));

// L'empreinte de mot de passe de l'app (AUTH_HASH) : sert uniquement à forger
// le jeton de déverrouillage, comme le fait l'app elle-même.
const AUTH_HASH = 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';

let ok = 0, ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok++; console.log('  [OK] ' + nom); }
  else { ko++; console.log('  [X ] ' + nom + (detail ? '  -> ' + detail : '')); }
};

(async () => {
  console.log('=== Banc STUDIO VIDÉO — port ' + PORT + ' ===\n');
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));

  await page.goto('http://127.0.0.1:' + PORT + '/THEOLOGICUS.html?banc=' + Date.now(),
    { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Déverrouillage : le profil de banc est neuf, l'écran de verrouillage est
  // donc légitimement affiché. On forge le même jeton que l'app.
  const tok = await page.evaluate(async (H) => {
    const x = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('remember:' + H));
    return Array.from(new Uint8Array(x)).map(v => v.toString(16).padStart(2, '0')).join('');
  }, AUTH_HASH);
  await page.evaluate(t => localStorage.setItem('theologicus_remember', JSON.stringify({
    v: 1, mode: 'admin', exp: Date.now() + 7 * 86400000, tok: t
  })), tok);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  // Le profil neuf déclenche l'assistant de premier lancement (setup wizard).
  await page.evaluate(() => {
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.display = 'none'; }
  });
  await page.waitForTimeout(400);

  console.log('--- ÉTAT AVANT CLIC ---');
  const avant = await page.evaluate(() => {
    const b = document.getElementById('open-studio-modal');
    const m = document.getElementById('studio-modal');
    return {
      bouton: !!b,
      modalPresent: !!m,
      actifAvant: m ? m.classList.contains('active') : null,
      handler: b ? typeof b.onclick : 'absent',
    };
  });
  check('le bouton existe', avant.bouton);
  check('le modal existe dans le DOM', avant.modalPresent);
  check('le modal est fermé au départ', avant.actifAvant === false);
  check('un handler est bien lié au bouton', avant.handler === 'function', avant.handler);

  // Le sélecteur fautif rend null : on le prouve explicitement. C'est le
  // contrôle qui aurait attrapé le défaut d'origine.
  const selecteur = await page.evaluate(() => ({
    sansDiese: document.querySelector('studio-modal') === null,
    avecDiese: document.querySelector('#studio-modal') !== null,
  }));
  check('querySelector("studio-modal") rend bien null (piège du #)',
    selecteur.sansDiese, 'sans # a résolu quelque chose !');
  check('querySelector("#studio-modal") résout', selecteur.avecDiese);

  console.log('\n--- CLIC RÉEL ---');
  let clicOk = true;
  try {
    await page.click('#open-studio-modal', { timeout: 8000 });
  } catch (e) { clicOk = false; }
  check('le clic atteint le bouton', clicOk);
  await page.waitForTimeout(1200);

  // LE contrôle qui compte : l'état APRÈS le clic, pas « pas d'exception ».
  const apres = await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    return {
      actif: m.classList.contains('active'),
      display: getComputedStyle(m).display,
      largeur: Math.round(m.getBoundingClientRect().width),
    };
  });
  check('le modal porte la classe active', apres.actif);
  check('le modal est VISIBLE (display:flex)', apres.display === 'flex', apres.display);
  check('le modal a une largeur réelle', apres.largeur > 200, apres.largeur + ' px');

  console.log('\n--- CHAMPS INTERNES UTILISABLES ---');
  const champs = await page.evaluate(() => {
    // Tous les identifiants que le bloc studio manipule. Si un seul manque, la
    // fonctionnalité est morte (c'était le cas des 32 appels fautifs).
    const ids = ['studio-status', 'studio-form', 'studio-subject', 'studio-script',
      'studio-aspect', 'studio-clip', 'studio-count', 'studio-concat', 'studio-rate',
      'studio-volume', 'studio-bgm-name', 'studio-voice', 'studio-lang-sel', 'studio-source',
      'studio-subpos', 'studio-fontsize', 'studio-color', 'studio-stroke',
      'studio-subtitles', 'studio-launch', 'studio-save', 'studio-log'];
    const manquants = ids.filter(i => !document.getElementById(i));
    return { total: ids.length, manquants };
  });
  check('les ' + champs.total + ' champs du studio existent',
    champs.manquants.length === 0, 'manquants: ' + champs.manquants.join(', '));

  console.log('\n--- STATUT DU SERVICE ---');
  const statut = await page.evaluate(() =>
    (document.getElementById('studio-status') || {}).textContent || '');
  check('la zone de statut a été remplie (le code interne tourne)',
    statut.trim().length > 10, JSON.stringify(statut.slice(0, 60)));

  console.log('\n--- FERMETURE ---');
  await page.click('#close-studio-modal', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  const ferme = await page.evaluate(() =>
    getComputedStyle(document.getElementById('studio-modal')).display);
  check('la croix referme le modal', ferme === 'none', ferme);

  check('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  console.log('\n============================');
  console.log('  RESULTAT : ' + ok + '/' + (ok + ko));
  console.log('============================');
  await browser.close();
  process.exit(ko === 0 ? 0 : 1);
})().catch(e => { console.error('Echec du banc :', e.message); process.exit(1); });
