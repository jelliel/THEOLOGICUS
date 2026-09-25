const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/THEOLOGICUS.html?n=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const tok = await page.evaluate(async () => {
    const H='ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';
    const b=await crypto.subtle.digest('SHA-256', new TextEncoder().encode('remember:'+H));
    return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
  });
  await page.evaluate(t=>localStorage.setItem('theologicus_remember',JSON.stringify({v:1,mode:'admin',exp:Date.now()+7*86400000,tok:t})),tok);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForTimeout(4500);
  await page.evaluate(()=>{const w=document.getElementById('setup-wizard-overlay');if(w){w.classList.remove('active');w.style.display='none';}});

  // Count how many times studioOpen actually RUNS (wrap the exposed one).
  await page.evaluate(() => {
    window.__runs = 0;
    const orig = window.__studioOpen;
    window.__studioOpen = function(){ window.__runs++; return orig.apply(this, arguments); };
  });

  await page.click('#open-studio-modal', { timeout: 8000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    studioOpenRuns: window.__runs,
    buttonOnclickIsWrapped: document.getElementById('open-studio-modal').onclick === window.__studioOpen,
    cls: document.getElementById('studio-modal').className,
    modalDisplay: getComputedStyle(document.getElementById('studio-modal')).display,
    statusText: (document.getElementById('studio-status')||{}).textContent
  }));
  console.log(JSON.stringify(r, null, 2));
  console.log('errors:', errs.length, errs.slice(0,3));
  await browser.close();
})();
