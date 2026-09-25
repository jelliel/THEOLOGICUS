const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

  await page.goto('http://127.0.0.1:8765/THEOLOGICUS.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  const info = await page.evaluate(() => {
    const b = document.getElementById('open-studio-modal');
    const m = document.getElementById('studio-modal');
    return {
      buttonExists: !!b,
      buttonVisible: b ? !!(b.offsetWidth || b.offsetHeight) : false,
      onclickType: b ? typeof b.onclick : 'n/a',
      modalExists: !!m,
      modalActiveBefore: m ? m.classList.contains('active') : 'n/a',
      hasStudioOpen: typeof window.__studioOpen,
      studioOpenFn: typeof (window.studioOpen),
      rect: b ? JSON.stringify(b.getBoundingClientRect()) : 'n/a',
      topEl: b ? (document.elementFromPoint(
        b.getBoundingClientRect().left + b.getBoundingClientRect().width/2,
        b.getBoundingClientRect().top + b.getBoundingClientRect().height/2) || {}).id || 'none' : 'n/a'
    };
  });
  console.log('--- BEFORE CLICK ---');
  console.log(JSON.stringify(info, null, 2));

  // click via JS-defined handler (real click)
  try {
    await page.click('#open-studio-modal', { timeout: 5000 });
    console.log('real click: OK');
  } catch (e) {
    console.log('real click FAILED: ' + e.message.split('\n')[0]);
  }
  await page.waitForTimeout(800);

  const after = await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    const cs = m ? getComputedStyle(m) : null;
    return {
      modalExists: !!m,
      modalActiveAfter: m ? m.classList.contains('active') : 'n/a',
      display: cs ? cs.display : 'n/a',
      visibility: cs ? cs.visibility : 'n/a',
      opacity: cs ? cs.opacity : 'n/a',
      zIndex: cs ? cs.zIndex : 'n/a'
    };
  });
  console.log('--- AFTER CLICK ---');
  console.log(JSON.stringify(after, null, 2));
  console.log('--- ERRORS (' + errors.length + ') ---');
  errors.slice(0, 12).forEach(e => console.log(e));

  await browser.close();
})();
