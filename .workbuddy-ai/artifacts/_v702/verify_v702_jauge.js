/* v702 — JAUGE DES MODÈLES : plus de blocage à 0/48.
   La sonde utilisait le délai générique du transport natif (180 s pour
   une requête non streamée) : l'ouverture de la jauge restait figée.
   On vérifie que CHAQUE sonde pose un délai borné de 8 s et que la
   modale termine toutes les lignes, avec un libellé explicite.
   Contrôle négatif : build pré-v702 → aucun __theoDelaiMs, échec propre. */
const path = require('path');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const HTML = 'file:///' + path.join(RACINE, 'THEOLOGICUS.html').replace(/\\/g, '/');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1500);

  /* Sonde réseau simulée : rejet IMMÉDIAT avec le marqueur qu'utilise le
     transport natif quand son délai expire. Le banc mesure le délai posé
     par probeOne, sans attendre 8 s réelles. */
  await page.evaluate(() => {
    window.__v702Delais = [];
    window.__v702Fetch = window.fetch;
    window.fetch = function (url, init) {
      window.__v702Delais.push({ url: String(url), delai: init && init.__theoDelaiMs });
      var e = new Error('Aucune réponse après 8 s');
      e.delaiExpire = true;
      return Promise.reject(e);
    };
  });
  /* Clic PROGRAMMATIQUE : le bouton peut être masqué par la mise en page,
     mais son listener reste attaché — c'est le chemin réel de l'utilisateur. */
  await page.evaluate(function () {
    var b = document.getElementById('open-gauge-modal');
    if (b) b.click();
  });
  let termine = false;
  try {
    await page.waitForFunction(function () {
      var s = document.getElementById('tj-sum');
      if (!s) return false;
      var m = /^(\d+)\/(\d+)/.exec(s.textContent || '');
      return !!m && Number(m[1]) > 0 && Number(m[1]) === Number(m[2]);
    }, null, { timeout: 30000 });
    termine = true;
  } catch (e) {}

  const r = await page.evaluate(() => {
    var s = document.getElementById('tj-sum');
    var m = /^(\d+)\/(\d+)/.exec((s && s.textContent) || '');
    var lignes = document.querySelectorAll('#tj-list .tj-row');
    var enAttente = 0, delayes = 0, textes = [];
    for (var i = 0; i < lignes.length; i++) {
      if (lignes[i].classList.contains('tj-pend')) enAttente++;
      var t = lignes[i].textContent || '';
      if (t.indexOf('Délai dépassé') !== -1) { delayes++; if (textes.length < 3) textes.push(t.slice(0, 90)); }
    }
    return { ouvert: !!(document.getElementById('tj-modal') && document.getElementById('tj-modal').classList.contains('open')),
             resume: (s && s.textContent) || '', done: m ? Number(m[1]) : -1, total: m ? Number(m[2]) : -1,
             enAttente: enAttente, delayes: delayes, textes: textes,
             sondes: window.__v702Delais.length,
             delais: window.__v702Delais.map(function (x) { return x.delai; }) };
  });
  await page.evaluate(() => { window.fetch = window.__v702Fetch; });

  ok('modale de jauge ouverte', r.ouvert);
  ok('jauge terminée : aucune ligne restée en attente', termine && r.enAttente === 0 && r.done === r.total && r.done > 0, r.resume);
  const bornes = r.delais.length > 0 && r.delais.every(function (d) { return d === 8000; });
  ok('chaque sonde pose un délai borné de 8 s (contrôle négatif : absent avant v702)', bornes,
     JSON.stringify({sondes: r.sondes, valeurs: Array.from(new Set(r.delais))}));
  ok('les délais expirés sont étiquetés explicitement', r.delayes > 0, r.textes.join(' | '));
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  console.log('\nBANC V702 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
