/* Diagnostic du panneau : qui est au-dessus de qui ? */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v617_z_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  const info = await page.evaluate(() => {
    const avant = Array.prototype.map.call(document.body.children, d => ({
      tag: d.tagName, id: d.id, cls: (d.className || "").toString().slice(0, 30),
      z: getComputedStyle(d).zIndex, disp: getComputedStyle(d).display
    })).filter(x => x.z !== "auto" || x.id);
    window.__theoDiagAfficher();
    const ov = document.getElementById("theo-diag-reseau");
    return {
      avant,
      panneau: ov ? { z: getComputedStyle(ov).zIndex, disp: getComputedStyle(ov).display,
                      rect: ov.getBoundingClientRect().toJSON() } : null,
      elementAuCentre: (function () {
        const e = document.elementFromPoint(640, 300);
        return e ? (e.tagName + "#" + e.id + "." + (e.className || "").toString().slice(0, 24)) : null;
      })()
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: path.join(__dirname, "diag_z.png") });
  await browser.close();
  relais.child.kill();
})();
