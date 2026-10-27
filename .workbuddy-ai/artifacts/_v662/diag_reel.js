/* Diagnostic REEL : l'app servie par le vrai relais (proxy_server.py), avec la
   vraie cle de l'utilisateur et le modele reellement configure.
   On enregistre CHAQUE requete /proxy/ (statut + corps) et le journal. */
const path = require("path");
const { chromium } = require("playwright");

const PORT = Number(process.env.REL_PORT || 8799);
const PW = "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CLE = process.env.CLE || "sk-k4XsdswW2K7l8bsZGLMRTtf1keC9UzuHGciN2xx2NvdCAZO3";
const MODELE = process.env.MODELE || "agnes-video-v2.0";

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();

  const appels = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (!/\/proxy\//.test(url)) return;
    let corps = "";
    try { corps = (await res.text()).slice(0, 300); } catch (e) {}
    appels.push({ statut: res.status(), url: url.replace(/^.*\/proxy\//, ""), corps });
  });
  page.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text().slice(0, 160)); });

  await page.addInitScript(([cle, modele]) => {
    try {
      localStorage.setItem("agnes_api_key", cle);
      localStorage.setItem("cinema_noir_active_models_v1", JSON.stringify([modele]));
    } catch (e) {}
  }, [CLE, MODELE]);

  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  /* mode texte + prompt */
  await page.evaluate(() => {
    const st = window.__v499 && window.__v499.etat;
    if (st) { st.mode = "text"; st.durationFrames = 121; }
    const ta = document.getElementById("scene-base-text");
    if (ta) { ta.value = "Un canard traverse un lac au coucher du soleil."; ta.dispatchEvent(new Event("input", { bubbles: true })); }
    const b = document.querySelector('[data-mode="text"]');
    if (b) b.click();
  });
  await page.waitForTimeout(600);

  const etat = await page.evaluate(() => {
    const st = window.__v499 && window.__v499.etat;
    return { mode: st && st.mode, modeles: st && st.activeModels, cle: (localStorage.getItem("agnes_api_key") || "").slice(0, 8) };
  });
  console.log("ETAT AVANT CLIC :", JSON.stringify(etat));

  await page.evaluate(() => {
    const btn = document.getElementById("generate-btn");
    if (btn) { btn.disabled = false; btn.click(); }
  });

  /* attendre la fin du run (max 120 s) */
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(2000);
    const fini = await page.evaluate(() => {
      const st = window.__v499 && window.__v499.etat;
      return !(st && st.isRunning);
    });
    if (fini && i > 2) break;
  }

  const journal = await page.evaluate(() => {
    const p = document.getElementById("log-panel");
    return p ? p.innerText : "(pas de panneau)";
  });

  console.log("\n===== APPELS RESEAU (/proxy/) =====");
  appels.forEach((a, i) => console.log(`#${i + 1}  HTTP ${a.statut}  ${a.url}\n     ${a.corps.replace(/\s+/g, " ")}`));

  console.log("\n===== JOURNAL (fin) =====");
  console.log(journal.split("\n").slice(-30).join("\n"));

  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
