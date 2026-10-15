/* sonde v586 — que contient le CSS pour le pet importe, et que fait isolationInit */
const H = require("../../../tools/bench_common.js");
const { chromium } = require("playwright");
const path = require("path"), os = require("os");
const P = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v586/paquets/";
(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v586_probe_" + Date.now());
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
    await db.put("agents", { id: "probe-agt", name: "Agent Probe", desc: "x" });
    await window.activateAgent("probe-agt");
  });
  await page.waitForFunction(() => window.__v584Pets.etat().visible, null, { timeout: 8000 });
  await page.evaluate(() => {
    const s = document.getElementById("v584-pet-sel");
    s.value = "ext:cygne";
    s.dispatchEvent(new Event("change"));
  });
  await page.waitForTimeout(3000);
  const d = await page.evaluate(() => {
    const h = document.getElementById("v584-pet");
    const b = h.querySelector(".v584-bob");
    const st = document.getElementById("v584-style").textContent;
    const idx = st.indexOf("ext_cygne");
    const regles = [];
    const re = new RegExp("#v584-pet\\[[^\\]]*ext:cygne[^\\]]*\\] .v584-bob\\{[^}]*\\}", "g");
    let m;
    while ((m = re.exec(st))) regles.push(m[0]);
    const kf = st.indexOf("@keyframes v584-thinking-ext_cygne");
    return {
      dataPet: h.getAttribute("data-pet"),
      dataAnim: h.getAttribute("data-anim"),
      anim: getComputedStyle(b).animationName,
      regles: regles,
      extraitKf: kf !== -1 ? st.slice(kf, kf + 220) : "(absent)",
      geo: (window.__v585Geo || {})["ext:cygne"] || null,
      frames: (window.__v585Frames || {})["ext:cygne"] || null,
      taille: getComputedStyle(h).width
    };
  });
  console.log(JSON.stringify(d, null, 1).slice(0, 2200));
  console.log("═══ isolationInit ═══");
  console.log(String(H.isolationInit).slice(0, 400));
  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}
  process.exit(0);
})();
