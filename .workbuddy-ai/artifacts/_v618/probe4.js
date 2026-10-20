const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v618_p4_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", m => { const t = m.text(); if (/DIAG|mark|Mark/i.test(t)) console.log("CONSOLE:", t.slice(0, 220)); });
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

  // 1) enregistrer une note (comme le banc)
  const a = await page.evaluate(async () => {
    const ts = 1700000000000;
    const f = state.messages[0].shapes[0];
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    window.__theoFigAnnot.ouvrirNoteFigure(fb, f, ts);
    await new Promise(r => setTimeout(r, 120));
    const p = document.getElementById('atc-fig-note');
    p.querySelector('textarea').value = 'note banc';
    p.querySelector('[data-save]').click();
    await new Promise(r => setTimeout(r, 300));
    return { note: f.note, msgIdentique: state.messages[0] === f.__m, nbMsg: state.messages.length };
  });
  console.log("apres note:", JSON.stringify(a));

  // 2) surligner
  const b = await page.evaluate(async () => {
    const ts = 1700000000000;
    const msg0 = state.messages.find(m => m.ts === ts);
    const f = msg0.shapes[0];
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    let err = null;
    try { window.__theoFigAnnot.surlignerFigure(fb, f, ts); } catch (e) { err = String(e && e.message); }
    await new Promise(r => setTimeout(r, 300));
    const msg = state.messages.find(m => m.ts === ts);
    const box = document.getElementById('mc-' + ts);
    return {
      err, nb: (msg.marks || []).length, marks: msg.marks || [],
      memeMsg: msg === msg0,
      span: !!(box && box.querySelector('.atc-mark')),
      spanTxt: box && box.querySelector('.atc-mark') ? box.querySelector('.atc-mark').textContent : null
    };
  });
  console.log("apres surlignage:", JSON.stringify(b, null, 1));
  await browser.close();
  relais.child.kill();
})();
