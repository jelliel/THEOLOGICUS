// v440 — Prove-It : les vues ASBĀB AL-NUZŪL et CATÉCHISME paginent —
// l'utilisateur accède à TOUTES les notices (avant : seuls les 40 premiers
// résultats, d'où « il me manque des sourates / paragraphes »).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8780;
const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.addInitScript(() => { localStorage.setItem('theologicus_wizard_skipped', '1'); });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // ── vue ASBĀB ──
    await page.evaluate(() => window.__v170Open('s'));
    await page.waitForFunction(() => /notice\(s\) sur /.test((document.getElementById('v170-status') || {}).textContent || ''), null, { timeout: 60000 });
    const p1 = await page.evaluate(() => ({
      items: document.querySelectorAll('#v170-body button.asb-tr').length,
      barre: (document.getElementById('v170-body').textContent.match(/Page \d+ \/ \d+/) || [''])[0],
      premier: (document.getElementById('v170-body').textContent.match(/Sourate \d+/) || [''])[0],
    }));
    ok('ASBĀB page 1 : 40 notices affichées', p1.items === 40, 'trouvées : ' + p1.items);
    ok('ASBĀB : barre de pagination présente (« ' + p1.barre + ' »)', /^Page 1 \/ \d+$/.test(p1.barre) && parseInt(p1.barre.split('/')[1], 10) > 1);

    // Suivant → page 2, contenu différent
    const premierP1 = p1.premier;
    await page.evaluate(() => document.querySelector('#v170-body .v170-pg[data-page="1"]').click());
    await page.waitForTimeout(300);
    const p2 = await page.evaluate(() => ({
      barre: (document.getElementById('v170-body').textContent.match(/Page \d+ \/ \d+/) || [''])[0],
      premier: (document.getElementById('v170-body').textContent.match(/Sourate \d+/) || [''])[0],
    }));
    ok('ASBĀB page 2 accessible (Suivant) et contenu différent', p2.barre.startsWith('Page 2 /') && p2.premier !== premierP1, p2.barre + ' · ' + premierP1 + ' → ' + p2.premier);

    // Jusqu'à la dernière page (Sourate 112 = dernier fichier du corpus)
    const derniere = await page.evaluate(() => {
      const nb = parseInt((document.getElementById('v170-body').textContent.match(/Page \d+ \/ (\d+)/) || [0, 1])[1], 10);
      return nb;
    });
    for (let i = 2; i < derniere; i++) {
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#v170-body .v170-pg'))
          .find(x => x.textContent.includes('Suivant') && !x.disabled);
        if (b) b.click();
      });
      await page.waitForTimeout(60);
    }
    const pFin = await page.evaluate(() => {
      const t = document.getElementById('v170-body').textContent;
      const sourates = Array.from(t.matchAll(/Sourate (\d+)/g)).map(m => parseInt(m[1], 10));
      return {
        barre: (t.match(/Page \d+ \/ \d+/) || [''])[0],
        maxS: Math.max(...sourates),
        bouton: !!document.querySelector('#v170-body .v170-pg[disabled]'),
      };
    });
    ok('ASBĀB : la dernière page est atteignable (' + pFin.barre + ')', pFin.barre === 'Page ' + derniere + ' / ' + derniere && pFin.bouton);
    ok('ASBĀB : les dernières sourates du corpus (…112) sont affichées', pFin.maxS >= 110, 'sourate max page finale : ' + pFin.maxS);

    // ── vue CATÉCHISME ──
    await page.evaluate(() => window.__v170Open('c'));
    await page.waitForFunction(() => /Catéchisme : \d+ paragraphes/.test((document.getElementById('v170-status') || {}).textContent || ''), null, { timeout: 60000 });
    const c1 = await page.evaluate(() => {
      const st = document.getElementById('v170-status').textContent;
      const body = document.getElementById('v170-body');
      const t = body.textContent;
      const items = Array.from(body.children).filter(d => {
        const h = d.querySelector('div');
        return h && /^§ \d+$/.test((h.textContent || '').trim());
      }).length;
      return { statut: st, barre: (t.match(/Page \d+ \/ \d+/) || [''])[0], items };
    });
    ok('CATÉCHISME : les 2865 paragraphes sont là', c1.statut.includes('2865'), c1.statut.slice(0, 60));
    ok('CATÉCHISME : pagination présente (' + c1.barre + ')', /^Page 1 \/ \d+$/.test(c1.barre) && parseInt(c1.barre.split('/')[1], 10) > 50);
    ok('CATÉCHISME page 1 : 40 paragraphes affichés', c1.items === 40, 'trouvés : ' + c1.items);

    // Filtre → retour page 1, résultat précis
    await page.evaluate(() => {
      const inp = document.getElementById('v170-q');
      inp.value = '2611';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const c2 = await page.evaluate(() => {
      const t = document.getElementById('v170-body').textContent;
      return { v2611: t.includes('§ 2611'), barre: (t.match(/Page \d+ \/ \d+/) || [''])[0] };
    });
    ok('CATÉCHISME : filtre « 2611 » → § 2611 affiché, page réinitialisée', c2.v2611 && (c2.barre === '' || c2.barre.startsWith('Page 1 /')));

    ok('aucune erreur JavaScript', errors.length === 0);
    console.log(`RESULTAT : ${pass}/10`);
    process.exitCode = pass === 10 ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
