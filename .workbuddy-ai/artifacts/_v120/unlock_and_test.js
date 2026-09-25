const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

  await page.goto('http://127.0.0.1:8765/THEOLOGICUS.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Use the app's OWN hashing to derive the correct token, then store it.
  const tok = await page.evaluate(async () => {
    // sha256hex is in scope of an IIFE; recompute it here with the same recipe.
    const AUTH_HASH = 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';
    const enc = new TextEncoder().encode('remember:' + AUTH_HASH);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  });
  console.log('derived token:', tok);

  await page.evaluate((t) => {
    localStorage.setItem('theologicus_remember', JSON.stringify({
      v: 1, mode: 'admin', exp: Date.now() + 7*86400000, tok: t
    }));
  }, tok);

  // reload so boot-time readRemember() sees it
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  const before = await page.evaluate(() => {
    const b = document.getElementById('open-studio-modal');
    const ov = document.getElementById('auth-overlay');
    const r = b.getBoundingClientRect();
    return {
      overlayDisplay: getComputedStyle(ov).display,
      rememberKept: localStorage.getItem('theologicus_remember') ? 'yes' : 'CLEARED',
      topAtCentre: (document.elementFromPoint(r.left + r.width/2, r.top + r.height/2) || {}).id
    };
  });
  console.log('=== BEFORE CLICK ===', JSON.stringify(before, null, 2));

  // Dismiss the first-run setup wizard if it is up (fresh profile only).
  await page.evaluate(() => {
    const w = document.getElementById('setup-wizard-overlay');
    if (w) w.classList.remove('active');
    document.querySelectorAll('.setup-wizard-overlay, #setup-wizard-overlay').forEach(e => e.style.display = 'none');
  });
  await page.waitForTimeout(500);
  const topNow = await page.evaluate(() => {
    const b = document.getElementById('open-studio-modal');
    const r = b.getBoundingClientRect();
    return (document.elementFromPoint(r.left + r.width/2, r.top + r.height/2) || {}).id;
  });
  console.log('top element at button centre now:', topNow);

  await page.click('#open-studio-modal', { timeout: 8000 });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    return { active: m.classList.contains('active'), display: getComputedStyle(m).display };
  });
  console.log('=== AFTER CLICK ===', JSON.stringify(after));
  console.log('=== ERRORS (' + errors.length + ') ===');
  errors.slice(0,10).forEach(e => console.log(e));
  await browser.close();
})();
