/* Sonde import : l'événement change atteint-il le handler ? Lequel ? */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v583p_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 120)));
  page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 120)); });
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    window.__toasts = [];
    if (typeof window.toast === 'function') {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
    const inp = document.getElementById('import-agent-input');
    window.__chgCount = 0;
    inp.addEventListener('change', () => { window.__chgCount++; window.__filesLen = inp.files ? inp.files.length : -1; });
    const h = inp.onchange;
    window.__onchangeMarque = !!(h && String(h).indexOf('importé(s) depuis') !== -1);
    window.__onchangeExtrait = h ? String(h).slice(0, 80) : 'AUCUN';
  });

  const f2 = path.join(os.tmpdir(), 'theo_v583p_import.json');
  fs.writeFileSync(f2, JSON.stringify([{ name: 'Agent Sonde', desc: 'sonde', instructions: 'x' }]), 'utf8');
  await page.evaluate(() => { const b = document.getElementById('open-agent-modal'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.setInputFiles('#import-agent-input', f2);
  await page.waitForTimeout(1500);

  const out = await page.evaluate(() => JSON.stringify({
    chgCount: window.__chgCount,
    filesLen: window.__filesLen,
    onchangeMarque: window.__onchangeMarque,
    onchangeExtrait: window.__onchangeExtrait,
    toasts: window.__toasts
  }, null, 1));
  console.log(out);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}
})().catch(e => { console.error('EXCEPTION :', e); process.exit(2); });
