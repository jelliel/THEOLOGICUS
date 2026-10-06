/* Banc v456 — galerie dans IndexedDB + modèles typés.
   Reproduit la panne réelle : galerie en localStorage proche du quota, puis
   ajout d'une vidéo de 3,6 Mo → « Sauvegarde impossible » et perte au
   rechargement. Vérifie aussi le refus d'un modèle d'IMAGE dans AI VIDEO. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8894; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
const CLE = 'cinema_noir_gallery_v1';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 95)}`); if (cond) pass++; };
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, {'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'});
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 110)));
  // galerie préexistante volumineuse (2 × ~2 Mo) + un modèle d'IMAGE actif
  await page.addInitScript((cle) => {
    try {
      var gros = 'data:video/mp4;base64,' + new Array(2 * 1024 * 1024).join('A');
      var g = [
        { id: 'v1', url: 'https://x/1.mp4', blob: gros, label: 'Vidéo 1', size: 2100000, model: 'agnes-video-v2.0', scene: 's1', timestamp: Date.now() - 5000 },
        { id: 'v2', url: 'https://x/2.mp4', blob: gros, label: 'Vidéo 2', size: 2100000, model: 'agnes-video-v2.0', scene: 's2', timestamp: Date.now() - 4000 }
      ];
      localStorage.setItem(cle, JSON.stringify(g));
      localStorage.setItem('agnes_active_models_v1', JSON.stringify(['agnes-video-v2.0', 'agnes-image-2.5-flash']));
    } catch (e) { window.__seedErr = String(e); }
  }, CLE);
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const api = await page.evaluate(() => window.__v456 ? Object.keys(window.__v456) : null);
  ok('API v456 exposée (typeDe/amorcer/origine/enLocalStorage)', api && api.indexOf('origine') >= 0, JSON.stringify(api));

  const mig = await page.evaluate(() => ({
    origine: window.__v456.origine(),
    enLS: window.__v456.enLocalStorage(),
    miroir: (window.__v456.miroir() || []).length,
    charge: loadGallery().length,
    idb: null
  }));
  ok('galerie migrée vers IndexedDB', mig.origine === 'migre' || mig.origine === 'idb', 'origine=' + mig.origine);
  ok('la clé localStorage a été retirée (quota libéré)', mig.enLS === false, 'enLS=' + mig.enLS);
  ok('les 2 vidéos existantes sont toujours là (miroir + loadGallery)', mig.miroir === 2 && mig.charge === 2, JSON.stringify(mig));

  // la vidéo de 3,6 Mo qui déclenchait « Sauvegarde impossible »
  const ajout = await page.evaluate(async () => {
    var gros = 'data:video/mp4;base64,' + new Array(Math.round(3.6 * 1024 * 1024)).join('B');
    logState.entries = [];
    var id = await addVideoToGallery(gros, 'Vidéo 102621', { model: 'agnes-video-2.5-flash', scene: 'test' });
    await new Promise(r => setTimeout(r, 800));
    var rec = null;
    try { rec = await new Promise(function (res) { var rq = indexedDB.open('cinema_noir_video', 1); rq.onsuccess = function () { var t = rq.result.transaction('kv', 'readonly'), r = t.objectStore('kv').get('gallery-idb'); r.onsuccess = function () { res(r.result ? JSON.parse(r.result).length : 0); }; }; rq.onerror = function () { res('err'); }; }); } catch (e) { rec = 'err'; }
    return {
      id: id,
      enMemoire: loadGallery().length,
      enIDB: rec,
      erreurs: logState.entries.filter(e => e.level === 'error').map(e => e.message),
      sauvegardeImpossible: logState.entries.some(e => /Sauvegarde impossible/.test(e.message || '')),
      enLS: (function () { try { return !!localStorage.getItem('cinema_noir_gallery_v1'); } catch (e) { return null; } })()
    };
  });
  ok('ajout d’une vidéo de 3,6 Mo SANS « Sauvegarde impossible »', ajout.sauvegardeImpossible === false && (ajout.erreurs || []).length === 0, JSON.stringify(ajout.erreurs));
  ok('la nouvelle vidéo est bien dans IndexedDB (3 entrées)', ajout.enIDB === 3 && ajout.enMemoire === 3, JSON.stringify({ idb: ajout.enIDB, mem: ajout.enMemoire }));
  ok('rien n’est écrit dans localStorage (quota préservé)', ajout.enLS === false);

  // elle doit SURVIVRE au rechargement (c'était le cœur du bug)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const apres = await page.evaluate(() => ({ n: loadGallery().length, labels: loadGallery().map(v => v.label), origine: window.__v456.origine() }));
  ok('après rechargement : les 3 vidéos sont toujours là', apres.n === 3 && apres.labels.indexOf('Vidéo 102621') >= 0, JSON.stringify(apres));

  // ── modèles typés ──
  const typ = await page.evaluate(() => ({
    img: window.__v456.typeDe('agnes-image-2.5-flash'),
    vid: window.__v456.typeDe('agnes-video-2.5-flash'),
    txt: window.__v456.typeDe('agnes-2.0-flash'),
    ordre: (loadDetectedAgnes() || []).slice(0, 3).map(m => m.id + ':' + m.kind),
    descVid: (loadDetectedAgnes() || []).filter(m => m.id === 'agnes-video-2.5-flash').map(m => m.desc)[0]
  }));
  ok('typage : image / vidéo / texte reconnus', typ.img === 'image' && typ.vid === 'video' && typ.txt === 'texte', JSON.stringify(typ).slice(0, 80));
  ok('les modèles VIDÉO sont en tête de la grille', /:video/.test(typ.ordre[0] || ''), JSON.stringify(typ.ordre));
  ok('les modèles sont étiquetés (🎬 VIDÉO sur les modèles vidéo)', /VIDÉO/.test(String(typ.descVid)), String(typ.descVid).slice(0, 60));

  const refus = await page.evaluate(() => {
    logState.entries = [];
    state.activeModels = ['agnes-video-v2.0'];
    toggleActiveModel('agnes-image-2.5-flash');
    return { actifs: state.activeModels.slice(), erreurs: logState.entries.filter(e => e.level === 'error').map(e => e.message) };
  });
  ok('activer un modèle d’IMAGE est REFUSÉ (message clair)', refus.actifs.indexOf('agnes-image-2.5-flash') < 0 && refus.erreurs.some(m => /IMAGE/.test(m)), JSON.stringify(refus).slice(0, 110));

  const accepte = await page.evaluate(() => { state.activeModels = []; toggleActiveModel('agnes-video-2.5-flash'); return state.activeModels.slice(); });
  ok('un modèle VIDÉO s’active normalement', accepte.indexOf('agnes-video-2.5-flash') >= 0, JSON.stringify(accepte));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/14`);
  process.exitCode = pass === 14 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
