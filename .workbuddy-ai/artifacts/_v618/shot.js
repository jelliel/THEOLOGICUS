const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v618_shot_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1180, height: 860 } });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const b = Array.prototype.find.call(document.querySelectorAll('button'), x => /UTILISER SANS CL/i.test(x.textContent || ''));
    if (b) b.click();
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
    state.messages = [
      { role: 'user', content: 'Explique-moi ce verset.', ts: 1700000000000 },
      { role: 'assistant', content: "Au commencement était la Parole, et la Parole était avec Dieu, et la Parole était Dieu.", ts: 1700000001000 }
    ];
    if (typeof renderMessages === 'function') renderMessages();
    state.messages[1].shapes = [{
      id: 'fg-demo', x: 6, y: 4, w: 210, h: 40, shape: 'Rectangle',
      color: '#ffd54f', weight: 1.6, text: '',
      svg: '<rect x="1" y="1" width="22" height="22"/>',
      note: "« La Parole » = le Logos de Jean 1:1 : le verbe éternel, distinct du Père et pourtant Dieu.",
      ancre: { start: 0, end: 24, texte: 'Au commencement était la' }
    }];
    if (window.__applyShapes) window.__applyShapes();
  });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-demo"]');
    const b = fb.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, "fig_tools_v618.png") });

  await page.evaluate(() => {
    const t = document.querySelector('.fig-tools');
    const btn = Array.prototype.find.call(t.querySelectorAll('button'), b => b.textContent.trim() === '💬');
    btn.click();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, "fig_note_v618.png") });
  await browser.close();
  relais.child.kill();
  console.log("captures ok");
})();
