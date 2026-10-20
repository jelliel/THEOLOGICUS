const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_p6_" + Date.now()) });
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
    const CONT = 'La notion de Kyrios designe la seigneurie divine.\n\n'
      + 'Mais avec une hierarchie d economie : le Pere est la source.\n\n'
      + 'Citation cle : Cyrille d Alexandrie.';
    state.messages = [{ role: 'assistant', content: CONT, ts: ts, annotations: [], marks: [] }];
    if (typeof renderMessages === 'function') renderMessages();
    const box = document.getElementById('mc-' + ts);
    const rb = box.getBoundingClientRect();
    const w0 = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const n0 = w0.nextNode();
    const rg0 = document.createRange(); rg0.setStart(n0, 0); rg0.setEnd(n0, 40);
    const rt = rg0.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#4f8ef7', weight: 1.4,
      text: '', svg: '<rect/>',
      x: Math.round(rt.left - rb.left - 14), y: Math.round(rt.top - rb.top - 10),
      w: Math.round(rt.width + 28), h: Math.round(rt.height + 20), note: 'Note du cadre.' }];
    if (window.__applyShapes) window.__applyShapes();
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const rf = fb.getBoundingClientRect();
    const edgeL = fb.querySelector('.fb-edge[data-bord="l"]');
    const re = edgeL.getBoundingClientRect();
    const cx = re.left + re.width / 2, cy = re.top + re.height / 2;
    const pile = document.elementsFromPoint(cx, cy).slice(0, 5).map(x =>
      x.tagName + '#' + (x.id || '') + '.' + (x.className || '').toString().slice(0, 26)
      + ' pe=' + getComputedStyle(x).pointerEvents);
    return { rf: rf.toJSON(), re: re.toJSON(), cx: cx, cy: cy, pile: pile,
      contentRect: box.getBoundingClientRect().toJSON() };
  }, 1700000000000);
  console.log("EDGE:", JSON.stringify(info, null, 1));

  const info2 = await page.evaluate(() => {
    const CONT = state.messages[0].content;
    const MOT = 'seigneurie divine';
    const st = CONT.indexOf(MOT);
    state.messages[0].annotations = [{ id: 'hl-x', text: MOT, a: 'Commentaire dans le cadre.', start: st, end: st + MOT.length }];
    if (window.__applyHighlights) window.__applyHighlights();
    const hl = document.querySelector('.atc-hl[data-hl-id="hl-x"]');
    return { st: st, span: !!hl, texte: hl ? hl.textContent : null,
      rect: hl ? hl.getBoundingClientRect().toJSON() : null,
      tous: document.querySelectorAll('.atc-hl').length };
  });
  console.log("HL:", JSON.stringify(info2));
  await browser.close();
  relais.child.kill();
})();
