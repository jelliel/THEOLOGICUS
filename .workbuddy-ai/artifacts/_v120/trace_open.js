const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  await page.goto('http://127.0.0.1:8765/THEOLOGICUS.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const tok = await page.evaluate(async () => {
    const AUTH_HASH = 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';
    const enc = new TextEncoder().encode('remember:' + AUTH_HASH);
    const b = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
  });
  await page.evaluate(t => localStorage.setItem('theologicus_remember', JSON.stringify({v:1,mode:'admin',exp:Date.now()+7*86400000,tok:t})), tok);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.evaluate(() => { const w=document.getElementById('setup-wizard-overlay'); if(w){w.classList.remove('active'); w.style.display='none';} });

  // Call studioOpen directly and capture any thrown error.
  const res = await page.evaluate(() => {
    const out = {};
    const m = document.getElementById('studio-modal');
    out.modalFound = !!m;
    out.activeBefore = m ? m.classList.contains('active') : null;
    try {
      window.__studioOpen();
      out.callOk = true;
    } catch (e) {
      out.callOk = false;
      out.error = e.name + ': ' + e.message;
      out.stack = (e.stack||'').split('\n').slice(0,4).join(' | ');
    }
    out.activeAfter = m ? m.classList.contains('active') : null;
    out.displayAfter = m ? getComputedStyle(m).display : null;
    out.onclickType = typeof document.getElementById('open-studio-modal').onclick;
    return out;
  });
  console.log(JSON.stringify(res, null, 2));
  console.log('pageerrors:', errs.length, errs.slice(0,3));
  await browser.close();
})();
