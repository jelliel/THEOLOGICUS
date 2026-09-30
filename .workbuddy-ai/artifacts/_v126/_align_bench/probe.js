const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.on('console', m => console.log(`[${m.type()}] ${m.text().slice(0,300)}`));
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  await page.goto('http://127.0.0.1:8791/THEOLOGICUS.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => ({
    hasState: typeof window.state,
    hasOnAddToChat: typeof window.onAddToChat,
    hasRenderMessages: typeof window.renderMessages,
    hasApplyHighlights: typeof window.applyHighlights,
    hasMdToHtml: typeof window.mdToHtml,
    documentReady: document.readyState,
    scriptCount: document.querySelectorAll('script').length,
    msgCount: (window.state && window.state.messages) ? window.state.messages.length : 'no-state',
  }));
  console.log('PROBE', JSON.stringify(info));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });