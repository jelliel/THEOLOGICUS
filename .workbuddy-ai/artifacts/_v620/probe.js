const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v620_p_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 200)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(300);
  const info = await page.evaluate((ts) => {
    state.messages = [{
      role: 'assistant',
      content: "Thèse : Kyrios s'applique aux trois Personnes de la Trinité, mais avec une hiérarchie d'économie.",
      ts: ts,
      annotations: [{ id: 'hl-v620', text: "hiérarchie d'économie",
        a: 'Commentaire test.', start: 0, end: 23 }],
      marks: []
    }];
    if (typeof renderMessages === 'function') renderMessages();
    if (window.__applyHighlights) window.__applyHighlights();
    const box = document.getElementById('mc-' + ts);
    const hl = document.querySelector('.atc-hl[data-hl-id="hl-v620"]');
    if (!box || !hl) return { box: !!box, hl: !!hl, html: box ? box.innerHTML.slice(0, 300) : null };
    const rb = box.getBoundingClientRect(), rh = hl.getBoundingClientRect();
    const f = { id: 'fg-sans-ancre', shape: 'Rectangle', color: '#ff00aa', weight: 1.4,
      text: '', svg: '<rect/>',
      x: Math.round(rh.left - rb.left - 10), y: Math.round(rh.top - rb.top - 8),
      w: Math.round(rh.width + 20), h: Math.round(rh.height + 16) };
    state.messages[0].shapes = [f];
    if (window.__applyShapes) window.__applyShapes();
    return { box: true, hl: true, f: f, rb: rb.toJSON(), rh: rh.toJSON() };
  }, 1700000000000);
  console.log("prep:", JSON.stringify(info).slice(0, 600));
  await page.waitForTimeout(400);
  const apres = await page.evaluate((ts) => {
    const fb = document.querySelector('[data-fig-id="fg-sans-ancre"]');
    const hl = document.querySelector('.atc-hl[data-hl-id="hl-v620"]');
    const out = { fb: !!fb, hl: !!hl };
    if (fb) out.rfb = fb.getBoundingClientRect().toJSON();
    if (hl) out.rhl = hl.getBoundingClientRect().toJSON();
    if (fb) out.style = { left: fb.style.left, top: fb.style.top, w: fb.style.width, h: fb.style.height };
    /* appel direct de la fonction interne via l'API publique de test */
    if (fb && hl) {
      const r1 = fb.getBoundingClientRect(), r2 = hl.getBoundingClientRect();
      out.overlap = !(r2.left >= r1.right + 4 || r2.right <= r1.left - 4 || r2.top >= r1.bottom + 4 || r2.bottom <= r1.top - 4);
    }
    return out;
  }, 1700000000000);
  console.log("apres:", JSON.stringify(apres, null, 1));
  await browser.close();
  relais.child.kill();
})();
