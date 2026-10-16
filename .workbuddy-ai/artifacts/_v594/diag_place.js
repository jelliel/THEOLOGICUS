const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_plc_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const w = el => Math.round(el.getBoundingClientRect().width);
    const barre = document.getElementById("v6-topbar");
    const out = { enfants: [], marque: [], droite: [] };
    Array.prototype.forEach.call(barre.children, c => {
      out.enfants.push({ qui: c.id || (typeof c.className === "string" ? "." + c.className.trim().split(/\s+/)[0] : c.tagName), w: w(c), flex: getComputedStyle(c).flex });
    });
    const b = document.getElementById("v6-brand");
    if (b) Array.prototype.forEach.call(b.children, c => out.marque.push({ qui: c.id || c.tagName + (typeof c.className === "string" && c.className ? "." + c.className.trim().split(/\s+/)[0] : ""), w: w(c), txt: (c.textContent || "").trim().slice(0, 30) }));
    const d = document.getElementById("v6-right-grp");
    if (d) Array.prototype.forEach.call(d.children, c => out.droite.push({ qui: c.id || (typeof c.className === "string" ? "." + c.className.trim().split(/\s+/)[0] : c.tagName), w: w(c), txt: (c.textContent || "").trim().slice(0, 22) }));
    return out;
  });
  console.log("ENFANTS DE LA BARRE (total " + r.enfants.reduce((s, x) => s + x.w, 0) + " px) :");
  r.enfants.forEach(e => console.log("  " + String(e.w).padStart(5) + " px  flex=" + String(e.flex).padEnd(12) + " " + e.qui));
  console.log("\nCONTENU DE #v6-brand :");
  r.marque.forEach(e => console.log("  " + String(e.w).padStart(5) + " px  " + e.qui + "  « " + e.txt + " »"));
  console.log("\nCONTENU DE #v6-right-grp :");
  r.droite.forEach(e => console.log("  " + String(e.w).padStart(5) + " px  " + e.qui + "  « " + e.txt + " »"));
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
