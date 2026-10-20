const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v618_probe2_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const logs = [];
  page.on("console", m => { if (/fig|tools/i.test(m.text())) logs.push(m.text().slice(0, 120)); });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const b = Array.prototype.find.call(document.querySelectorAll('button'), x => /UTILISER SANS CL/i.test(x.textContent || ''));
    if (b) b.click();
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
    state.messages = [{ role: 'assistant', content: 'Alpha beta gamma delta.', ts: 1700000000000 }];
    if (typeof renderMessages === 'function') renderMessages();
    state.messages[0].shapes = [{ id: 'fg-banc', x: 8, y: 6, w: 120, h: 40, shape: 'Rectangle',
      color: '#4f8ef7', weight: 1.2, text: '', svg: '<rect/>', ancre: { start: 0, end: 5, texte: 'Alpha' } }];
    if (window.__applyShapes) window.__applyShapes();
    window.__mousedownVu = 0;
    document.addEventListener('mousedown', function (e) {
      if (e.target.closest && e.target.closest('.atc-figbox')) window.__mousedownVu++;
    }, true);
  });
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    const r = fb.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  const apresDown = await page.evaluate(() => ({ outils: !!document.querySelector('.fig-tools'), vu: window.__mousedownVu }));
  await page.mouse.up();
  const apresUp = await page.evaluate(() => ({ outils: !!document.querySelector('.fig-tools'), vu: window.__mousedownVu }));
  await page.waitForTimeout(400);
  const apres400 = await page.evaluate(() => ({ outils: !!document.querySelector('.fig-tools'), vu: window.__mousedownVu,
    fb: !!document.querySelector('[data-fig-id="fg-banc"]') }));
  console.log(JSON.stringify({ apresDown, apresUp, apres400, logs }, null, 1));
  await browser.close();
  relais.child.kill();
})();
