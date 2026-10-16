const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_bd_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  for (const w of [1920, 1440, 1366, 1280, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const bande = document.querySelector(".header-controls");
      if (!bande) return { err: "bande absente" };
      const bb = bande.getBoundingClientRect();
      const cs = getComputedStyle(bande);
      const btns = Array.prototype.slice.call(bande.querySelectorAll(".hud-btn"));
      /* VISIBLE = dans la boîte du conteneur défilant ET dans celle de son parent rogneur */
      const dedans = [], dehors = [];
      btns.forEach(b => {
        const r2 = b.getBoundingClientRect();
        if (r2.left >= bb.left - 1 && r2.right <= bb.right + 1) dedans.push(b.id || b.textContent.trim().slice(0, 12));
        else dehors.push((b.id || b.textContent.trim().slice(0, 12)) + "@" + Math.round(r2.left));
      });
      return {
        boite: Math.round(bb.left) + "→" + Math.round(bb.right) + " (largeur " + Math.round(bb.width) + ")",
        clientW: bande.clientWidth, scrollW: bande.scrollWidth,
        debordement: bande.scrollWidth - bande.clientWidth,
        defilable: bande.scrollWidth > bande.clientWidth + 1,
        barreVisible: cs.scrollbarWidth,
        n: btns.length, dedans: dedans, dehors: dehors
      };
    });
    console.log("\n=== " + w + " px ===");
    if (r.err) { console.log("  " + r.err); continue; }
    console.log("  bande .header-controls : " + r.boite);
    console.log("  clientW " + r.clientW + " / scrollW " + r.scrollW + "  → débordement " + r.debordement + " px  (défilable=" + r.defilable + ", scrollbar=" + r.barreVisible + ")");
    console.log("  boutons DANS la boîte (" + r.dedans.length + "/" + r.n + ") : " + r.dedans.join(", "));
    console.log("  boutons ROGNÉS     (" + r.dehors.length + "/" + r.n + ") : " + r.dehors.join(", "));
  }
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
