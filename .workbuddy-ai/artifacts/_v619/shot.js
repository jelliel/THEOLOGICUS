const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v619_shot_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const b = Array.prototype.find.call(document.querySelectorAll('button'), x => /UTILISER SANS CL/i.test(x.textContent || ''));
    if (b) b.click();
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
    state.messages = [
      { role: 'user', content: 'Que signifie « Kyrios » ?', ts: 1700000000000 },
      { role: 'assistant', content: "Kyrios est un titre divin appliqué au Christ par communication d'idées (communicatio idiomatum), mais, sans confusion des personnes.", ts: 1700000001000,
        annotations: [{ id: 'hl-demo', text: 'mais, sans confusion des personnes',
          a: "L'expression « sans confusion des personnes » vise l'union hypostatique : deux natures en une seule personne, sans mélange ni séparation (Chalcédoine, 451).",
          start: 0, end: 37 }],
        marks: [] }
    ];
    if (typeof renderMessages === 'function') renderMessages();
    state.messages[1].shapes = [{ id: 'fg-demo', x: 6, y: 2, w: 300, h: 40, shape: 'Rectangle',
      color: '#4f8ef7', weight: 1.6, text: '', svg: '<rect/>',
      ancre: { start: 0, end: 37, texte: 'mais, sans confusion des personnes' } }];
    if (window.__applyShapes) window.__applyShapes();
    if (window.__applyHighlights) window.__applyHighlights();
  });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-demo"]');
    const b = fb.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
  await page.mouse.move(r.x, r.y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, "survol_v619.png") });
  await browser.close();
  relais.child.kill();
  console.log("capture ok");
})();
