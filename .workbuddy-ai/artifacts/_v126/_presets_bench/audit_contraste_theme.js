// Audit de contraste — thème par défaut de THEOLOGICUS (glass).
//
// Pourquoi ce banc : le thème `glass` redéfinit les jetons de TEXTE en clair
// (--text-primary #eaf4ff, --text-secondary #b7ccdf, --text-dim #7e98b2) mais
// ne redéfinit PAS --bg-card, que :root fixe à #ffffff. Tout élément qui prend
// `background: var(--bg-card)` dans ce thème affiche donc du texte clair sur
// fond blanc. Mesuré sur #v6-more-menu : 1,65:1.
//
// Ce banc ne se limite pas au menu : il cherche TOUS les éléments dont le fond
// calcule est clair alors que le texte est clair, et calcule le rapport WCAG.
// Un défaut de jeton de thème n'est jamais isolé — il faut la liste.
//
// Usage : node audit_contraste_theme.js [--seuil 3] [--port 8860] [--theme light]
//
// Sans --theme, l'audit porte sur le thème persisté dans l'application. Avec,
// il force l'attribut avant de mesurer — indispensable pour comparer deux
// thèmes dans la même exécution : sans cela on ne peut auditer que celui que
// l'application a mémorisé, et les défauts des thèmes clairs restent invisibles.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8860;
const SEUIL = process.argv.includes("--seuil")
  ? parseFloat(process.argv[process.argv.indexOf("--seuil") + 1]) : 3;
const THEME = process.argv.includes("--theme")
  ? process.argv[process.argv.indexOf("--theme") + 1] : null;
// QUATRE niveaux : ce dossier est un cran plus bas que les bancs de _v126/.
// Avec trois niveaux le serveur repond « 404 » en texte et l'attente expire
// sans indice — piege deja consigne, et pourtant refait ici.
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
if (!fs.existsSync(path.join(RACINE, "THEOLOGICUS.html"))) {
  console.error(`[!] THEOLOGICUS.html introuvable sous ${RACINE} — racine fausse.`);
  process.exit(2);
}
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const chat = JSON.stringify({
    id: CHAT, model: "mistral", title: "Audit contraste", updated: 1, fav: false,
    messages: [
      { role: "user", content: "Question sur la justification.", ts: 1790800000000 },
      { role: "assistant", content: "La justification est **déclarative**.", ts: 1790800001000, annotations: [], marks: [] },
    ],
  });
  await ctx.addInitScript((e) => {
    try { document.cookie = "key_mistral=sk-test-audit; path=/"; } catch (x) {}
    try {
      if (!localStorage.getItem("__audit_seeded")) {
        localStorage.setItem("theologicus_chat_" + "audit-contraste", e.chat);
        localStorage.setItem("theologicus_currentChatId", "audit-contraste");
        localStorage.setItem("__audit_seeded", "1");
      }
    } catch (x) {}
  }, { chat });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
    { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });
  await page.evaluate((id) => { window.loadArchiveChat(id, -1); }, CHAT);
  await page.waitForFunction(() => document.querySelectorAll("#chat-container .message").length >= 2,
    null, { timeout: 60000 });

  const theme = await page.evaluate((th) => {
    if (th) document.documentElement.setAttribute("data-theme", th);
    return document.documentElement.getAttribute("data-theme");
  }, THEME);
  console.log(`theme effectif : ${theme}   seuil WCAG retenu : ${SEUIL}:1`);

  // Ouvrir le menu « Plus » et le panneau « Personnaliser » : les defauts se
  // cachent dans ce qui n'est pas affiche au premier ecran.
  await page.evaluate(() => {
    const m = document.getElementById("v6-more-menu");
    if (m) m.classList.add("open");
    document.querySelectorAll("details").forEach(d => { d.open = true; });
  });
  await page.waitForTimeout(1200);

  const rapport = await page.evaluate((seuil) => {
    const lum = (rgb) => {
      const a = rgb.match(/[\d.]+/g).map(Number);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]);
    };
    const alpha = (rgb) => {
      const a = rgb.match(/[\d.]+/g);
      return a && a.length >= 4 ? parseFloat(a[3]) : 1;
    };
    // Remonte jusqu'a un fond opaque : c'est le fond que l'oeil voit vraiment.
    const fondOpaque = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (alpha(bg) > 0.5) return bg;
        n = n.parentElement;
      }
      return "rgb(255,255,255)";
    };
    const chemin = (el) => {
      const parts = [];
      let n = el;
      while (n && n !== document.body && parts.length < 4) {
        let s = n.tagName.toLowerCase();
        if (n.id) s += "#" + n.id;
        else if (n.className && typeof n.className === "string") {
          const c = n.className.trim().split(/\s+/).slice(0, 2).join(".");
          if (c) s += "." + c;
        }
        parts.unshift(s);
        n = n.parentElement;
      }
      return parts.join(" > ");
    };

    const offenders = [];
    const vus = new Set();
    for (const el of document.querySelectorAll("body *")) {
      // Ne juger que les elements qui portent du texte DIRECTEMENT.
      const texte = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ");
      if (!texte) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 6) continue;
      if (alpha(cs.color) < 0.5) continue;

      const fond = fondOpaque(el);
      const l1 = lum(cs.color), l2 = lum(fond);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio >= seuil) continue;

      const cle = chemin(el) + "|" + cs.color + "|" + fond;
      if (vus.has(cle)) continue;
      vus.add(cle);
      offenders.push({
        chemin: chemin(el),
        texte: texte.slice(0, 42),
        couleur: cs.color,
        fond: fond,
        ratio: Math.round(ratio * 100) / 100,
      });
    }
    return offenders.sort((a, b) => a.ratio - b.ratio);
  }, SEUIL);

  console.log(`\nelements sous le seuil : ${rapport.length}`);
  for (const o of rapport.slice(0, 30)) {
    console.log(`  ${String(o.ratio).padStart(5)}:1  ${o.chemin}`);
    console.log(`           "${o.texte}"  ${o.couleur} sur ${o.fond}`);
  }

  await browser.close();
  serveur.close();
  process.exitCode = rapport.length ? 1 : 0;
})();
