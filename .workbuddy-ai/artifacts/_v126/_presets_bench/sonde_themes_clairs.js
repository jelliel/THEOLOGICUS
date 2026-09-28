// Verifie d'ou viennent les jetons dans un theme CLAIR : <html> ou la coque ?
//
// Hypothese a tester : le bloc `<style id="v9-palette">` definit sa palette DEUX
// fois — une fois sur `:root` (global) et une fois sur `.tpai-shell` (la coque).
// Un jeton pose sur `.tpai-shell` masque la valeur heritee pour TOUS ses
// descendants : la surcharge `html[data-theme="light"]`, pourtant plus specifique
// (0,1,1 contre 0,1,0), ne l'atteint jamais. Toute la sidebar resterait donc en
// palette v9 SOMBRE dans un theme clair.
//
// Usage : node sonde_themes_clairs.js [--theme light] [--port 8860]
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const PORT = parseInt(arg("--port", "8860"), 10);
const THEME = arg("--theme", "light");
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

const JETONS = ["--text", "--text-bright", "--text-dim", "--text-primary", "--text-secondary",
  "--bg-card", "--bg-card-alt", "--bg-hull", "--hull", "--glass-border", "--hud-border",
  "--wire", "--cyan", "--accent"];

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("non"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);

  // Le theme est pose dans un evaluate, LU dans un autre : lire immediatement
  // apres `setAttribute` capturait une valeur EN COURS DE TRANSITION
  // (`#tpai-arch-new` a `transition: color .15s ease`). Le banc annoncait donc
  // #eaf2ff alors que la regle gagnante valait deja #0b1622 — et il contredisait
  // l'audit, qui attend 1200 ms. On coupe les transitions et on attend.
  await page.evaluate((th) => {
    document.documentElement.setAttribute("data-theme", th);
    const s = document.createElement("style");
    s.textContent = "*,*::before,*::after{transition:none !important;animation:none !important}";
    document.head.appendChild(s);
  }, THEME);
  await page.waitForTimeout(400);

  const r = await page.evaluate(({ th, jetons }) => {
    document.documentElement.setAttribute("data-theme", th);
    const lire = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const o = {};
      for (const j of jetons) o[j] = cs.getPropertyValue(j).trim();
      return o;
    };
    const html = lire(document.documentElement);
    const shell = document.getElementById("tpai-shell");
    const shellVal = lire(shell);
    const cible = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return `${sel} : absent`;
      const cs = getComputedStyle(el);
      return `${sel} : color=${cs.color} bg=${cs.backgroundColor}`;
    };
    return {
      html, shell: shellVal,
      cibles: ["#references-panel", ".ref-item-title", "#v8-notes", ".message.assistant",
        "#tpai-sidebar", "#v6-topbar", "#wizard-step2-next", "#tpai-arch-new",
        "#archives-panel", "#archives-panel .btn-ghost", "#v6-topbar .avatar",
        ".suggestion-chip", "#tpai-shell"]
        .map(cible),
    };
  }, { th: THEME, jetons: JETONS });

  console.log(`theme ${THEME}`);
  console.log("\n--- sur <html> ---");
  for (const j of JETONS) console.log(`  ${j.padEnd(20)} ${r.html[j]}`);
  console.log("\n--- sur #tpai-shell ---");
  for (const j of JETONS) {
    const a = r.html[j], b = r.shell ? r.shell[j] : null;
    console.log(`  ${j.padEnd(20)} ${String(b).padEnd(26)} ${a !== b ? "  <<< DIFFERENT de <html>" : ""}`);
  }
  console.log("\n--- elements ---");
  for (const c of r.cibles) console.log("  " + c);

  await browser.close();
  serveur.close();
})();
