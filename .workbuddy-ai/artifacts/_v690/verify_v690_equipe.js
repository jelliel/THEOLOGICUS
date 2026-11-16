/* v690 — PACK D'ÉQUIPE .md + ROUTAGE AUTO.

   Ce banc PROUVE le comportement réel dans Chromium :
     - le module est chargé et le sélecteur expose AUTO ;
     - un paquet .md à frontmatter YAML s'importe dans le store 'agents' ;
     - réimporter n'écrase JAMAIS un agent existant ;
     - l'export produIT un .md réimportable, sans clé ni conversation ;
     - les clés interdites (api_key/token/...) sont REFUSÉES ;
     - le routage local choisit le bon savant selon les mots du message ;
     - le routage est réellement câblé dans sendMessage (prompt capturé).

   Contrôle négatif : sur l'ancien build, window.__v690Equipe n'existe pas
   et le premier test échoue pour la bonne raison (structure absente).
   Aucun scénario ne passe à vide : les agents sont semés avant mesure.
*/
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT || 9790);
function trouverRacine() {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, 'THEOLOGICUS.html'))) return d;
    d = path.dirname(d);
  }
  return path.resolve(process.env.BENCH_ROOT || process.cwd());
}
const RACINE = path.resolve(process.env.BENCH_ROOT || trouverRacine());
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const CHROME = path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'equipe-theologie.md'), 'utf8');

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}

