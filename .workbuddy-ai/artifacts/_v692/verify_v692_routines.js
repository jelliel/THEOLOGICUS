/* v692 — ROUTINES D'ÉTUDE LOCALES.

   Prouve : création PAUSE, déclenchement à échéance dans le bon canal,
   préparation du composeur, règle anti-file (occurrence non consommée
   sautée), consommation à l'envoi, désactivation d'une routine « une fois ».

   Le banc injecte l'horloge via tick(maintenant) : aucune attente murale.
   Contrôle négatif : module absent sur l'ancien build.
*/
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright');
const PORT = Number(process.env.PORT || 9803);
function racine() {
  let d = __dirname;
  for (let i = 0; i < 8; i++) { if (fs.existsSync(path.join(d, 'THEOLOGICUS.html'))) return d; d = path.dirname(d); }
  return path.resolve(process.env.BENCH_ROOT || process.cwd());
}
const R = path.resolve(process.env.BENCH_ROOT || racine());
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const CHROME = path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}

(async () => {
  const APP = path.join(R, 'THEOLOGICUS.html');
  if (!fs.existsSync(APP)) { console.error('app introuvable'); process.exit(1); }
  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split('?')[0]);
    if (p === '/') p = '/THEOLOGICUS.html';
    const fp = path.join(R, p.replace(/^\/+/, ''));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end('404'); }
  });
  await new Promise(r => serveur.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto('http://127.0.0.1:' + PORT + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const attendre = ms => page.waitForFunction(() => !!(window.__v692Routines && window.__v692Routines.tick), null, { timeout: ms }).then(() => true).catch(() => false);
  let pret = await attendre(90000);
  if (!pret) { try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) {} pret = await attendre(90000); }
  ok('module v692 chargé (contrôle négatif : absent sur l’ancien build)', pret);
  if (!pret) {
    console.log('\nBANC V692 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); serveur.close(); process.exit(1);
  }

  const ui = await page.evaluate(() => {
    const b = document.getElementById('v692-btn');
    return {
      bouton: !!b,
      dansArchives: !!(b && b.closest('#archives-panel')),
      pasDansHeader: !(b && b.closest('.header-controls'))
    };
  });
  ok('bouton ROUTINES dans ARCHIVES', ui.bouton && ui.dansArchives);
  ok('aucun ajout dans .header-controls (v597/v598)', ui.pasDansHeader);

  const cree = await page.evaluate(() => window.__v692Routines.creer({
    nom: 'Lecture du jour', message: 'Explique le chapitre du jour', canal: 'grec', type: 'minutes', minutes: 120
  }));
  ok('nouvelle routine EN PAUSE', cree.actif === false, JSON.stringify({ actif: cree.actif, type: cree.type }));
  ok('prochaine échéance calculée', cree.prochaine > Date.now(), String(cree.prochaine));

  const MAINTENANT = Date.now() + 600000;
  const seme = await page.evaluate((t) => {
    const api = window.__v692Routines;
    const r = {
      id: 'rt_bench', nom: 'Routine TEST', message: 'Question préparée par la routine',
      canal: 'grec', type: 'minutes', minutes: 60, actif: true, enCours: false,
      prochaine: t - 1000, dernier: 0
    };
    return api.sauvegarder([r]).then(() => api.lire()).then(l => l.length);
  }, MAINTENANT);
  ok('prérequis : routine échue semée', seme === 1, seme + ' routine(s)');

  const t1 = await page.evaluate((t) => window.__v692Routines.tick(t), MAINTENANT);
  const apres1 = await page.evaluate(() => ({
    compose: document.getElementById('user-input').value,
    canal: state.channel,
    routines: window.__v692Routines.lireMemoire()
  }));
  ok('routine déclenchée', t1.declenchees.indexOf('rt_bench') >= 0, JSON.stringify(t1.declenchees));
  ok('question préparée dans le composeur', apres1.compose === 'Question préparée par la routine', apres1.compose);
  ok('canal de la routine activé', apres1.canal === 'grec', apres1.canal);
  ok('occurrence marquée en cours', apres1.routines[0].enCours === true);
  ok('échéance repoussée', apres1.routines[0].prochaine > MAINTENANT);

  const t2 = await page.evaluate((t) => window.__v692Routines.tick(t), MAINTENANT + 3600000 + 5000);
  ok('file anti-empilement : occurrence sautée', t2.sautees.length === 1 && t2.declenchees.length === 0,
    JSON.stringify({ sautees: t2.sautees, declenchees: t2.declenchees }));

  const consomme = await page.evaluate(async () => {
    const os = window.callLLMStream, or_ = window.resolveModelConfig;
    try {
      window.callLLMStream = async function () { return 'réponse factice v692'; };
      window.resolveModelConfig = function () { return { apiKey: 'bench-key', model: 'bench' }; };
      state.apiKey = 'bench-key';
      await window.sendMessage('Question préparée par la routine');
    } finally { window.callLLMStream = os; window.resolveModelConfig = or_; }
    return window.__v692Routines.lireMemoire()[0].enCours;
  });
  ok('envoi consomme la routine', consomme === false, 'enCours=' + consomme);

  const uneFois = await page.evaluate(async () => {
    const api = window.__v692Routines;
    const t = Date.now() + 900000;
    await api.sauvegarder([{ id: 'rt_once', nom: 'Une fois', message: 'Question unique',
      canal: '', type: 'once', actif: true, enCours: false, prochaine: t - 10, dernier: 0 }]);
    document.getElementById('user-input').value = '';
    const r = await api.tick(t);
    const l = api.lireMemoire();
    return { declenchees: r.declenchees, actif: l[0].actif, compose: document.getElementById('user-input').value };
  });
  ok('routine « une fois » déclenchée puis désactivée',
    uneFois.declenchees.indexOf('rt_once') >= 0 && uneFois.actif === false, JSON.stringify(uneFois));
  ok('question « une fois » préparée', uneFois.compose === 'Question unique', uneFois.compose);

  const modal = await page.evaluate(() => {
    document.getElementById('v692-btn').click();
    return { open: document.getElementById('v692-modal').style.display === 'flex',
             canaux: document.querySelectorAll('#v692-canal option').length };
  });
  ok('modale des routines ouverte avec les canaux', modal.open && modal.canaux >= 4, JSON.stringify(modal));
  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  console.log('\nBANC V692 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close(); serveur.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('CRASH : ' + (e && e.stack || e)); process.exit(1); });
