/* sonde 5bis — que se passe-t-il à l'orbe avec mediaDevices masqué ? */
const path = require('path'), os = require('os'), fs = require('fs');
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const { chromium } = require('playwright');
const BHC = require('../../../tools/bench_common.js');
(async () => {
  const port = await BHC.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_probe5bis_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await BHC.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await BHC.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR: ' + String(e).slice(0, 120)));
  await page.addInitScript(BHC.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await BHC.adminLogin(page, BHC.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {}; st.keys.agnes = 'cle-factice'; st.model = 'agnes:agnes-2.5-flash';
    st.customModels = [];
    window.__toasts = [];
    if (typeof window.toast === 'function') { const ot = window.toast; window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} }; }
    localStorage.setItem('theo_adeodat_dictee', '1');
    try { Object.defineProperty(navigator, 'mediaDevices', { get: () => undefined, configurable: true }); } catch (e) { console.log('shadow KO: ' + e.message); }
  });
  await page.click('#adeodat-orbe');
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => ({
    panneau: document.getElementById('adeodat-pan').style.display,
    toasts: window.__toasts,
    flag: localStorage.getItem('theo_adeodat_dictee'),
    md: typeof navigator.mediaDevices
  }));
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
  BHC.killRelay(relais);
})().catch(e => { console.error(e); process.exit(3); });
