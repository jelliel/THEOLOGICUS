const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_p7_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.setProperty('display', 'none', 'important'); }
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(400);
  const info = await page.evaluate((ts) => {
    state.messages = [{ role: 'assistant', content: 'Alpha beta gamma delta.', ts: ts }];
    if (typeof renderMessages === 'function') renderMessages();
    state.messages[0].shapes = [{ id: 'fg-banc', x: 8, y: 6, w: 120, h: 40, shape: 'Rectangle',
      color: '#4f8ef7', weight: 1.2, text: '', svg: '<rect/>', ancre: { start: 0, end: 5, texte: 'Alpha' } }];
    if (window.__applyShapes) window.__applyShapes();
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    const box = document.getElementById('mc-' + ts);
    const rf = fb.getBoundingClientRect(), rb = box.getBoundingClientRect();
    const eL = fb.querySelector('.fb-edge[data-bord="l"]').getBoundingClientRect();
    const eR = fb.querySelector('.fb-edge[data-bord="r"]').getBoundingClientRect();
    const cxL = eL.left + eL.width / 2, cyL = eL.top + eL.height / 2;
    return {
      rf: rf.toJSON(), rb: rb.toJSON(),
      eL: eL.toJSON(), eR: eR.toJSON(),
      ptL: { x: cxL, y: cyL },
      pileL: document.elementsFromPoint(cxL, cyL).slice(0, 4).map(x => x.tagName + '#' + (x.id || '') + '.' + (x.className || '').toString().slice(0, 30)),
      overflowBox: getComputedStyle(box).overflow,
      styleF: { x: state.messages[0].shapes[0].x, y: state.messages[0].shapes[0].y, w: state.messages[0].shapes[0].w, h: state.messages[0].shapes[0].h }
    };
  }, 1700000000000);
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
  relais.child.kill();
})();
