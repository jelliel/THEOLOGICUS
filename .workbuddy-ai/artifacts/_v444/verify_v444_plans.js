// v444 — Prove-It : les plans de lecture chargent leurs corpus locaux,
// découpent correctement, et la progression persiste (localStorage).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8786;
const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
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
  await page.addInitScript(() => {
    localStorage.setItem('theologicus_wizard_skipped', '1');
    localStorage.setItem('v444_plans_progress', '{}');
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // 1. bouton HUD
    ok('le bouton « 📅 PLANS » existe dans le HUD', await page.evaluate(() => !!document.getElementById('v444-plans-btn')));

    // 2. plan CEC : jour 1 = § 1..8, marquer lu avance et persiste
    await page.evaluate(() => window.__v444Plans.ouvre());
    await page.evaluate(() => window.__v444Plans.ouvrePlan('cec'));
    await page.waitForFunction(() => /Jour 1/.test((document.getElementById('v444-body') || {}).textContent || ''), null, { timeout: 30000 });
    const d1 = await page.evaluate(() => {
      const t = document.getElementById('v444-body').textContent;
      return { total: (t.match(/Jour 1 \/ (\d+)/) || [])[1], p1: t.includes('§ 1'), p8: t.includes('§ 8'), p9: t.includes('§ 9'), nb: (t.match(/8 lecture\(s\)/) || []).length };
    });
    ok('CEC : découpage 8 paragraphes/jour (§ 1 à § 8, pas § 9)', d1.p1 && d1.p8 && !d1.p9 && d1.nb === 1, 'total jours : ' + d1.total);

    await page.evaluate(() => document.querySelector('#v444-body .v444-lu').click());
    await page.waitForTimeout(200);
    const d2 = await page.evaluate(() => {
      const t = document.getElementById('v444-body').textContent;
      const prog = JSON.parse(localStorage.getItem('v444_plans_progress'));
      return { jour2: /Jour 2 \//.test(t), p9: t.includes('§ 9'), fait: prog.cecs || prog.cecs === undefined ? (prog.cecs ? prog.cecs.fait : (prog['cec'] || {}).fait) : null };
    });
    ok('« Marquer lu » avance au jour 2 (§ 9…) et persiste', d2.jour2 && d2.p9 && Array.isArray(d2.fait) && d2.fait.includes(0), JSON.stringify(d2.fait));

    // 3. Psaumes : jour 1 = Psaumes 1..5
    await page.evaluate(() => window.__v444Plans.ouvrePlan('psaumes'));
    await page.waitForFunction(() => /Jour 1/.test((document.getElementById('v444-body') || {}).textContent || ''), null, { timeout: 30000 });
    const d3 = await page.evaluate(() => {
      const t = document.getElementById('v444-body').textContent;
      const labels = Array.from(document.querySelectorAll('#v444-body div')).map(d => d.textContent.trim()).filter(x => /^Psaume \d+$/.test(x));
      return { labels: labels.slice(0, 8), total: (t.match(/\/ ?(\d+) ?j/) || [])[1] };
    });
    ok('Psaumes : 5 psaumes/jour (labels 1 → 5), 30 jours', d3.labels.length === 5 && d3.labels[0] === 'Psaume 1' && d3.labels[4] === 'Psaume 5' && d3.total === '30', JSON.stringify(d3));

    // 4. Coran : jour 1 commence à 1:1, arabe présent
    await page.evaluate(() => window.__v444Plans.ouvrePlan('coran'));
    await page.waitForFunction(() => /Jour 1/.test((document.getElementById('v444-body') || {}).textContent || ''), null, { timeout: 60000 });
    const d4 = await page.evaluate(() => {
      const t = document.getElementById('v444-body').textContent;
      return { v1: t.includes('1:1'), arabe: !!document.querySelector('#v444-body [dir="rtl"]'), total: (t.match(/\/ ?(\d+) ?j/) || [])[1] };
    });
    ok('Coran : jour 1 débute à 1:1, arabe affiché, 30 jours', d4.v1 && d4.arabe && d4.total === '30', JSON.stringify(d4));

    // 5. progression rechargée : le plan CEC rouvre au premier jour NON lu
    await page.evaluate(() => window.__v444Plans.ouvre());
    await page.evaluate(() => window.__v444Plans.ouvrePlan('cec'));
    await page.waitForFunction(() => /Jour 2 \//.test((document.getElementById('v444-body') || {}).textContent || ''), null, { timeout: 30000 });
    ok('à la réouverture, le plan reprend au premier jour non lu (jour 2)', true);

    ok('aucune erreur JavaScript', errors.length === 0);
    console.log(`RESULTAT : ${pass}/7`);
    process.exitCode = pass === 7 ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close(); server.close();
  }
})();
