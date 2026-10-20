const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_p3_" + Date.now()) });
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
    state.messages = [{ role: 'assistant',
      content: 'La notion de Kyrios designe la seigneurie divine.', ts: ts, annotations: [], marks: [] }];
    if (typeof renderMessages === 'function') renderMessages();
    const box = document.getElementById('mc-' + ts);
    const rb = box.getBoundingClientRect();
    const w0 = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const n0 = w0.nextNode();
    const rg0 = document.createRange(); rg0.setStart(n0, 0); rg0.setEnd(n0, 20);
    const rt = rg0.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#4f8ef7', weight: 1.4,
      text: '', svg: '<rect/>',
      x: Math.round(rt.left - rb.left - 14), y: Math.round(rt.top - rb.top - 10),
      w: Math.round(rt.width + 28), h: Math.round(rt.height + 20), note: 'Note du cadre.' }];
    if (window.__applyShapes) window.__applyShapes();
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const edge = fb.querySelector('.fb-edge[data-bord="b"]');
    const re = edge.getBoundingClientRect();
    const cx = re.left + re.width / 2, cy = re.top + re.height / 2;
    const el = document.elementFromPoint(cx, cy);
    const msgEl = fb.closest('.message');
    window.__md = 0;
    document.addEventListener('mousedown', function (e) {
      if (e.target.closest && e.target.closest('.atc-figbox')) window.__md++;
    }, true);
    return {
      edge: re.toJSON(), cx: cx, cy: cy,
      el: el ? (el.tagName + '#' + el.id + '.' + (el.className || '').toString().slice(0, 40)) : null,
      pile: document.elementsFromPoint(cx, cy).slice(0, 6).map(function (x) {
        return x.tagName + '#' + (x.id || '') + '.' + (x.className || '').toString().slice(0, 30)
          + ' pe=' + getComputedStyle(x).pointerEvents + ' z=' + getComputedStyle(x).zIndex;
      }),
      edgePE: getComputedStyle(edge).pointerEvents,
      overflowChaine: (function(){ var o=[], e=fb.parentElement; for(var i=0;i<4&&e;i++){ o.push(e.tagName+'.'+(e.className||'').toString().slice(0,20)+'='+getComputedStyle(e).overflow); e=e.parentElement; } return o; })(),
      boxPE: getComputedStyle(fb).pointerEvents,
      edgePos: getComputedStyle(edge).position,
      msgId: msgEl ? msgEl.dataset.msgId : '(aucun .message)',
      dansMessage: !!msgEl
    };
  }, 1700000000000);
  console.log("prep:", JSON.stringify(info, null, 1));
  await page.mouse.move(info.cx, info.cy);
  await page.mouse.down();
  const apresDown = await page.evaluate(() => ({ md: window.__md, dragging: !!document.querySelector('.atc-figbox.dragging') }));
  await page.mouse.move(info.cx + 30, info.cy + 18, { steps: 6 });
  const pendant = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    return { l: fb.offsetLeft, t: fb.offsetTop, styleLeft: fb.style.left, styleTop: fb.style.top };
  });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const apres = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    return { l: fb.offsetLeft, t: fb.offsetTop, f: state.messages[0].shapes[0] };
  });
  console.log("apresDown:", JSON.stringify(apresDown));
  console.log("pendant:", JSON.stringify(pendant));
  console.log("apres:", JSON.stringify(apres));
  await browser.close();
  relais.child.kill();
})();
