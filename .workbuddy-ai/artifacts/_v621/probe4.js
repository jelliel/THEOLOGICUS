const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_p4_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.setProperty('display', 'none', 'important'); }
  });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:400px;top:300px;width:200px;height:100px;pointer-events:none;z-index:50;background:transparent;border:2px solid red';
    const c = document.createElement('div');
    c.id = 'enfant-test';
    c.style.cssText = 'position:absolute;left:0;top:0;width:60px;height:20px;pointer-events:auto;background:blue';
    p.appendChild(c);
    document.body.appendChild(p);
    const pile = document.elementsFromPoint(430, 310).map(x => x.tagName + '#' + (x.id || '') + ' pe=' + getComputedStyle(x).pointerEvents);
    p.remove();
    return { pile: pile.slice(0, 4) };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
  relais.child.kill();
})();
