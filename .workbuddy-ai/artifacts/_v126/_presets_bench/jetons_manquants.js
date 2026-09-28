// Jetons de thème RÉFÉRENCÉS sans repli et jamais définis — par thème.
//
// Pourquoi : un `var(--x)` sans valeur de repli rend la déclaration ENTIÈRE
// invalide ; la propriété retombe à sa valeur initiale, silencieusement.
// Deux jetons manquants dans le thème `glass` (--chat-assistant, --bg-card)
// suffisaient à rendre toutes les conversations illisibles (1,11:1).
//
// ═══ HISTORIQUE DE L'INSTRUMENT — deux pièges, tous deux mesurés ═══
//
// (1) v129 : énumérer via `getPropertyValue(regle.style[i])` est AVEUGLE aux
//     var() portés par un RACCOURCI. Mesuré sur `.badge-plasma` :
//         .badge-plasma { background: var(--plasma-dim); color: var(--plasma); }
//     le CSSOM expose 14 entrées (background-image, background-color, …) et
//     `getPropertyValue()` renvoie "" pour CHACUNE : le var() est DÉTRUIT.
//     `color`, propriété longue, est intact. D'où `--plasma-dim` et
//     `--violet-dim` invisibles — le banc annonçait 3 manquants, il y en avait 5.
//     → CORRECTIF : lire `regle.cssText`, qui conserve le raccourci tel quel.
//
// (2) v131 : scanner le TEXTE BRUT fait apparaître deux familles de faux positifs :
//     les var() cités dans un COMMENTAIRE (`var(--app-h) vient du correctif v38`,
//     alors que l'usage réel est `var(--app-h, 100vh)`, avec repli), et les
//     attributs style="…" construits dans des gabarits JS.
//     → CORRECTIF : ne scanner que les règles VIVANTES (document.styleSheets),
//       et écarter les jetons fournis à l'exécution (setProperty).
//
// Instrument retenu : les RÉFÉRENCES viennent des règles vivantes (`cssText`),
// les VALEURS du navigateur (`getComputedStyle`, seul juge du thème actif).
//
// Usage : node jetons_manquants.js [--port 8890] [--json sortie.json]
// Sortie : rc=0 si aucun jeton mort, rc=1 sinon. rc=2 si le fichier manque.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8890;
const JSON_OUT = process.argv.includes("--json")
  ? process.argv[process.argv.indexOf("--json") + 1] : null;
const RACINE = path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const FICHIER = path.join(RACINE, "THEOLOGICUS.html");

const THEMES = ["glass", "cyber", "midnight", "light", "v6-glass", "v6-cyber", "v6-light"];

if (!fs.existsSync(FICHIER)) {
  console.error("THEOLOGICUS.html introuvable dans " + RACINE);
  process.exit(2);
}

const source = fs.readFileSync(FICHIER, "utf8");

// Jetons fournis à l'exécution par le script : hors périmètre (ils ne dépendent
// pas du thème mais de l'état de l'application).
const fournisParScript = new Set();
{
  const re = /setProperty\(\s*['"](--[A-Za-z0-9_-]+)['"]/g;
  let m; while ((m = re.exec(source))) fournisParScript.add(m[1]);
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
    { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });

  // ── Références : lues dans les règles VIVANTES ─────────────────────────────
  const refs = await page.evaluate(() => {
    const out = [];
    // Un var() est PROTÉGÉ s'il porte une virgule de premier niveau.
    const scanner = (texte, selecteur) => {
      const re = /var\(/g;
      let m;
      while ((m = re.exec(texte))) {
        const debut = re.lastIndex;
        let depth = 1, i = debut, virgule = false;
        while (i < texte.length && depth > 0) {
          const c = texte[i];
          if (c === "(") depth++;
          else if (c === ")") depth--;
          else if (c === "," && depth === 1) virgule = true;
          i++;
        }
        const tok = (texte.slice(debut, i - 1).match(/^\s*(--[A-Za-z0-9_-]+)/) || [])[1];
        if (tok) out.push({ jeton: tok, protege: virgule, selecteur: selecteur });
        re.lastIndex = m.index + 4;
      }
    };
    const visiter = (liste, contexte) => {
      for (const regle of liste) {
        if (regle.cssRules && !regle.selectorText) {
          visiter(regle.cssRules, contexte + " > " + (regle.cssText.split("{")[0] || "").trim());
          continue;
        }
        if (!regle.selectorText) continue;
        scanner(regle.cssText, (contexte ? contexte + " > " : "") + regle.selectorText);
      }
    };
    let nbFeuilles = 0, nbIllisibles = 0;
    for (const f of document.styleSheets) {
      nbFeuilles++;
      let rs; try { rs = f.cssRules; } catch (e) { nbIllisibles++; continue; }
      visiter(rs, "");
    }
    return { out, nbFeuilles, nbIllisibles };
  });

  const sansRepli = new Map();   // jeton -> [sélecteurs]
  for (const r of refs.out) {
    if (r.protege) continue;
    if (!sansRepli.has(r.jeton)) sansRepli.set(r.jeton, new Set());
    sansRepli.get(r.jeton).add(r.selecteur);
  }

  console.log(`feuilles : ${refs.nbFeuilles} (${refs.nbIllisibles} illisibles)`);
  console.log(`jetons référencés sans repli dans des règles vivantes : ${sansRepli.size}`);
  console.log(`jetons fournis à l'exécution (hors périmètre) : ${fournisParScript.size}`
    + ` — ${[...fournisParScript].sort().join(", ")}\n`);

  const rapport = {};
  let morts = 0, locaux = 0;

  for (const theme of THEMES) {
    const v = await page.evaluate((args) => {
      const [th, jetons] = args;
      document.documentElement.setAttribute("data-theme", th);
      const sonde = document.querySelector(".tpai-shell") || document.body;
      const csHtml = getComputedStyle(document.documentElement);
      const csSonde = getComputedStyle(sonde);
      const o = {};
      for (const j of jetons) {
        o[j] = { html: csHtml.getPropertyValue(j).trim(), sonde: csSonde.getPropertyValue(j).trim() };
      }
      return o;
    }, [theme, [...sansRepli.keys()]]);

    const mortsTheme = [], locauxTheme = [];
    for (const [j, s] of Object.entries(v)) {
      if (fournisParScript.has(j)) continue;
      if (s.html === "" && s.sonde === "") mortsTheme.push(j);
      else if (s.html === "" && s.sonde !== "") locauxTheme.push(j);
    }
    mortsTheme.sort(); locauxTheme.sort();
    rapport[theme] = { morts: mortsTheme, locaux: locauxTheme };

    console.log(`=== theme « ${theme} »`);
    if (!mortsTheme.length) console.log("    OK — aucun jeton mort");
    for (const j of mortsTheme) {
      morts++;
      console.log(`    MORT ${j}`);
      for (const s of [...sansRepli.get(j)].slice(0, 2)) console.log(`        ${s}`);
    }
    if (locauxTheme.length) {
      locaux++;
      console.log(`    (portée locale, hors périmètre : ${locauxTheme.join(", ")})`);
    }
    console.log("");
  }

  await browser.close();
  serveur.close();

  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rapport, null, 2));
  console.log(morts === 0
    ? "RÉSULTAT : OK — aucun jeton mort dans les 7 thèmes."
    : `RÉSULTAT : ÉCHEC — ${morts} occurrence(s) de jeton mort.`);
  process.exit(morts === 0 ? 0 : 1);
})();
