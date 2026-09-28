// Contraste par thème — quels thèmes sont lisibles, lesquels ne le sont pas.
//
// Constat de depart : dans le theme `glass` (theme par defaut du document),
// --chat-assistant et --bg-card restent herites de :root, donc BLANCS, alors
// que les jetons de texte passent en clair. Resultat mesure : 1,11:1 sur les
// bulles de conversation. Les themes recents `v6-*` definissent les deux
// familles de jetons et sont donc corrects.
//
// Ce banc parcourt tous les themes offerts par le selecteur et compte, pour
// chacun, les elements dont le texte descend sous 3:1.
//
// Usage : node contraste_par_theme.js [--seuil 3] [--port 8900]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8900;
const SEUIL = process.argv.includes("--seuil")
  ? parseFloat(process.argv[process.argv.indexOf("--seuil") + 1]) : 3;
const RACINE = "C:/tmp/theoverify";
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHAT = "audit-theme";

const THEMES = ["glass", "cyber", "midnight", "light", "v6-glass", "v6-cyber", "v6-light"];

function messages() {
  const base = 1790800000000;
  return [
    { role: "user", content: "Question sur la justification.", ts: base },
    { role: "assistant", ts: base + 1000, annotations: [], marks: [],
      content: "La justification est **déclarative** et non infuse." },
  ];
}

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

  const bilan = [];

  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const chat = JSON.stringify({
      id: CHAT, model: "mistral", title: "Audit", updated: 1, fav: false, messages: messages(),
    });
    await ctx.addInitScript((e) => {
      try { document.cookie = "key_mistral=sk-test; path=/"; } catch (x) {}
      try {
        if (!localStorage.getItem("__ath")) {
          localStorage.setItem("theologicus_chat_" + "audit-theme", e.chat);
          localStorage.setItem("theologicus_currentChatId", "audit-theme");
          localStorage.setItem("__ath", "1");
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

    const r = await page.evaluate((arg) => {
      document.documentElement.setAttribute("data-theme", arg.theme);
      const m = document.getElementById("v6-more-menu"); if (m) m.classList.add("open");
      document.querySelectorAll("details").forEach(d => { d.open = true; });

      const lum = (rgb) => {
        const a = rgb.match(/[\d.]+/g).map(Number);
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]);
      };
      const alpha = (rgb) => { const a = rgb.match(/[\d.]+/g); return a && a.length >= 4 ? parseFloat(a[3]) : 1; };
      const fondOpaque = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          if (alpha(bg) > 0.5) return bg;
          n = n.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };

      const offenders = [];
      const vus = new Set();
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) continue;
        if (alpha(cs.color) < 0.5) continue;
        const texte = Array.from(el.childNodes).filter(n => n.nodeType === 3)
          .map(n => n.textContent.trim()).join(" ");
        if (!texte) continue;
        const rc = el.getBoundingClientRect();
        if (rc.width < 8 || rc.height < 6) continue;
        const fond = fondOpaque(el);
        const l1 = lum(cs.color), l2 = lum(fond);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (ratio >= arg.seuil) continue;
        let s = el.tagName.toLowerCase();
        if (el.id) s += "#" + el.id;
        else if (typeof el.className === "string" && el.className.trim()) {
          s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
        }
        const cle = s + "|" + cs.color + "|" + fond;
        if (vus.has(cle)) continue;
        vus.add(cle);
        offenders.push({ sel: s, texte: texte.slice(0, 26), ratio: Math.round(ratio * 100) / 100 });
      }
      const bulle = document.querySelector("#chat-container .message.assistant");
      return {
        nb: offenders.length,
        pires: offenders.sort((a, b) => a.ratio - b.ratio).slice(0, 5),
        bulleFond: bulle ? getComputedStyle(bulle).backgroundColor : null,
        bulleTexte: bulle ? getComputedStyle(bulle).color : null,
      };
    }, { theme, seuil: SEUIL });

    bilan.push({ theme, ...r });
    await ctx.close();
  }

  console.log(`seuil : ${SEUIL}:1\n`);
  console.log("theme         elements sous le seuil   bulle assist. (fond / texte)");
  console.log("-".repeat(78));
  for (const b of bilan) {
    const etat = b.nb === 0 ? "OK" : String(b.nb).padStart(3);
    console.log(`${b.theme.padEnd(13)} ${etat.padStart(5)}                     ${b.bulleFond} / ${b.bulleTexte}`);
  }
  console.log("\n--- detail des pires, par theme casse ---");
  for (const b of bilan) {
    if (!b.nb) continue;
    console.log(`\n  ${b.theme} :`);
    for (const p of b.pires) console.log(`    ${String(p.ratio).padStart(5)}:1  ${p.sel}  "${p.texte}"`);
  }

  await browser.close();
  serveur.close();
  process.exitCode = bilan.some(b => b.nb > 0) ? 1 : 0;
})();
