const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_shot2_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
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
  const cible = await page.evaluate((ts) => {
    state.messages = [{
      role: 'assistant',
      content: 'La notion de Kyrios designe la seigneurie divine.\n\n'
        + 'Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.\n\n'
        + 'Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.',
      ts: ts, annotations: [], marks: []
    }];
    if (typeof renderMessages === 'function') renderMessages();
    const box = document.getElementById('mc-' + ts);
    const rb = box.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#e040fb', weight: 1.8,
      text: '', svg: '<rect/>', x: 4, y: 2, w: Math.round(rb.width - 12), h: 96 }];
    if (window.__applyShapes) window.__applyShapes();
    const w0 = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const n0 = w0.nextNode();
    const rng = document.createRange();
    rng.setStart(n0, 3); rng.setEnd(n0, 26);
    const rr = rng.getBoundingClientRect();
    return { x1: rr.left + 1, x2: rr.right - 1, y: rr.top + rr.height / 2 };
  }, 1700000000000);
  await page.mouse.move(cible.x1, cible.y);
  await page.mouse.down();
  await page.mouse.move(cible.x2, cible.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const etat = await page.evaluate(() => {
    const s = window.getSelection();
    const b = document.getElementById('atc-bubble');
    return { sel: s ? s.toString() : '', bulle: b ? getComputedStyle(b).display : '(absente)' };
  });
  console.log("etat:", JSON.stringify(etat));
  await page.screenshot({ path: path.join(__dirname, "selection_dans_cadre_v621.png") });
  await browser.close();
  relais.child.kill();
  console.log("capture ok");
})();
