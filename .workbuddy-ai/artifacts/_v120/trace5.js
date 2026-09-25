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
    const out = {};
    // What does the SAME selector return at call time?
    out.queryResolves = document.querySelector('#studio-modal') !== null;
    out.querySelectorAllLen = document.querySelectorAll('#studio-modal').length;
    // Does the closure see a different $ ?
    out.dollarType = typeof $;
    out.dollarResolves = (typeof $ === 'function') ? ($('studio-modal') !== null) : 'no-$';
    // Run the exact body inline, step by step
    const m = $('studio-modal');
    out.mIsElement = m instanceof Element;
    out.mTag = m ? m.tagName : null;
    out.mId = m ? m.id : null;
    out.mClassBefore = m ? m.className : null;
    if (m) m.classList.add('active');
    out.mClassAfter = m ? m.className : null;
    // Now call the real function and compare identity
    const before = document.querySelector('#studio-modal');
    before.classList.remove('active');
    window.__studioOpen();
    out.sameAfterCall = (document.querySelector('#studio-modal') === before);
    out.classAfterCall = document.querySelector('#studio-modal').className;
    return out;
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})();
