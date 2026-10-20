const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v622_p_" + Date.now()) });
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
    const CONT = 'Alpha beta gamma delta epsilon.';
    const iA = CONT.indexOf('Alpha'), iB = CONT.indexOf('beta');
    state.messages = [{ role: 'assistant', content: CONT, ts: ts, marks: [],
      annotations: [
        { id: 'hl-A', text: 'Alpha', a: 'COMMENTAIRE A', start: iA, end: iA + 5 },
        { id: 'hl-B', text: 'beta', a: 'COMMENTAIRE B', start: iB, end: iB + 4 }
      ] }];
    if (typeof renderMessages === 'function') renderMessages();
    if (window.__applyHighlights) window.__applyHighlights();
    const box = document.getElementById('mc-' + ts);
    const rb = box.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-deux', shape: 'Rectangle', color: '#4f8ef7',
      weight: 1.6, text: '', svg: '<rect/>', x: 2, y: 2, w: Math.round(rb.width - 10), h: 90, note: 'NOTE DU CADRE' }];
    if (window.__applyShapes) window.__applyShapes();
    const a = document.querySelector('.atc-hl[data-hl-id="hl-A"]');
    const b = document.querySelector('.atc-hl[data-hl-id="hl-B"]');
    const fb = document.querySelector('[data-fig-id="fg-deux"]');
    const ra = a && a.getBoundingClientRect(), rb2 = b && b.getBoundingClientRect(), rf = fb && fb.getBoundingClientRect();
    const ptB = rb2 ? { x: rb2.left + rb2.width / 2, y: rb2.top + rb2.height / 2 } : null;
    const ptVide = rf ? { x: rf.left + rf.width / 2, y: rf.top + 10 } : null;
    const pileB = ptB ? document.elementsFromPoint(ptB.x, ptB.y).slice(0, 4).map(x => x.tagName + '.' + (x.className || '').toString().slice(0, 26)) : [];
    const pileV = ptVide ? document.elementsFromPoint(ptVide.x, ptVide.y).slice(0, 4).map(x => x.tagName + '.' + (x.className || '').toString().slice(0, 26)) : [];
    return { ra: ra && ra.toJSON(), rb: rb2 && rb2.toJSON(), rf: rf && rf.toJSON(), ptB, ptVide, pileB, pileV,
             htmlB: b ? b.outerHTML.slice(0, 120) : null };
  }, 1700000000000);
  console.log(JSON.stringify({ptB: info.ptB, ptVide: info.ptVide, pileB: info.pileB, pileV: info.pileV}, null, 1));
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  await page.mouse.move(info.ptB.x, info.ptB.y); await page.waitForTimeout(400);
  const t1 = await page.evaluate(() => {
    const t = document.getElementById('atc-tip');
    return { present: !!t, texte: t ? t.textContent.slice(0, 80) : '', hl: !!document.querySelector('.atc-hl[data-hl-id="hl-B"]') };
  });
  console.log("survol B:", JSON.stringify(t1));
  await page.evaluate(() => { const t = document.getElementById('atc-tip'); if (t) t.remove(); });
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  await page.mouse.move(info.ptVide.x, info.ptVide.y); await page.waitForTimeout(400);
  const t2 = await page.evaluate(() => {
    const t = document.getElementById('atc-tip');
    return { present: !!t, texte: t ? t.textContent.slice(0, 80) : '' };
  });
  console.log("survol vide:", JSON.stringify(t2));
  console.log("INSTALLE:", await page.evaluate(() => ({ inst: window.__mvFigInstalle || 0, compteur: window.__mvFigCompteur || 0, raison: window.__mvFigRaison || "", trace: window.__mvFigTrace || "", close: window.__closeTrace || "" })));
  await browser.close();
  relais.child.kill();
})();
