const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_mb_" + Date.now()) });
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
    const enfants = Array.prototype.map.call(b.children, (c, i) => {
      const r2 = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return { i: i, qui: c.id || c.tagName, hud: c.classList.contains("hud-btn"),
               w: Math.round(r2.width), x: Math.round(r2.left),
               txt: (c.textContent || "").trim().replace(/\s+/g, " ").slice(0, 26),
               html: (c.innerHTML || "").replace(/\s+/g, " ").slice(0, 60) };
    });
    return { boite: Math.round(bb.left) + "→" + Math.round(bb.right), w: Math.round(bb.width),
             clientW: b.clientWidth, scrollW: b.scrollWidth, n: b.children.length, enfants: enfants };
  });
  console.log("bande : " + r.boite + " (largeur " + r.w + ", clientW " + r.clientW + ", scrollW " + r.scrollW + ") — " + r.n + " enfants");
  r.enfants.forEach(e => console.log("  [" + e.i + "] " + String(e.w).padStart(4) + " px  hud=" + (e.hud ? "OUI" : "non")
    + "  " + String(e.qui).padEnd(20) + "  « " + e.txt + " »"));
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
