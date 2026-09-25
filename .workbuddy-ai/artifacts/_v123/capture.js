const { chromium } = require('playwright');
const crypto = require('crypto');
const AUTH_HASH = 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';
const DEST = 'C:/Theologicus/.workbuddy-ai/artifacts/_v123/';

(async () => {
  const nav = await chromium.launch({ executablePath: 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe', headless: true });
  const pg = await nav.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1.4 });
  await pg.goto('http://127.0.0.1:8765/THEOLOGICUS.html?banc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(4000);
  const tok = await pg.evaluate(async (H) => {
    const x = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('remember:' + H));
    return Array.from(new Uint8Array(x)).map(v => v.toString(16).padStart(2, '0')).join('');
  }, AUTH_HASH);
  await pg.evaluate(t => localStorage.setItem('theologicus_remember', JSON.stringify({ v: 1, mode: 'admin', exp: Date.now() + 7 * 86400000, tok: t })), tok);
  await pg.reload({ waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(4500);
  await pg.evaluate(() => { const w = document.getElementById('setup-wizard-overlay'); if (w) { w.classList.remove('active'); w.style.display = 'none'; } });
  await pg.waitForTimeout(400);
  await pg.evaluate(() => {
    const m = document.getElementById('studio-modal');
    if (m) m.classList.add('active');
  });
  await pg.waitForTimeout(1200);

  const noms = ['generation', 'llm', 'material', 'publish', 'keys', 'cache'];
  for (const n of noms) {
    await pg.evaluate(x => window.__studioOuvrirOnglet(x), n);
    await pg.waitForTimeout(1400);
    const boite = await pg.evaluate(() => {
      const b = document.querySelector('#studio-modal .modal-box');
      const r = b.getBoundingClientRect();
      return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, 980) };
    });
    await pg.screenshot({ path: DEST + 'studio_' + n + '.png', clip: boite });
    console.log('capture', n, JSON.stringify(boite));
  }
  await nav.close();
})().catch(e => { console.error('ECHEC', e); process.exit(1); });
