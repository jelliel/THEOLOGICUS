const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v620_shot_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const b = Array.prototype.find.call(document.querySelectorAll('button'), x => /UTILISER SANS CL/i.test(x.textContent || ''));
    if (b) b.click();
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
    const CONT = "Thèse : Kyrios s'applique aux trois Personnes de la Trinité, mais avec une hiérarchie d'économie "
      + "(le Père est Kyrios par essence, le Fils et l'Esprit par participation).\n\n"
      + "Citations clés :\n\n- Cyrille, De Adoratione in Spiritu 1 (PG 75, 968) :\n\n"
      + "> « Le Père est Kύριος par nature, le Fils et l'Esprit par participation. »";
    const MOT = "hiérarchie d'économie";
    const st = CONT.indexOf(MOT);
    state.messages = [{ role: 'user', content: 'Développe la notion de Kyrios.', ts: 1700000000000 },
      { role: 'assistant', content: CONT, ts: 1700000001000,
        annotations: [{ id: 'hl-demo', text: MOT,
          a: "« hiérarchie d'économie » : non pas une inégalité de nature, mais l'ordre (taxis) de l'économie du salut — le Père comme source, le Fils envoyé, l'Esprit sanctifiant.",
          start: st, end: st + MOT.length }],
        marks: [] }];
    if (typeof renderMessages === 'function') renderMessages();
    if (window.__applyHighlights) window.__applyHighlights();
    const box = document.getElementById('mc-1700000001000');
    const hl = document.querySelector('.atc-hl[data-hl-id="hl-demo"]');
    const rb = box.getBoundingClientRect(), rh = hl.getBoundingClientRect();
    /* GRAND cadre DESSINÉ À LA MAIN (aucune ancre), comme dans la vidéo */
    state.messages[1].shapes = [{ id: 'fg-demo', shape: 'Rectangle', color: '#e040fb',
      weight: 1.8, text: '', svg: '<rect/>',
      x: 0, y: Math.max(0, Math.round(rh.top - rb.top - 70)),
      w: Math.round(rb.width - 8), h: 210 }];
    if (window.__applyShapes) window.__applyShapes();
  });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-demo"]');
    const b = fb.getBoundingClientRect();
    /* on survole le CADRE, loin du surlignage (comme dans la vidéo) */
    return { x: b.x + b.width * 0.5, y: b.y + b.height * 0.72 };
  });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(150);
  await page.mouse.move(r.x, r.y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, "survol_geo_v620.png") });
  await browser.close();
  relais.child.kill();
  console.log("capture ok");
})();
