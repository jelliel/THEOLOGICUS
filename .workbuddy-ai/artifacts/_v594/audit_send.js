/* Contraste RÉEL du bouton SEND : son fond est une couleur UNIE surmontée d'un
   dégradé translucide. Composer seulement la couleur unie donne le MEILLEUR
   cas ; il faut composer AUSSI les arrêts du dégradé sur cette couleur et
   retenir le PIRE. (Le skill avertit qu'un dégradé n'est pas une couleur.) */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_send_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const r = await page.evaluate(() => {
    const rgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(Number); return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 }; };
    const lum = c => { const f = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const compose = (dessus, dessous) => [0, 1, 2].map(k => dessus.a * dessus.c[k] + (1 - dessus.a) * dessous[k]);

    const el = document.getElementById("send-btn");
    const cs = getComputedStyle(el);
    const fg = rgb(cs.color).c;
    const base = rgb(cs.backgroundColor).c;                 /* rgb(79,142,247) */
    const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(rgb).filter(Boolean);
    const cas = [{ nom: "couleur unie seule (MEILLEUR cas)", fond: base, r: ratio(fg, base) }];
    stops.forEach((s, i) => {
      const fond = compose(s, base);
      cas.push({ nom: "arrêt " + (i + 1) + " alpha " + s.a + " → rgb(" + fond.map(Math.round).join(",") + ")", fond: fond, r: ratio(fg, fond) });
    });
    cas.sort((a, b) => a.r - b.r);
    return { texte: cs.color, base: cs.backgroundColor, gradient: cs.backgroundImage, cas: cas, pire: cas[0] };
  });

  console.log("Bouton SEND");
  console.log("  texte            : " + r.texte);
  console.log("  background-color : " + r.base);
  console.log("  dégradé          : " + r.gradient);
  console.log("  seuil WCAG AA pour un libellé de 13-14 px en gras : 4.5:1");
  console.log("  contrastes calculés, du PIRE au meilleur :");
  r.cas.forEach(c => console.log("    " + (Math.round(c.r * 100) / 100) + ":1   " + c.nom));
  console.log("\n  → PIRE CAS : " + (Math.round(r.pire.r * 100) / 100) + ":1   (" + r.pire.nom + ")");
  console.log("  → " + (r.pire.r < 4.5 ? "SOUS le seuil AA 4.5:1" : "au-dessus du seuil"));
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
