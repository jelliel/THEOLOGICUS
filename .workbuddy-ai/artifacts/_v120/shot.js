const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: CHROME });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  await p.goto('http://127.0.0.1:8765/THEOLOGICUS.html?n=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const tok = await p.evaluate(async () => {
    const H='ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';
    const x=await crypto.subtle.digest('SHA-256', new TextEncoder().encode('remember:'+H));
    return Array.from(new Uint8Array(x)).map(v=>v.toString(16).padStart(2,'0')).join('');
  });
  await p.evaluate(t=>localStorage.setItem('theologicus_remember',JSON.stringify({v:1,mode:'admin',exp:Date.now()+7*86400000,tok:t})),tok);
  await p.reload({waitUntil:'domcontentloaded'});
  await p.waitForTimeout(4500);
  await p.evaluate(()=>{const w=document.getElementById('setup-wizard-overlay');if(w){w.classList.remove('active');w.style.display='none';}});
  await p.click('#open-studio-modal', { timeout: 8000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '_v120/studio_ouvert.png' });
  const box = await p.evaluate(() => {
    const m=document.getElementById('studio-modal');
    const r=m.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(m).display };
  });
  console.log('modal box:', JSON.stringify(box));
  await b.close();
})();
