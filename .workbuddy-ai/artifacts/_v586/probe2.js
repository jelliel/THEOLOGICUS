/* sonde 2 — la regle d animation existe-t-elle ? la base survit-elle au reload ? */
const H = require("../../../tools/bench_common.js");
const { chromium } = require("playwright");
const path = require("path"), os = require("os");
const P = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v586/paquets/";
(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v586_p2_" + Date.now());
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = "http://127.0.0.1:" + port + "/THEOLOGICUS.html";
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.getElementById("v584-on").click(); });
  await page.waitForTimeout(400);
  await page.setInputFiles("#v586-import-input", P + "cygne.zip");
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    await db.put("agents", { id: "p2-agt", name: "Agent P2", desc: "x" });
    await window.activateAgent("p2-agt");
  });
  await page.waitForFunction(() => window.__v584Pets.etat().visible, null, { timeout: 8000 });
  await page.evaluate(() => {
    const s = document.getElementById("v584-pet-sel");
    s.value = "ext:cygne";
    s.dispatchEvent(new Event("change"));
  });
  await page.waitForTimeout(3000);
  const a = await page.evaluate(() => {
    const st = document.getElementById("v584-style").textContent;
    const i = st.indexOf("[data-anim=");
    const j = st.indexOf("v584-idle-ext_cygne");
    const k = st.indexOf("@keyframes v584-idle-ext_cygne");
    return {
      tailleStyle: st.length,
      premiereRegleAnim: i !== -1 ? st.slice(i - 40, i + 120) : "(aucune)",
      animNomPresent: j !== -1,
      kfPresent: k !== -1,
      extraitKf: k !== -1 ? st.slice(k, k + 150) : "",
      geo: JSON.stringify((window.__v585Geo || {})["ext:cygne"] || null),
      frames: JSON.stringify((window.__v585Frames || {})["ext:cygne"] || null)
    };
  });
  console.log(JSON.stringify(a, null, 1).slice(0, 1400));
  console.log("═══ persistance : la base contient-elle pet::cygne ? ═══");
  const b1 = await page.evaluate(async () => {
    const tous = await db.getAll("app_config");
    return { total: (tous || []).length, pets: (tous || []).filter(x => x && String(x.id).indexOf("pet::") === 0).map(x => x.id) };
  });
  console.log("avant reload :", JSON.stringify(b1));
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const b2 = await page.evaluate(async () => {
    const tous = await db.getAll("app_config");
    return {
      total: (tous || []).length,
      pets: (tous || []).filter(x => x && String(x.id).indexOf("pet::") === 0).map(x => x.id),
      atlasExt: Object.keys(window.__v585Atlas || {}).filter(k => k.indexOf("ext:") === 0)
    };
  });
  console.log("apres reload :", JSON.stringify(b2));
  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}
  process.exit(0);
})();
