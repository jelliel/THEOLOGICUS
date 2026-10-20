const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CHAT_ID = "chat-fig-0001";
const MSG_TS = 1790600000001;
const CONTENU = "Le Seigneur est miséricordieux envers tous. La parole du Seigneur demeure éternellement.";
const SHAPE = { id: "fg-1", x: 20, y: 20, w: 160, h: 96, shape: "Cœur", color: "#4f8ef7", weight: 1.2, fill: "", rot: 0, text: "", ancre: null };
const CORPS = JSON.stringify({ id: CHAT_ID, model: "mistral", messages: [
  { role: "user", content: "Parle-moi de la miséricorde.", ts: MSG_TS - 1 },
  { role: "assistant", content: CONTENU, ts: MSG_TS, marks: [], shapes: [SHAPE] },
], title: "Banc figures", updated: 1, fav: false });
(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); fs.createReadStream(fp).pipe(res); } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(8801, "127.0.0.1", r));
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("PAGEERROR:", String(e)));
  await ctx.addInitScript(({ corps, chatId }) => {
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    window.__diagLog = [];
    const _cl = console.log.bind(console);
    console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    try { if (!localStorage.getItem("__fig_seeded")) { localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(JSON.parse(corps))); localStorage.setItem("theologicus_currentChatId", chatId); localStorage.setItem("__fig_seeded", "1"); } } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });
  await page.goto(`http://127.0.0.1:8801/THEOLOGICUS.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const diag = await page.evaluate(() => {
    const out = {};
    out.currentChatId = localStorage.getItem("theologicus_currentChatId");
    out.hasChatKey = !!localStorage.getItem("theologicus_chat_" + "chat-fig-0001");
    out.mcExists = !!document.getElementById("mc-" + 1790600000001);
    out.figCount = document.querySelectorAll(".atc-figbox").length;
    out.figIds = Array.from(document.querySelectorAll(".atc-figbox")).map(e => e.getAttribute("data-fig-id"));
    out.messagesRendered = document.querySelectorAll(".message").length;
    out.applyShapesType = typeof window.applyShapes;
    out.windowApplyShapesType = typeof window.__applyShapes;
    out.seededShape = (function(){ try { const c = JSON.parse(localStorage.getItem("theologicus_chat_chat-fig-0001")); const m = (c.messages||[]).find(x=>x.ts===1790600000001); return m ? (m.shapes||[]).length : "noMsg"; } catch(e){ return "err:"+e; } })();
    return out;
  });
  console.log("AVANT appel manuel:", JSON.stringify(diag));
  // Appel manuel pour voir si applyShapes rend le cadre
  const apres = await page.evaluate(() => {
    try { if (typeof window.__applyShapes === 'function') window.__applyShapes(); } catch(e){ return "applyShapes threw: "+e; }
    const fc = document.querySelectorAll(".atc-figbox").length;
    return { figCount: fc, ids: Array.from(document.querySelectorAll(".atc-figbox")).map(e=>e.getAttribute("data-fig-id")) };
  });
  console.log("APRÈS window.__applyShapes():", JSON.stringify(apres));
  const logs = await page.evaluate(() => (window.__diagLog||[]).filter(l => /applyShapes|applyMarks|renderMessages/.test(l)).slice(-15));
  console.log("DIAG LOGS:\n" + logs.join("\n"));
  console.log(JSON.stringify(diag, null, 2));
  await browser.close(); serveur.close();
})().catch(e => { console.error("ERR", e); process.exit(2); });
