/* Capture du panneau de diagnostic v617 (contrôle visuel). */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v617_shot_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    window.Capacitor = {
      isNativePlatform: function () { return true; },
      getPlatform: function () { return "android"; },
      Plugins: {
        Filesystem: { writeFile: function () { return Promise.resolve({ uri: "file:///tmp/x" }); } },
        NetBridge: { gateway: function () { return Promise.resolve({ gateway: "", localIp: "" }); },
                     httpRequest: function () { return Promise.resolve({ status: 200, headers: {}, body: "{}" }); } }
      }
    };
  });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  /* passer la porte Adeodat (sinon le panneau est DERRIERE elle) */
  try { await page.getByText(/Commencer Adeodat/i).click({ timeout: 8000 }); } catch (e) {}
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    /* capture seule : masquer la porte d acces (z 999999), qui passe avant tout */
    try { var b = Array.prototype.find.call(document.querySelectorAll('button'), function(x){ return /UTILISER SANS CL/i.test(x.textContent); }); if (b) b.click(); } catch(e) {}
    var ov0 = document.getElementById('auth-overlay');
    if (ov0) { ov0.classList.add('hidden'); ov0.style.setProperty('display','none','important'); }
    Array.prototype.forEach.call(document.querySelectorAll('body *'), function (d) {
      var cs = getComputedStyle(d);
      if (cs.position === 'fixed' && parseInt(cs.zIndex || '0', 10) >= 900000) d.style.display = 'none';
    });
    window.__theoJournalReseauAjout({ type: "api", statut: 503, modele: "mistral-small-latest",
      transport: "transport NATIF NetBridge", edge: "cloudflare",
      extrait: '{"error":{"message":"service unavailable"}}' });
    window.__dernierTransport = { url: "https://api.mistral.ai/v1/chat/completions", methode: "POST",
      utilise: "natif", pont: "NetBridge", statut: 503, ms: 812,
      tentatives: [{ pont: "NetBridge", statut: 503, corpsVide: false }] };
    window.__theoDiagAfficher();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, "diag_v617.png") });
  await browser.close();
  relais.child.kill();
  console.log("capture : diag_v617.png");
})();
