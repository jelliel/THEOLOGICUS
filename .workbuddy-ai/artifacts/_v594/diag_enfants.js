const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_en_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2800);
  const r = await page.evaluate(() => {
    const b = document.querySelector(".header-controls");
    const bb = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const enfants = Array.prototype.map.call(b.children, (c, i) => {
      const r2 = c.getBoundingClientRect();
      return { i: i, qui: c.id || (typeof c.className === "string" ? "." + c.className.trim().split(/\s+/)[0] : c.tagName),
               x: Math.round(r2.left), r: Math.round(r2.right), w: Math.round(r2.width),
               ml: getComputedStyle(c).marginLeft, mr: getComputedStyle(c).marginRight };
    });
    return { boite: Math.round(bb.left) + "→" + Math.round(bb.right), w: Math.round(bb.width),
             clientW: b.clientWidth, scrollW: b.scrollWidth, gap: cs.gap, display: cs.display, padding: cs.padding, enfants: enfants };
  });
  console.log("bande " + r.boite + " (w " + r.w + ", clientW " + r.clientW + ", scrollW " + r.scrollW + ")");
  console.log("display=" + r.display + "  gap=" + r.gap + "  padding=" + r.padding);
  console.log("enfants (" + r.enfants.length + ") :");
  r.enfants.forEach(e => console.log("  [" + e.i + "] " + String(e.x).padStart(5) + "→" + String(e.r).padStart(5)
    + " w=" + String(e.w).padStart(4) + " ml=" + e.ml + " mr=" + e.mr + "  " + e.qui));
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
