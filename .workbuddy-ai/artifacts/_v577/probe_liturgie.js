/* Sonde v577 : dissection de calculer() pour deux dates rétives */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v577p_' + Date.now());
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

  const out = await page.evaluate(() => {
    const L = window.__v577Liturgie;
    const repl = (k, v) => (v instanceof Date) ? v.toISOString().slice(0, 10) : v;
    const r1 = L.calculer(new Date(2025, 10, 30, 12, 0, 0));
    const r2 = L.calculer(new Date(2026, 9, 14, 12, 0, 0));
    /* reconstitution des intermédiaires (mêmes formules) */
    function paques(a) {
      const aa = a % 19, b = Math.floor(a / 100), c = a % 100,
        d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
        g = Math.floor((b - f + 1) / 3), h = (19 * aa + b - d - g + 15) % 30,
        i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
        m = Math.floor((aa + 11 * h + 22 * l) / 451),
        mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
      return new Date(a, mois - 1, jour, 12, 0, 0);
    }
    function dimAvantOuLe(d) { const x = new Date(d.getTime()); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }
    function dimProche30Nov(a) {
      const n30 = new Date(a, 11, 30, 12, 0, 0);
      const s1 = dimAvantOuLe(n30), s2 = new Date(s1.getTime() + 7 * 86400000);
      s2.setHours(12, 0, 0, 0);
      return (Math.abs(n30 - s1) <= Math.abs(s2 - n30)) ? s1 : s2;
    }
    const p2025 = paques(2025), p2026 = paques(2026);
    const a1_25 = dimProche30Nov(2025), a1_26 = dimProche30Nov(2026);
    return JSON.stringify({
      r1: JSON.parse(JSON.stringify(r1, repl)),
      r2_semaine: r2.semaine, r2_temps: r2.temps,
      paques2025: p2025.toISOString().slice(0, 10), paques2026: p2026.toISOString().slice(0, 10),
      a1_25: a1_25.toISOString().slice(0, 10), a1_26: a1_26.toISOString().slice(0, 10),
      dimAvant14oct: dimAvantOuLe(new Date(2026, 9, 14, 12, 0, 0)).toISOString().slice(0, 10),
      dayOfWeek14oct2026: new Date(2026, 9, 14, 12, 0, 0).getDay()
    }, null, 1);
  });
  console.log(out);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}
})().catch(e => { console.error('EXCEPTION :', e); process.exit(2); });
