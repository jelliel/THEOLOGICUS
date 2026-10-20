const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_p2_" + Date.now()) });
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
      content: 'La notion de Kyrios designe la seigneurie divine.', ts: ts, annotations: [], marks: [] }];
    if (typeof renderMessages === 'function') renderMessages();
    const box = document.getElementById('mc-' + ts);
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const n = w.nextNode();
    const rng = document.createRange(); rng.setStart(n, 3); rng.setEnd(n, 9);
    const rr = rng.getBoundingClientRect();
    const x = rr.left + 2, y = rr.top + rr.height / 2;
    const el = document.elementFromPoint(x, y);
    const chain = [];
    let e = el;
    for (let i = 0; i < 5 && e; i++) {
      chain.push({ tag: e.tagName, id: e.id || '', cls: (e.className || '').toString().slice(0, 50),
        pe: getComputedStyle(e).pointerEvents, z: getComputedStyle(e).zIndex,
        pos: getComputedStyle(e).position });
      e = e.parentElement;
    }
    return { point: { x: x, y: y }, rr: rr.toJSON(), chain: chain,
      html: el ? el.outerHTML.slice(0, 200) : null };
  }, 1700000000000);
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
  relais.child.kill();
})();
