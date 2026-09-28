// Portée du jeton --bg-card dans le thème par défaut (glass).
//
// Question posée : si l'on définit enfin --bg-card pour les thèmes sombres,
// combien d'éléments cela change-t-il, et lesquels casseraient ?
//
// On liste les éléments dont le fond calcule est EXACTEMENT rgb(255,255,255),
// c'est-à-dire la valeur que :root donne à --bg-card, puis on sépare :
//   - texte clair  -> déjà illisible aujourd'hui (le défaut mesuré) ;
//   - texte sombre -> lisible aujourd'hui, casserait si on assombrit.
//
// Usage : node portee_bg_card.js [--port 8876]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8876;
const RACINE = "C:/tmp/theoverify";
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHAT = "audit-contraste";

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
    id: CHAT, model: "mistral", title: "Portee", updated: 1, fav: false,
    messages: [
      { role: "user", content: "Question sur la justification.", ts: 1790800000000 },
      { role: "assistant", content: "La justification est declarative.", ts: 1790800001000, annotations: [], marks: [] },
    ],
  });
  await ctx.addInitScript((e) => {
    try { document.cookie = "key_mistral=sk-test; path=/"; } catch (x) {}
    try {
      if (!localStorage.getItem("__portee")) {
        localStorage.setItem("theologicus_chat_audit-contraste", e.chat);
        localStorage.setItem("theologicus_currentChatId", "audit-contraste");
        localStorage.setItem("__portee", "1");
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
  await page.evaluate(() => {
    const m = document.getElementById("v6-more-menu"); if (m) m.classList.add("open");
    document.querySelectorAll("details").forEach(d => { d.open = true; });
  });
  await page.waitForTimeout(1500);

  const res = await page.evaluate(() => {
    const lum = (rgb) => {
      const a = rgb.match(/[\d.]+/g).map(Number);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]);
    };
    const out = [];
    const vus = new Set();
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (cs.backgroundColor !== "rgb(255, 255, 255)") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 6) continue;
      let s = el.tagName.toLowerCase();
      if (el.id) s += "#" + el.id;
      else if (typeof el.className === "string" && el.className.trim()) {
        s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
      }
      if (vus.has(s)) continue;
      vus.add(s);
      const texte = Array.from(el.childNodes).filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim()).join(" ");
      const l1 = lum(cs.color), l2 = lum("rgb(255,255,255)");
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      out.push({ sel: s, texte: texte.slice(0, 30), couleur: cs.color, ratio: Math.round(ratio * 100) / 100, aTexte: !!texte });
    }
    return out;
  });

  const clairs = res.filter(x => x.aTexte && x.ratio < 3);
  const sombres = res.filter(x => x.aTexte && x.ratio >= 3);
  console.log("elements a fond blanc (donc --bg-card de :root) :", res.length);
  console.log("  -> texte CLAIR, donc DEJA illisible   :", clairs.length);
  console.log("  -> texte SOMBRE, lisible aujourd'hui  :", sombres.length);
  console.log("     (ceux-la casseraient si on assombrit --bg-card)");
  console.log("\n--- deja illisibles ---");
  clairs.sort((a, b) => a.ratio - b.ratio).slice(0, 14)
    .forEach(x => console.log(`  ${String(x.ratio).padStart(5)}:1  ${x.sel}  "${x.texte}"`));
  console.log("\n--- lisibles aujourd'hui ---");
  sombres.slice(0, 14)
    .forEach(x => console.log(`  ${String(x.ratio).padStart(5)}:1  ${x.sel}  "${x.texte}"`));

  await browser.close();
  serveur.close();
})();