(async () => {
  const APP = path.join(RACINE, 'THEOLOGICUS.html');
  if (!fs.existsSync(APP)) { console.error('[ECHEC] app introuvable : ' + APP); process.exit(1); }

  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split('?')[0]);
    if (p === '/') p = '/THEOLOGICUS.html';
    const fp = path.join(RACINE, p.replace(/^\/+/, ''));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end('404'); }
  });
  await new Promise(r => serveur.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch(Object.assign(
    { args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));

  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto('http://127.0.0.1:' + PORT + '/THEOLOGICUS.html',
    { waitUntil: 'domcontentloaded', timeout: 90000 });

  const attendre = (ms) => page.waitForFunction(
    () => !!(window.__v690Equipe && window.__v690Equipe.choisir),
    null, { timeout: ms }).then(() => true).catch(() => false);
  let pret = await attendre(90000);
  if (!pret) { try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) {} pret = await attendre(90000); }

  ok('module v690 chargé (contrôle négatif : absent sur l’ancien build)', pret);
  if (!pret) {
    console.log('\nBANC V690 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); serveur.close();
    process.exit(1);
  }

  /* ── semis : on vérifie toujours sur quelque chose de réel ── */
  const semes = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('THEOLOGICUS_AI_DB', 5);
      r.onupgradeneeded = e => {
        const d = e.target.result;
        ['chats', 'agents', 'settings', 'global_memory', 'app_config', 'auto_backups', 'learnings'].forEach(s => {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const agents = [
      { id: 'bench-exegete', name: 'Exégète bench', desc: 'analyse du texte', tags: ['grec', 'hébreu'],
        instructions: 'mots grecs et hébreux du verset', primer: 'texte biblique', style: 'detaille' },
      { id: 'bench-islam', name: 'Islamologue bench', desc: 'monde musulman', tags: ['coran', 'hadith'],
        instructions: 'sourates et hadiths', primer: 'islam', style: 'pedagogique' },
      { id: 'bench-patres', name: 'Patristique bench', desc: 'Pères de l’Église', tags: ['pères', 'concile'],
        instructions: 'Augustin et les conciles', primer: 'tradition ancienne', style: 'detaille' }
    ];
    await new Promise((res, rej) => {
      const tx = db.transaction('agents', 'readwrite');
      agents.forEach(a => tx.objectStore('agents').put(a));
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    return agents.length;
  });
  ok('prérequis semés dans le store agents', semes === 3, semes + ' agents');

  const ui = await page.evaluate(() => {
    const sel = document.getElementById('agent-select');
    return {
      option: !!(sel && Array.from(sel.options).some(o => o.value === '__AUTO__')),
      bouton: !!document.getElementById('v690-btn'),
      titre: (document.getElementById('v690-btn') || {}).title || ''
    };
  });
  ok('option AUTO présente dans #agent-select', ui.option);
  ok('bouton ÉQUIPE injecté dans l’en-tête', ui.bouton, ui.titre);

  const parse = await page.evaluate((md) => {
    const api = window.__v690Equipe;
    let p = null, err = '';
    try { p = api.parser(md); } catch (e) { err = String(e.message); }
    let refuse = false;
    try { api.parser('---\napi_key: sk-SECRET\nagents:\n  - id: x\n    name: X\n---'); }
    catch (e) { refuse = /interdite/i.test(String(e.message)); }
    return { err, nom: p && p.name, n: p && p.agents.length, ids: p && p.agents.map(a => a.id), refuse };
  }, FIXTURE);
  ok('frontmatter parsé sans erreur', !parse.err, parse.err || 'ok');
  ok('paquet = 3 agents', parse.n === 3, parse.ids ? parse.ids.join(', ') : '');
  ok('nom du paquet lu', /Équipe d['’]étude/.test(parse.nom || ''), parse.nom);
  ok('clé interdite refusée par le parser', parse.refuse);

  const imp1 = await page.evaluate((md) => window.__v690Equipe.importer(md), FIXTURE);
  ok('import : 3 agents installés', imp1.poses === 3, 'poses=' + imp1.poses + ' ignores=' + imp1.ignores);

  const presents = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('THEOLOGICUS_AI_DB', 5);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const ids = await new Promise((res, rej) => {
      const q = db.transaction('agents', 'readonly').objectStore('agents').getAllKeys();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    db.close();
    return ids.map(String);
  });
  ok('agents du paquet présents dans IndexedDB',
    ['equipe-exegete', 'equipe-islam', 'equipe-patristique'].every(id => presents.indexOf(id) >= 0),
    presents.length + ' agents au total');

  const modif = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('THEOLOGICUS_AI_DB', 5);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const st = db.transaction('agents', 'readwrite').objectStore('agents');
    const a = await new Promise((res, rej) => {
      const q = st.get('equipe-exegete'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    a.desc = 'MARQUEUR-UTILISATEUR';
    await new Promise((res, rej) => {
      const q = st.put(a); q.onsuccess = () => res(); q.onerror = () => rej(q.error);
    });
    db.close();
    return a.desc;
  });
  ok('marqueur utilisateur semé sur un agent', modif === 'MARQUEUR-UTILISATEUR');

  const imp2 = await page.evaluate((md) => window.__v690Equipe.importer(md), FIXTURE);
  const apres = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('THEOLOGICUS_AI_DB', 5);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const a = await new Promise((res, rej) => {
      const q = db.transaction('agents', 'readonly').objectStore('agents').get('equipe-exegete');
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    db.close();
    return a ? a.desc : '';
  });
  ok('réimport : aucun agent écrasé', imp2.poses === 0 && imp2.ignores === 3,
    'poses=' + imp2.poses + ' ignores=' + imp2.ignores);
  ok('modification utilisateur préservée', apres === 'MARQUEUR-UTILISATEUR', apres);

  const exp = await page.evaluate(() => window.__v690Equipe.exporter());
  ok('export = frontmatter YAML', /^---\r?\nname:/.test(exp));
  ok('export contient les agents', /equipe-exegete/.test(exp) && /equipe-islam/.test(exp));
  ok('export sans secret ni conversation',
    !/apiKey|api_key|sk-SECRET|"messages"|"chats"/.test(exp));

  const route = await page.evaluate(async () => {
    const api = window.__v690Equipe;
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('THEOLOGICUS_AI_DB', 5);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const agents = await new Promise((res, rej) => {
      const q = db.transaction('agents', 'readonly').objectStore('agents').getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    db.close();
    /* On isole les agents du paquet : les agents 'bench-*' partagent
       volontairement les mêmes mots-clés et créeraient une égalité. */
    const equipe = agents.filter(a => String(a.id).indexOf('equipe-') === 0);
    const g = t => { const a = api.choisir(t, equipe); return a ? a.id : ''; };
    return {
      grec: g('analyse grec et hébreu du verset'),
      coran: g('que dit le coran et le hadith sur ce point'),
      peres: g('Augustin et les pères au concile'),
      vide: g(''),
      agents: equipe.length
    };
  });
  ok('prérequis routage : agents du paquet présents', route.agents === 3, route.agents + ' agents');
  ok('routage → exégète sur grec/hébreu', route.grec === 'equipe-exegete', route.grec);
  ok('routage → islamologue sur coran/hadith', route.coran === 'equipe-islam', route.coran);
  ok('routage → patristique sur pères/concile', route.peres === 'equipe-patristique', route.peres);
  ok('routage vide = aucun choix', route.vide === '');

  const auto = await page.evaluate(() => {
    const sel = document.getElementById('agent-select');
    sel.value = '__AUTO__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      flag: localStorage.getItem('theologicus_auto_agent_v1'),
      value: sel.value,
      chip: (document.getElementById('v690-chip') || {}).textContent || ''
    };
  });
  ok('sélection AUTO mémorisée', auto.flag === '1' && auto.value === '__AUTO__', auto.flag + ' / ' + auto.value);
  ok('indicateur de routage affiché', /routage auto/.test(auto.chip), auto.chip);

  const prompt = await page.evaluate(async () => {
    const captures = [];
    const os = window.callLLMStream, or_ = window.resolveModelConfig;
    try {
      window.callLLMStream = async function (cfg, msgs) { captures.push(msgs); return 'réponse factice v690'; };
      window.resolveModelConfig = function () { return { apiKey: 'bench-key', model: 'bench' }; };
      state.apiKey = 'bench-key';
      await window.sendMessage('analyse grec et hébreu du verset');
    } catch (e) {
      return { erreur: String(e.message), capture: '' };
    } finally {
      window.callLLMStream = os; window.resolveModelConfig = or_;
    }
    return { erreur: '', capture: captures.length ? String(captures[0][0].content || '') : '' };
  });
  ok('sendMessage atteint le LLM (stub capturé)', !prompt.erreur && !!prompt.capture, prompt.erreur || (prompt.capture.length + ' chars'));
  ok('routage câblé : prompt système = agent choisi', /Exégète/.test(prompt.capture),
    prompt.capture.slice(0, 90).replace(/\s+/g, ' '));

  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  console.log('\nBANC V690 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close(); serveur.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('BANC V690 CRASH : ' + (e && e.stack || e)); process.exit(1); });
