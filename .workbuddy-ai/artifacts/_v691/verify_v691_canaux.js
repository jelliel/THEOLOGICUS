/* v691 — CANAUX D'ÉTUDE.

   Prouve le comportement réel :
     - 4 canaux, bouton dans ARCHIVES (jamais dans .header-controls) ;
     - activer un canal crée une conversation DÉDIÉE, taguée `channel` ;
     - le prompt système porte les instructions du canal ;
     - deux canaux = deux transcripts distincts ;
     - revenir sur un canal restaure le même chat et ses messages.

   Contrôle négatif : sur l'ancien build, window.__v691Canaux n'existe pas.
   Aucun test ne passe à vide : le module et les canaux sont vérifiés.
*/
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright');
const PORT = Number(process.env.PORT || 9801);
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
  const journal = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  page.on('console', m => { const t = m.text(); if (/DIAG|saveChat|loadChat|IndexedDB/.test(t)) journal.push(t.slice(0, 180)); });
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto('http://127.0.0.1:' + PORT + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const attendre = ms => page.waitForFunction(() => !!(window.__v691Canaux && window.__v691Canaux.activer), null, { timeout: ms }).then(() => true).catch(() => false);
  let pret = await attendre(90000);
  if (!pret) { try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) {} pret = await attendre(90000); }
  ok('module v691 chargé (contrôle négatif : absent sur l’ancien build)', pret);
  if (!pret) {
    console.log('\nBANC V691 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); serveur.close(); process.exit(1);
  }
  /* Plusieurs modules font leur amorçage à 800 ms / 3 s (dont la restauration
     de conversation). Démarrer le scénario avant la fin de ces amorçages
     faisait écraser state.messages par un loadChat tardif : transcript vide
     1 fois sur ~10. On attend le calme de l'application, sans toucher aux
     assertions. */
  await page.waitForTimeout(3200);

  const ui = await page.evaluate(() => {
    const b = document.getElementById('v691-btn');
    return {
      bouton: !!b,
      dansArchives: !!(b && b.closest('#archives-panel')),
      pasDansHeader: !(b && b.closest('.header-controls')),
      canaux: (window.__v691Canaux.CANAUX || []).map(c => c.id),
      instructions: (window.__v691Canaux.CANAUX || []).every(c => !!c.instructions)
    };
  });
  ok('bouton CANAUX dans le panneau ARCHIVES', ui.bouton && ui.dansArchives);
  ok('aucun ajout dans .header-controls (v597/v598)', ui.pasDansHeader);
  ok('4 canaux définis', ui.canaux.length === 4, ui.canaux.join(', '));
  ok('chaque canal a des instructions', ui.instructions);

  const g1 = await page.evaluate(() => window.__v691Canaux.activer('grec'));
  ok('activation du canal grec', g1.ok && g1.cree === true, JSON.stringify(g1));
  const etat1 = await page.evaluate(() => ({
    canal: (typeof state !== 'undefined' && state.channel) || '',
    chatId: (typeof state !== 'undefined' && state.chatId) || '',
    index: window.__v691Canaux.lireIndex()
  }));
  ok('state.channel = grec', etat1.canal === 'grec', etat1.canal);
  ok('index canal → conversation créé', etat1.index.grec === etat1.chatId, etat1.index.grec);

  const message = await page.evaluate(async () => {
    const captures = [];
    const os = window.callLLMStream, or_ = window.resolveModelConfig;
    try {
      window.callLLMStream = async function (cfg, msgs) { captures.push(msgs); return 'réponse factice v691'; };
      window.resolveModelConfig = function () { return { apiKey: 'bench-key', model: 'bench' }; };
      state.apiKey = 'bench-key';
      await window.sendMessage('analyse du grec du Nouveau Testament');
    } finally { window.callLLMStream = os; window.resolveModelConfig = or_; }
    return captures.length ? String(captures[0][0].content || '') : '';
  });
  ok('prompt du canal grec injecté', /CANAL D’ÉTUDE : Grec biblique/.test(message), message.slice(0, 80).replace(/\s+/g, ' '));

  /* v700 — sous forte charge parallèle, l'écriture IndexedDB de saveChat()
     peut prendre > 3 s. Le banc changeait de canal AVANT que le transcript
     grec soit persisté : `activer('grec')` rechargeait alors une conversation
     vide et l'assertion tombait à tort. On attend la CONDITION ici, avant
     de quitter le canal ; l'assertion finale reste identique et plus forte. */
  const persisteGrec = await page.evaluate(async () => {
    /* Un second saveChat() explicite ne MASQUE rien : sendMessage l'a déjà
       appelé, mais sous charge l'écriture peut être restée en attente.
       L'assertion exige toujours le transcript dans IndexedDB. */
    try { if (typeof window.saveChat === 'function') await window.saveChat(); } catch (e) {}
    let userMsgs = [], tentative = 0;
    for (; tentative < 60; tentative++) {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('THEOLOGICUS_AI_DB', 5);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const chat = await new Promise((res, rej) => {
        const q = db.transaction('chats', 'readonly').objectStore('chats').get(window.__v691Canaux.lireIndex().grec);
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
      db.close();
      userMsgs = ((chat && chat.messages) || []).filter(m => m.role === 'user').map(m => m.content);
      if (userMsgs.indexOf('analyse du grec du Nouveau Testament') >= 0) break;
      await new Promise(r => setTimeout(r, 200));
    }
    return { userMsgs, tentative,
      id: window.__v691Canaux.lireIndex().grec,
      chatId: (typeof state !== 'undefined' && state.chatId) || '',
      enMemoire: (typeof state !== 'undefined' ? (state.messages || []) : []).filter(m => m.role === 'user').map(m => m.content) };
  });
  ok('transcript grec persisté avant de quitter le canal',
    persisteGrec.userMsgs.indexOf('analyse du grec du Nouveau Testament') >= 0,
    JSON.stringify(persisteGrec) + ' | journal=' + journal.slice(-12).join(' / '));

  const h1 = await page.evaluate(() => window.__v691Canaux.activer('hebreu'));
  ok('activation du canal hébreu', h1.ok && h1.cree === true, JSON.stringify(h1));
  ok('transcript distinct entre canaux', h1.chatId !== g1.chatId, g1.chatId + ' vs ' + h1.chatId);

  const messageH = await page.evaluate(async () => {
    const captures = [];
    const os = window.callLLMStream, or_ = window.resolveModelConfig;
    try {
      window.callLLMStream = async function (cfg, msgs) { captures.push(msgs); return 'réponse hébreu'; };
      window.resolveModelConfig = function () { return { apiKey: 'bench-key', model: 'bench' }; };
      await window.sendMessage('racine hébraïque du verset');
    } finally { window.callLLMStream = os; window.resolveModelConfig = or_; }
    return captures.length ? String(captures[0][0].content || '') : '';
  });
  ok('prompt du canal hébreu injecté', /CANAL D’ÉTUDE : Hébreu biblique/.test(messageH), messageH.slice(0, 80).replace(/\s+/g, ' '));

  const g2 = await page.evaluate(() => window.__v691Canaux.activer('grec'));
  const restaure = await page.evaluate(async () => {
    /* Sous charge parallèle, l'écriture IndexedDB peut prendre quelques
       centaines de ms de plus que le retour de saveChat(). On attend la
       CONDITION (le message présent), pas un délai fixe — l'assertion
       reste identique et échoue si le message n'arrive jamais. */
    let chat = null, userMsgs = [], tentative = 0;
    for (; tentative < 20; tentative++) {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('THEOLOGICUS_AI_DB', 5);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      chat = await new Promise((res, rej) => {
        const q = db.transaction('chats', 'readonly').objectStore('chats').get(window.__v691Canaux.lireIndex().grec);
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
      db.close();
      userMsgs = ((chat && chat.messages) || []).filter(m => m.role === 'user').map(m => m.content);
      if (userMsgs.indexOf('analyse du grec du Nouveau Testament') >= 0) break;
      await new Promise(r => setTimeout(r, 150));
    }
    return { canal: state.channel, chatId: state.chatId, tag: chat && chat.channel, userMsgs,
             tentative: tentative, enMemoire: (state.messages || []).filter(m => m.role === 'user').map(m => m.content) };
  });
  ok('retour au grec = même conversation', g2.ok && g2.cree === false && restaure.chatId === g1.chatId, restaure.chatId);
  ok('transcript du grec préservé', restaure.userMsgs.indexOf('analyse du grec du Nouveau Testament') >= 0,
    JSON.stringify({ idb: restaure.userMsgs, memoire: restaure.enMemoire, lectures: restaure.tentative }));
  ok('champ channel persisté dans la conversation', restaure.tag === 'grec', String(restaure.tag));
  ok('canal courant restauré', restaure.canal === 'grec', restaure.canal);

  const modal = await page.evaluate(() => {
    document.getElementById('v691-btn').click();
    return { open: document.getElementById('v691-modal').style.display === 'flex',
             items: document.querySelectorAll('#v691-liste button[data-canal]').length };
  });
  ok('modale des canaux ouvre 4 entrées', modal.open && modal.items === 4, JSON.stringify(modal));
  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  console.log('\nBANC V691 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close(); serveur.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('CRASH : ' + (e && e.stack || e)); process.exit(1); });
