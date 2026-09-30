const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8791/THEOLOGICUS.html';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.on('console', m => console.log(`[${m.type()}] ${m.text().slice(0, 200)}`));
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const mdMini = t => {
      let s = t.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      const lines = s.split('\n'); const out = []; let inList = false;
      for (const line of lines) { const m = line.match(/^(\d+)\.\s+(.*)/);
        if (m) { if (!inList) { out.push('<ol>'); inList = true; } out.push('<li>' + m[2] + '</li>'); }
        else { if (inList) { out.push('</ol>'); inList = false; } out.push(line); } }
      if (inList) out.push('</ol>'); return out.join('\n');
    };
    const md = "1. **canonique**\n2. **interprétation ultérieure**";
    const html = mdMini(md);
    const ts = 1234567;
    const c = document.getElementById('chat-container');
    c.innerHTML = '<div class="message assistant"><div class="msg-label">X</div><div class="message-content" id="mc-' + ts + '">' + html + '</div></div>';
    window.__testTs = ts;
    return { chatContainerExists: !!c, mcExists: !!document.getElementById('mc-' + ts), innerHTML: c ? c.innerHTML.slice(0, 200) : null };
  });
  console.log('PROBE', JSON.stringify(info, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });