const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v618_p3_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", m => console.log("CONSOLE:", m.text().slice(0, 200)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
    state.messages = [{ role: 'assistant', content: 'Alpha beta gamma delta.', ts: 1700000000000 }];
    if (typeof renderMessages === 'function') renderMessages();
    state.messages[0].shapes = [{ id: 'fg-banc', x: 8, y: 6, w: 120, h: 40, shape: 'Rectangle',
      color: '#4f8ef7', weight: 1.2, text: '', svg: '<rect/>', ancre: { start: 0, end: 5, texte: 'Alpha' } }];
    if (window.__applyShapes) window.__applyShapes();
  });
  await page.waitForTimeout(500);
  const r = await page.evaluate(async () => {
    const ts = 1700000000000;
    const f = state.messages[0].shapes[0];
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    let err = null;
    try { window.__theoFigAnnot.surlignerFigure(fb, f, ts); } catch (e) { err = String(e && e.message); }
    const msg = state.messages.find(m => m.ts === ts);
    return {
      err: err,
      nbMarks: (msg.marks || []).length,
      marks: msg.marks || [],
      memeObjet: msg === state.messages[0],
      ancre: f.ancre
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
  relais.child.kill();
})();
