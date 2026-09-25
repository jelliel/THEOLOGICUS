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

  // Instrument: log every class mutation on the studio modal.
  await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    window.__audit = [];
    const origRemove = m.classList.remove.bind(m.classList);
    m.classList.remove = function(...a) {
      window.__audit.push('REMOVE ' + JSON.stringify(a) + ' | ' + new Error().stack.split('\n').slice(1,4).join(' <- '));
      return origRemove(...a);
    };
    const origAdd = m.classList.add.bind(m.classList);
    m.classList.add = function(...a) {
      window.__audit.push('ADD ' + JSON.stringify(a));
      return origAdd(...a);
    };
    // Also watch for attribute rewrites
    const obs = new MutationObserver(muts => {
      muts.forEach(mu => {
        if (mu.attributeName === 'class') window.__audit.push('ATTR class = ' + m.className);
        if (mu.attributeName === 'style') window.__audit.push('ATTR style = ' + m.getAttribute('style'));
      });
    });
    obs.observe(m, { attributes: true, attributeOldValue: true });
  });

  const out = await page.evaluate(() => {
    window.__studioOpen();
    return { active: document.getElementById('studio-modal').classList.contains('active') };
  });
  await page.waitForTimeout(1200);
  const audit = await page.evaluate(() => window.__audit);
  console.log('active right after call:', JSON.stringify(out));
  console.log('--- AUDIT ---');
  audit.forEach(a => console.log(a));
  await browser.close();
})();
