const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_dg_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const desc = el => {
      if (!el) return "—";
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const id = el.id ? "#" + el.id : "";
      const cl = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
      return el.tagName + id + cl + "  pos=" + cs.position + " disp=" + cs.display + " flex=" + cs.flex
        + " w=" + Math.round(b.width) + " x=" + Math.round(b.left) + "→" + Math.round(b.right)
        + " ovf=" + cs.overflowX + " mw=" + cs.minWidth + " ml=" + cs.marginLeft;
    };
    const chaine = el => { const o = []; let n = el; let i = 0; while (n && i++ < 8) { o.push(desc(n)); n = n.parentElement; } return o; };
    const cible = document.getElementById("open-presets");
    const droite = document.getElementById("v6-right-grp");
    /* les enfants directs de la barre, dans l'ordre du DOM */
    const barre = document.getElementById("v6-topbar");
    const enfants = barre ? Array.prototype.map.call(barre.children, c => "  " + desc(c)) : [];
    return {
      chaineOpenPresets: chaine(cible),
      chaineRightGrp: chaine(droite),
      enfantsDeLaBarre: enfants,
      memeParent: cible && droite ? (cible.parentElement === droite.parentElement ? "OUI (même parent)" : "NON") : "?"
    };
  });
  console.log("── chaîne de #open-presets ──");
  r.chaineOpenPresets.forEach(l => console.log("  " + l));
  console.log("\n── chaîne de #v6-right-grp ──");
  r.chaineRightGrp.forEach(l => console.log("  " + l));
  console.log("\n── enfants directs de #v6-topbar ──");
  r.enfantsDeLaBarre.forEach(l => console.log(l));
  console.log("\nMême parent ? " + r.memeParent);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
