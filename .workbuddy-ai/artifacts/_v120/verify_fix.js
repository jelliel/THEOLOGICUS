const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/THEOLOGICUS.html', { waitUntil: 'domcontentloaded' });
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
  await page.waitForTimeout(400);

  const out = {};
  // REAL user click, not a synthetic call
  await page.click('#open-studio-modal', { timeout: 8000 });
  await page.waitForTimeout(900);
  out.afterRealClick = await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    return { active: m.classList.contains('active'), display: getComputedStyle(m).display };
  });
  // Are the inner fields now reachable?
  out.fieldsReachable = await page.evaluate(() => {
    const ids = ['studio-status','studio-form','studio-subject','studio-script','studio-launch','studio-save'];
    const r = {};
    ids.forEach(i => r[i] = document.getElementById(i) !== null);
    return r;
  });
  out.statusText = await page.evaluate(() => (document.getElementById('studio-status')||{}).textContent || null);
  out.pageErrors = errs.length;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
