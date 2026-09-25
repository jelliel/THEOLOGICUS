const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
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

  // Instrument INSIDE the page: wrap the modal's classList BEFORE any click.
  const before = await page.evaluate(() => {
    const b = document.getElementById('open-studio-modal');
    const m = document.getElementById('studio-modal');
    window.__ev = [];
    // intercept at the prototype level so ANY reference is caught
    const proto = Object.getPrototypeOf(m.classList);
    const origAdd = proto.add;
    proto.add = function(...a){ if (this === m.classList) window.__ev.push('proto.ADD:'+a.join(',')); return origAdd.apply(this, a); };
    return { onclickSource: b.onclick ? b.onclick.toString().replace(/\s+/g,' ').slice(0,200) : 'NULL' };
  });
  console.log('live onclick source:', before.onclickSource);

  await page.click('#open-studio-modal', { timeout: 8000 });
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    events: window.__ev,
    cls: document.getElementById('studio-modal').className,
    display: getComputedStyle(document.getElementById('studio-modal')).display
  }));
  console.log('events:', JSON.stringify(after.events));
  console.log('class:', after.cls, '| display:', after.display);
  await browser.close();
})();
