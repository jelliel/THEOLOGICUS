const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route('**/THEOLOGICUS.html', r => r.continue({ headers: { ...r.request().headers(), 'cache-control': 'no-cache', 'pragma': 'no-cache' } }));
  await page.goto('http://127.0.0.1:8765/THEOLOGICUS.html?nocache=' + Date.now(), { waitUntil: 'domcontentloaded' });
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

  // Log every add/remove on the modal with a timestamp, then click.
  await page.evaluate(() => {
    window.__log = [];
    const m = document.getElementById('studio-modal');
    const t0 = performance.now();
    const r = m.classList.remove.bind(m.classList);
    const a = m.classList.add.bind(m.classList);
    m.classList.remove = (...x) => { window.__log.push([Math.round(performance.now()-t0), 'REMOVE', x.join(','), (new Error().stack.split('\n')[3]||'').trim().slice(0,90)]); return r(...x); };
    m.classList.add = (...x) => { window.__log.push([Math.round(performance.now()-t0), 'ADD', x.join(',')]); return a(...x); };
  });

  await page.click('#open-studio-modal', { timeout: 8000 });
  await page.waitForTimeout(900);
  const log = await page.evaluate(() => window.__log);
  console.log('--- class mutations after real click ---');
  log.forEach(l => console.log(JSON.stringify(l)));
  const state = await page.evaluate(() => document.getElementById('studio-modal').className);
  console.log('final class:', state);
  await browser.close();
})();
