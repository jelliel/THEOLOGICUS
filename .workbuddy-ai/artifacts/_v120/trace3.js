const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
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

  const r = await page.evaluate(() => {
    const b = document.getElementById('open-studio-modal');
    const out = {};
    // Is the live onclick the very same function object we exposed?
    out.onclickIsStudioOpen = (b.onclick === window.__studioOpen);
    out.onclickName = b.onclick ? b.onclick.name : 'null';
    out.onclickSourceHead = b.onclick ? b.onclick.toString().slice(0, 120) : 'null';
    // Count listeners by neutering: dispatch a real click and see if modal opens.
    const m = document.getElementById('studio-modal');
    m.classList.remove('active');
    b.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
    out.afterDispatchActive = m.classList.contains('active');
    return out;
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})();
