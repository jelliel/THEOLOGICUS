const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_pl_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  console.log("largeur | HUD visibles | ATTEIGNABLES | recouverts | hors écran");
  for (const w of [1920, 1600, 1440, 1366, 1280, 1152, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const vis = el => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false; const b = el.getBoundingClientRect(); return b.width > 1 && b.height > 1; };
      let vus = 0, atteints = 0, hors = 0;
      const noms = [];
      Array.prototype.forEach.call(document.querySelectorAll(".hud-btn"), b => {
        if (!vis(b)) return;
        vus++;
        const r2 = b.getBoundingClientRect();
        const cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
        if (cx > innerWidth || cy > innerHeight || cx < 0 || cy < 0) { hors++; noms.push((b.id || "?") + "=hors"); return; }
        const d = document.elementFromPoint(cx, cy);
        if (d && (d === b || b.contains(d) || d.contains(b))) atteints++; else noms.push((b.id || "?") + "←" + (d ? (d.id || d.className || d.tagName) : "rien"));
      });
      return { vus, atteints, hors, noms };
    });
    console.log(String(w).padStart(7) + " | " + String(r.vus).padStart(12) + " | " + String(r.atteints).padStart(12) + " | "
      + String(r.vus - r.atteints - r.hors).padStart(10) + " | " + String(r.hors).padStart(10)
      + (r.noms.length ? "   " + r.noms.slice(0, 3).join(", ") : ""));
  }
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
