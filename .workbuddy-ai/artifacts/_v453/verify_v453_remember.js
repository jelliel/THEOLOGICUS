/* Banc v453 — « Se souvenir de moi » fiable après une FERMETURE COMPLÈTE.
   Symptôme rapporté : ça tient au rechargement, ça casse à la fermeture.
   Deux causes mesurées : sessionStorage meurt à la fermeture, et
   writeRemember() échoue en silence quand localStorage est plein (l'app y
   range l'image de fond en data URL).
   Deux contextes : A/D/E en fonctionnement normal ; B/C avec un stockage
   qui REFUSE l'écriture (quota) — l'échec est injecté SOUS l'enveloppe du
   module, comme un vrai QuotaExceededError. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8866; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const TOK = '6c0d0ff968f4ed4a7dcf82313d563d051a391eef7d56e99f7ac5aa7aa56e7c75';
const REC = JSON.stringify({ v: 1, mode: 'admin', exp: Date.now() + 7 * 86400000, tok: TOK });
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 90)}`); if (cond) pass++; };
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
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const errors = [];

  /* ── contexte 1 : fonctionnement normal ── */
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx1.newPage();
  page.on('pageerror', e => errors.push(String(e).slice(0, 110)));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const api = await page.evaluate(() => window.__v453Remember ? Object.keys(window.__v453Remember) : null);
  ok('API v453 exposée (synchroniser/cookie/etat/peindre)', api && api.indexOf('etat') >= 0, JSON.stringify(api));

  await page.evaluate((rec) => localStorage.setItem('theologicus_remember', rec), REC);
  const ck = await page.evaluate(() => window.__v453Remember.cookie());
  ok('l’enregistrement part dans le COOKIE dès l’écriture', !!ck && /"v":1/.test(ck), String(ck).slice(0, 50));

  const diag = await page.evaluate(() => { window.__v453Remember.peindre(); const d = document.getElementById('v453-etat'); return d ? d.textContent : null; });
  ok('diagnostic « supports » affiché (localStorage / cookie / session / espace)', !!diag && /cookie/.test(diag) && /espace local/.test(diag), String(diag).slice(0, 100));

  const revoque = await page.evaluate((rec) => {
    localStorage.setItem('theologicus_remember', rec);
    window.__v453Remember.synchroniser();
    if (window.theologicusForgetRemember) window.theologicusForgetRemember();
    window.__v453Remember.synchroniser();
    return { ck: window.__v453Remember.cookie(), ls: localStorage.getItem('theologicus_remember') };
  }, REC);
  ok('« Oublier l’accès mémorisé » efface aussi le cookie', !revoque.ck && !revoque.ls, JSON.stringify(revoque));

  /* ── contexte 2 : le stockage REFUSE (quota plein) ── */
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page2 = await ctx2.newPage();
  page2.on('pageerror', e => errors.push(String(e).slice(0, 110)));
  await page2.addInitScript(() => {
    /* quota PLEIN : sous l'enveloppe du module, l'écriture native échoue */
    var proto = window.Storage.prototype, natif = proto.setItem;
    proto.setItem = function (k, v) {
      if (k === 'theologicus_remember') { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      return natif.call(this, k, v);
    };
  });
  await page2.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(1200);
  const q = await page2.evaluate((rec) => {
    var jete = false;
    try { localStorage.setItem('theologicus_remember', rec); } catch (e) { jete = true; }
    return { jete: jete, cookie: window.__v453Remember.cookie() };
  }, REC);
  ok('quota plein : localStorage refuse l’enregistrement', q.jete === true, JSON.stringify({ jete: q.jete }));
  ok('malgré le quota, le COOKIE porte l’enregistrement', !!q.cookie && /"v":1/.test(q.cookie), String(q.cookie).slice(0, 50));

  /* fermeture complète : sessionStorage disparaît, le cookie reste */
  await page2.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
  await page2.reload({ waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(2200);
  const apres = await page2.evaluate(() => {
    const o = document.getElementById('auth-overlay');
    return {
      overlay: o ? getComputedStyle(o).display : 'ABSENT',
      cache: o ? o.classList.contains('hidden') : null,
      quiz: !!document.querySelector('.quiz-option'),
      session: (() => { try { return sessionStorage.getItem('theologicus_auth'); } catch (e) { return 'err'; } })()
    };
  });
  ok('fermeture complète + quota plein → AUCUN verrou', apres.overlay === 'none' || apres.cache === true, JSON.stringify(apres));
  ok('aucun quiz affiché', apres.quiz === false);
  ok('le jeton de session a été réarmé (chemin sessionStorage d’unlock)', apres.session === 'true', String(apres.session));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/10`);
  process.exitCode = pass === 10 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
