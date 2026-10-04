// v446 — Prove-It : les références bibliques des messages s'ouvrent EN LOCAL
// (Bible de Jérusalem embarquée, sans BibleGateway) et « CEC nnn » devient
// cliquable vers le Catéchisme local.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8789;
const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    if (/biblegateway|biblia/i.test(req.url)) { console.log('!!! REQUETE EXTERNE INTERCEPTEE :', req.url); }
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.addInitScript(() => { localStorage.setItem('theologicus_wizard_skipped', '1'); });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // 1. parseur de références (variantes françaises)
    const parsed = await page.evaluate(() => ({
      mt: window.__v446Refs.parseRef('Mt 5:3'),
      gn: window.__v446Refs.parseRef('Gn 5,1'),
      range: window.__v446Refs.parseRef('1 Co 13:4-7'),
      ps: window.__v446Refs.parseRef('Psaume 23(22),1'),
      nom: window.__v446Refs.parseRef('Jean 3:16'),
      invalide: window.__v446Refs.parseRef('Telephones 5:3'),
      ez: window.__v446Refs.parseRef('Ez 1:1'), dn: window.__v446Refs.parseRef('Dn 3:16'), ml: window.__v446Refs.parseRef('Ml 3:10'),
    }));
    ok('« Mt 5:3 » → livre 40', parsed.mt && parsed.mt.livre === 40 && parsed.mt.v1 === 3);
    ok('« Gn 5,1 » (variante virgule) → livre 1', parsed.gn && parsed.gn.livre === 1 && parsed.gn.v1 === 1);
    ok('« 1 Co 13:4-7 » → plage 4-7', parsed.range && parsed.range.livre === 46 && parsed.range.v2 === 7);
    ok('« Psaume 23(22),1 » → Psaumes', parsed.ps && parsed.ps.livre === 19);
    ok('« Jean 3:16 » (nom complet) → 43', parsed.nom && parsed.nom.livre === 43);
    ok('abréviation inconnue → null (pas de fausse popup)', parsed.invalide === null);
    ok('OT décalée après Lm : Ez → 26, Dn → 27, Ml → 39', parsed.ez.livre === 26 && parsed.dn.livre === 27 && parsed.ml.livre === 39, JSON.stringify(parsed.ez));

    // 2. popup locale sur une vraie ancre .bible-ref
    await page.evaluate(() => {
      const cont = document.createElement('div');
      cont.id = 'v446-t2'; cont.className = 'message-content';
      cont.innerHTML = '<a class="bible-ref" href="https://www.biblegateway.com/x" target="_blank">Mt 5:3</a>';
      cont.style.cssText = 'position:fixed;left:60px;top:80px;z-index:2147480000';
      document.body.appendChild(cont);
      window.__v446Refs.applique(cont.parentElement);
    });
    await page.click('.message-content .bible-ref');
    await page.waitForFunction(() => /Heureux (les pauvres|ceux qui ont)/.test((document.getElementById('v446-ref-pop') || {}).textContent || ''), null, { timeout: 15000 });
    const pop1 = await page.evaluate(() => document.getElementById('v446-ref-pop').textContent.slice(0, 120));
    ok('clic Bible → popup LOCALE avec le verset (Jérusalem embarquée)', /Heureux (les pauvres|ceux)/.test(pop1), pop1.slice(0, 70));
    ok('aucune navigation externe déclenchée', (await page.evaluate(() => location.href)).indexOf('127.0.0.1') >= 0);

    /* tests 3 et 4 auto-contenus : clic synthétique + attente interne (l'overlay
   d'auth de l'app intercepte les vrais clics souris ; le gestionnaire v446 est
   un listener document en capture, un .click() synthétique le déclenche pareil). */
    const r3 = await page.evaluate(async () => {
      ['v446-t2'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
      const cont = document.createElement('div');
      cont.id = 'v446-t3';
      cont.innerHTML = '<a class="bible-ref" href="https://www.biblegateway.com/y" target="_blank">Gn 5,1</a>';
      document.body.appendChild(cont);
      document.querySelector('#v446-t3 .bible-ref').click();
      await new Promise(r => setTimeout(r, 2500));
      const p = document.getElementById('v446-ref-pop');
      return p ? p.textContent : 'POP ABSENT';
    });
    ok('« Gn 5,1 » → popup locale (Gn 5,1 BJ : « livret de la descendance »)', /livret de la descend/.test(r3), String(r3).slice(0, 70));

    // 4. CEC : linkification + popup
    const r4 = await page.evaluate(async () => {
      const cont = document.createElement('div');
      cont.className = 'message-content';
      cont.innerHTML = '<p>Le Catéchisme enseigne : CEC 1720 et aussi Catéchisme § 27.</p>';
      document.body.appendChild(cont);
      window.__v446Refs.applique(cont);
      const nb = cont.querySelectorAll('.cec-ref').length;
      const el = cont.querySelector('.cec-ref[data-n="1720"]');
      if (!el) return { nb: nb, txt: 'ANCRE ABSENTE' };
      el.click();
      await new Promise(r => setTimeout(r, 2500));
      const p = document.getElementById('v446-ref-pop');
      return { nb: nb, txt: p ? p.textContent : 'POP ABSENT' };
    });
    ok('« CEC 1720 » et « Catéchisme § 27 » sont linkifiés', r4.nb === 2, 'trouvés : ' + r4.nb);
    ok('clic CEC → popup locale avec le paragraphe', /1720/.test(r4.txt) && r4.txt.length > 60, String(r4.txt).slice(0, 70));

    ok('aucune erreur JavaScript', errors.length === 0);
    console.log(`RESULTAT : ${pass}/13`);
    process.exitCode = pass === 13 ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close(); server.close();
  }
})();
