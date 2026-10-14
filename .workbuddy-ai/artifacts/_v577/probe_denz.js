/* Sonde Denzinger : les 130 fichiers se parsent-ils dans la page ? */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v577d_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);

  const out = await page.evaluate(async () => {
    const norm = (s) => { try { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { return String(s || '').toLowerCase(); } };
    let okCount = 0, koCount = 0, docsTotal = 0, miseric = 0, exemple = '';
    for (let i = 1; i <= 130; i++) {
      try {
        const r = await fetch('denzinger/ddz_' + ('00' + i).slice(-3) + '.js');
        if (!r.ok) { koCount++; continue; }
        const t = await r.text();
        const kd = t.lastIndexOf('__denzingerWorks[');
        const pos = kd >= 0 ? t.indexOf('=', kd) : t.lastIndexOf('=');
        const j = JSON.parse(t.slice(pos + 1).replace(/;\s*$/, ''));
        okCount++;
        Object.keys(j).forEach(function (k) {
          const w = j[k]; if (!w) return;
          (w.c || []).forEach(function (ch) {
            (ch.s || []).forEach(function (se) {
              (se.p || []).forEach(function (p) {
                if (typeof p === 'string' && p.length > 20) {
                  docsTotal++;
                  if (norm(p).indexOf('miseric') >= 0) {
                    miseric++;
                    if (!exemple) exemple = (w.t || k) + ' §' + (se.t || '') + ' :: ' + p.slice(0, 100);
                  }
                }
              });
            });
          });
        });
      } catch (e) { koCount++; }
    }
    return JSON.stringify({ okCount, koCount, docsTotal, miseric, exemple });
  });
  console.log(out);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}
})().catch(e => { console.error('EXCEPTION :', e); process.exit(2); });
