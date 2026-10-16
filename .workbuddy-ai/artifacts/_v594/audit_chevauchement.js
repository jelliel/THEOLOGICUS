const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_ov_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const sel = ["#open-presets", "#v155-atelier-btn", "#v159-media-btn", "#v6-right-grp", "#v6-topbar", ".v35-lbl", "#v35-archives-top"];
    const out = {};
    sel.forEach(s => {
      const el = document.querySelector(s);
      if (!el) { out[s] = "absent"; return; }
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[s] = { x: Math.round(b.left), r: Math.round(b.right), y: Math.round(b.top), h: Math.round(b.height),
                 pos: cs.position, z: cs.zIndex, ovf: cs.overflow, disp: cs.display, w: Math.round(b.width) };
    });
    /* qui est AU POINT CENTRAL de #open-presets, et à ses bords ? */
    const cible = document.getElementById("open-presets");
    const b = cible.getBoundingClientRect();
    const nom = e => e ? (e.id ? "#" + e.id : (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/)[0] : e.tagName)) : "rien";
    out.sondes = {
      centre: nom(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)),
      gauche: nom(document.elementFromPoint(b.left + 2, b.top + b.height / 2)),
      droite: nom(document.elementFromPoint(b.right - 2, b.top + b.height / 2))
    };
    out.topbarScroll = (() => { const t = document.getElementById("v6-topbar"); return t ? { sw: t.scrollWidth, cw: t.clientWidth, ovf: getComputedStyle(t).overflow } : null; })();
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
