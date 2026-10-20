const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_p_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(300);
  const info = await page.evaluate((ts) => {
    state.messages = [{ role: 'assistant',
      content: 'La notion de Kyrios designe la seigneurie divine, mais avec une hierarchie d economie.',
      ts: ts, annotations: [], marks: [] }];
    if (typeof renderMessages === 'function') renderMessages();
    const box = document.getElementById('mc-' + ts);
    const rb = box.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#4f8ef7', weight: 1.4,
      text: '', svg: '<rect/>', x: 29, y: 0, w: Math.round(rb.width * 0.9), h: 70, note: 'Note du cadre.' }];
    if (window.__applyShapes) window.__applyShapes();
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const rf = fb.getBoundingClientRect();
    const edge = fb.querySelector('.fb-edge[data-bord="t"]');
    const re = edge.getBoundingClientRect();
    const cse = getComputedStyle(edge);
    const elEdge = document.elementFromPoint(re.left + re.width / 2, re.top + re.height / 2);
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const n = w.nextNode();
    const rng = document.createRange(); rng.setStart(n, 3); rng.setEnd(n, 9);
    const rr = rng.getBoundingClientRect();
    return {
      rb: rb.toJSON(), rf: rf.toJSON(), re: re.toJSON(),
      peEdge: cse.pointerEvents, peBox: getComputedStyle(fb).pointerEvents,
      elEdge: elEdge ? (elEdge.tagName + '.' + (elEdge.className || '').toString().slice(0, 40)) : null,
      texte: rr.toJSON(),
      dedans: rr.left > rf.left && rr.right < rf.right && rr.top > rf.top && rr.bottom < rf.bottom
    };
  }, 1700000000000);
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
  relais.child.kill();
})();
