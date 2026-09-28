// Quelles regles CSS peignent reellement les bulles de conversation ?
//
// Le theme glass donne --hull:#0e1c30 (sombre) et .message.assistant prend
// background:var(--hull). Pourtant la mesure donne du blanc. On liste donc,
// dans l'ordre de la cascade, TOUTES les regles qui touchent le fond de ces
// elements — sans supposer laquelle gagne.
//
// Usage : node regles_bulles.js [--port 8885]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8885;
const RACINE = "C:/tmp/theoverify";
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHAT = "diag-bulles";

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const chat = JSON.stringify({
    id: CHAT, model: "mistral", title: "Diag", updated: 1, fav: false,
    messages: [
      { role: "user", content: "Question.", ts: 1790800000000 },
      { role: "assistant", content: "Reponse.", ts: 1790800001000, annotations: [], marks: [] },
    ],
  });
  await ctx.addInitScript((e) => {
    try { document.cookie = "key_mistral=sk-test; path=/"; } catch (x) {}
    try {
      if (!localStorage.getItem("__diag")) {
        localStorage.setItem("theologicus_chat_diag-bulles", e.chat);
        localStorage.setItem("theologicus_currentChatId", "diag-bulles");
        localStorage.setItem("__diag", "1");
      }
    } catch (x) {}
  }, { chat });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
    { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
  });
  await page.addStyleTag({ content: "#setup-wizard-overlay{display:none !important}" });
  await page.evaluate((id) => { window.loadArchiveChat(id, -1); }, CHAT);
  await page.waitForFunction(() => document.querySelectorAll("#chat-container .message").length >= 2,
    null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  const out = await page.evaluate(() => {
    const cible = document.querySelector("#chat-container .message.assistant");
    const cs = getComputedStyle(cible);
    const regles = [];
    for (const feuille of document.styleSheets) {
      let rs;
      try { rs = feuille.cssRules; } catch (e) { continue; }
      const visiter = (liste, media) => {
        for (const r of liste) {
          if (r.cssRules && !r.selectorText) { visiter(r.cssRules, media || r.conditionText || ""); continue; }
          if (!r.selectorText) continue;
          for (const s of r.selectorText.split(",")) {
            const sel = s.trim();
            let correspond;
            try { correspond = cible.matches(sel); } catch (e) { correspond = false; }
            if (!correspond) continue;
            const bg = r.style.getPropertyValue("background") || r.style.getPropertyValue("background-color");
            const bgImg = r.style.getPropertyValue("background-image");
            if (!bg && !bgImg) continue;
            regles.push({ sel, media: media || "", bg, bgImg });
          }
        }
      };
      visiter(rs, "");
    }
    return {
      fondCalcule: cs.backgroundColor,
      imageCalculee: cs.backgroundImage,
      couleurTexte: cs.color,
      regles,
      // Et pour comparaison, la bulle utilisateur
      userFond: getComputedStyle(document.querySelector("#chat-container .message.user")).backgroundColor,
    };
  });

  console.log("fond calcule  :", out.fondCalcule);
  console.log("image calculee:", out.imageCalculee);
  console.log("texte calcule :", out.couleurTexte);
  console.log("bulle user    :", out.userFond);
  console.log(`\n--- ${out.regles.length} regles correspondant a .message.assistant ---`);
  for (const r of out.regles) {
    console.log(`  ${r.media ? "[" + r.media + "] " : ""}${r.sel}`);
    if (r.bg) console.log(`      background       : ${r.bg}`);
    if (r.bgImg) console.log(`      background-image : ${r.bgImg.slice(0, 90)}`);
  }

  await browser.close();
  serveur.close();
})();
