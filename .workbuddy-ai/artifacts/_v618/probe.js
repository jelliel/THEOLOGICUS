const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v618_probe_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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
  });
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    if (!fb) return { fb: false };
    const r = fb.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    const cc = document.getElementById('chat-container');
    return {
      rect: r.toJSON(), cx, cy,
      element: el ? (el.tagName + '#' + el.id + '.' + (el.className || '').toString().slice(0, 40)) : null,
      cc: cc ? { rect: cc.getBoundingClientRect().toJSON(), disp: getComputedStyle(cc).display } : null,
      outils: !!document.querySelector('.fig-tools')
    };
  });
  console.log(JSON.stringify(info, null, 1));
  // essai : mousedown synthétique direct
  const r2 = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    fb.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 140 }));
    return { outils: !!document.querySelector('.fig-tools'),
             boutons: Array.prototype.map.call(document.querySelectorAll('.fig-tools button'), b => b.textContent.trim()) };
  });
  console.log("synthétique :", JSON.stringify(r2));
  await browser.close();
  relais.child.kill();
})();
