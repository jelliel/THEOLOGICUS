// FUITE DE JETON DE SURFACE : un thème SOMBRE qui hérite d'une valeur CLAIRE
// définie par :root.
//
// Raison d'être : :root porte la palette CLAIRE (--glass-bg: rgba(255,255,255,.6),
// --bg-card: #ffffff, --chat-user: #e8f0fe…). Un thème sombre qui ne redéfinit
// pas un jeton de surface en hérite donc la valeur claire — panneau blanc sous
// texte clair. Mesuré : #memory-panel, .navbar-container et la coque .tpai-*
// deviennent blancs translucides dans les trois thèmes v6, parce que ceux-ci
// définissent --glass-border mais pas --glass-bg.
//
// C'est la même famille que le correctif v130 (--bg-card / --chat-assistant
// absents des thèmes hérités) : un thème définit UNE des deux familles de
// jetons — texte et surface — et oublie l'autre.
//
// Méthode : on lit les valeurs calculées sur <html> thème par thème, puis sans
// attribut de thème (ce qui donne :root seul), et on signale les jetons de
// surface dont la valeur en thème SOMBRE est identique à celle de :root et
// CLAIRE à l'œil (luminance > 0,5).
//
// Usage : node fuites_jetons.js [--port 8934] [--json sortie.json]
// Sortie : rc=0 si aucune fuite, rc=1 sinon.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8934;
const JSON_OUT = process.argv.includes("--json")
  ? process.argv[process.argv.indexOf("--json") + 1] : null;
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

const THEMES = ["glass", "cyber", "midnight", "light", "v6-glass", "v6-cyber", "v6-light"];
const SURFACE = [
  "--glass-bg", "--popup-bg", "--bg-card", "--bg-card-alt", "--hull", "--void", "--deep",
  "--plate", "--grid", "--wire", "--chat-user", "--chat-assistant",
  "--bg-void", "--bg-deep", "--bg-hull", "--bg-plate", "--glass-border", "--hud-border", "--border",
];

if (!fs.existsSync(path.join(RACINE, "THEOLOGICUS.html"))) {
  console.error("THEOLOGICUS.html introuvable dans " + RACINE);
  process.exit(2);
}

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
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
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });

  const lire = async (th) => page.evaluate((args) => {
    const [theme, jetons] = args;
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
    const cs = getComputedStyle(document.documentElement);
    const o = {};
    for (const j of jetons) o[j] = cs.getPropertyValue(j).trim();
    return o;
  }, [th, SURFACE]);

  const base = await lire(null);   // :root seul — la palette CLAIRE

  // Quels jetons servent réellement de FOND ? Sans ce filtre, le banc signale
  // --hud-border ou --grid : ce sont des couleurs de BORDURE, légitimement
  // claires sur fond sombre. Une bordure claire n'est pas une fuite.
  //
  // ATTENTION — piège du raccourci, rencontré trois fois dans ce projet :
  // `regle.style[i]` sur `background: var(--x)` renvoie les LONGTANDS
  // (background-image, background-color…) et `getPropertyValue()` rend "" pour
  // chacun : le var() est détruit. On lit donc `regle.cssText`, qui garde le
  // raccourci intact.
  const jetonsDeFond = await page.evaluate(() => {
    const fond = new Set();
    const visiter = (liste) => {
      for (const regle of liste) {
        if (regle.cssRules && !regle.selectorText) { visiter(regle.cssRules); continue; }
        if (!regle.cssText) continue;
        const re = /(?:^|[;{])\s*(background[A-Za-z-]*)\s*:\s*([^;}]+)/g;
        let m;
        while ((m = re.exec(regle.cssText))) {
          const reVar = /var\(\s*(--[A-Za-z0-9_-]+)/g;
          let v; while ((v = reVar.exec(m[2]))) fond.add(v[1]);
        }
      }
    };
    for (const f of document.styleSheets) {
      let rs; try { rs = f.cssRules; } catch (e) { continue; }
      visiter(rs);
    }
    return [...fond];
  });
  console.log(`\njetons utilisés comme FOND dans au moins une règle : ${jetonsDeFond.length}`);
  console.log("  " + jetonsDeFond.sort().join(", "));

  // Luminance d'une couleur CSS. Gère l'hexadécimal ET rgb()/rgba(), sinon les
  // jetons de surface — qui sont des hexadécimaux — renvoient null et tous les
  // thèmes sombres sont classés « clairs » : le banc ne dit plus rien.
  const lum = (v) => {
    const s = String(v).trim();
    let p = null, a = 1;
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      p = m[1].split(/[,\s/]+/).filter(x => x !== "").map(Number);
      a = p.length > 3 ? p[3] : 1;
    } else {
      const h = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (h) {
        let c = h[1];
        if (c.length === 3) c = c.split("").map(x => x + x).join("");
        p = [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
      }
    }
    if (!p) return null;
    const f = (c) => { c = c * a + 255 * (1 - a); c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
  };

  console.log("Valeur de :root (palette claire) :");
  for (const j of SURFACE) console.log(`  ${j.padEnd(18)} ${base[j] || "(vide)"}`);

  const rapport = {};
  let fuites = 0;

  for (const theme of THEMES) {
    const v = await lire(theme);
    const lCard = lum(v["--bg-card"] || v["--hull"] || v["--bg-hull"] || "");
    const sombre = lCard !== null && lCard < 0.3;
    const trouvees = [];
    for (const j of SURFACE) {
      if (!base[j] || v[j] !== base[j]) continue;   // le thème le redéfinit : ok
      if (!jetonsDeFond.includes(j)) continue;      // jeton de bordure, pas de fond
      const l = lum(v[j]);
      if (l === null) continue;                      // pas une couleur mesurable
      if (l > 0.5) trouvees.push({ jeton: j, valeur: v[j], luminance: +l.toFixed(3) });
    }
    rapport[theme] = { sombre, fond: v["--bg-card"] || v["--hull"], fuites: trouvees };
    console.log(`\n=== theme « ${theme} » — ${sombre ? "SOMBRE" : "clair"} (fond ${v["--bg-card"] || v["--hull"]})`);
    if (!sombre) { console.log("    (thème clair : hériter de :root est normal)"); continue; }
    if (!trouvees.length) { console.log("    OK — aucun jeton de surface clair hérité"); continue; }
    fuites += trouvees.length;
    for (const f of trouvees) {
      console.log(`    FUITE ${f.jeton.padEnd(16)} = ${f.valeur.padEnd(26)} luminance ${f.luminance}`);
    }
  }

  await browser.close();
  serveur.close();

  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rapport, null, 2));
  console.log(`\nRÉSULTAT : ${fuites === 0 ? "OK — aucune fuite." : `ÉCHEC — ${fuites} fuite(s).`}`);
  process.exit(fuites === 0 ? 0 : 1);
})();
