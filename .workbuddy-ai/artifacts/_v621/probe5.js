const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_p5_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.setProperty('display', 'none', 'important'); }
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(300);
  const r = await page.evaluate((ts) => {
    state.messages = [{ role: 'assistant', content: 'La notion de Kyrios designe la seigneurie divine.', ts: ts, annotations: [], marks: [] }];
    if (typeof renderMessages === 'function') renderMessages();
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#4f8ef7', weight: 1.4,
      text: '', svg: '<rect/>', x: 20, y: 20, w: 300, h: 80 }];
    if (window.__applyShapes) window.__applyShapes();
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const rf = fb.getBoundingClientRect();
    /* enfant de test AVEC fond */
    const a = document.createElement('div');
    a.id = 'test-fond';
    a.style.cssText = 'position:absolute;left:20px;top:20px;width:40px;height:20px;background:red;pointer-events:auto';
    fb.appendChild(a);
    /* enfant de test SANS fond */
    const b = document.createElement('div');
    b.id = 'test-sans-fond';
    b.style.cssText = 'position:absolute;left:80px;top:20px;width:40px;height:20px;pointer-events:auto';
    fb.appendChild(b);
    const pileA = document.elementsFromPoint(rf.left + 40, rf.top + 30).map(x => x.id || x.className || x.tagName);
    const pileB = document.elementsFromPoint(rf.left + 100, rf.top + 30).map(x => x.id || x.className || x.tagName);
    const cs = getComputedStyle(fb);
    return {
      rf: rf.toJSON(), pileA: pileA.slice(0, 3), pileB: pileB.slice(0, 3),
      box: { pe: cs.pointerEvents, z: cs.zIndex, pos: cs.position, ov: cs.overflow, contain: cs.contain, transform: cs.transform },
      parentPE: getComputedStyle(fb.parentElement).pointerEvents,
      parentOverflow: getComputedStyle(fb.parentElement).overflow
    };
  }, 1700000000000);
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
  relais.child.kill();
})();
