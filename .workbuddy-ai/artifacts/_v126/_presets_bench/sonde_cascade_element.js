// Pourquoi une regle que je crois gagnante ne s'applique-t-elle pas ?
//
// Pour un element et une propriete donnes, liste TOUTES les regles qui les
// declarent, avec : feuille, feuille desactivee ?, media, selecteur,
// !important, et une specificite calculee. Trie par (important, specificite,
// ordre) et marque celle qui devrait gagner. Comparer avec la valeur calculee :
// si le gagnant annonce n'est pas la valeur observee, le modele est faux quelque
// part et le banc le dit au lieu de le laisser deviner.
//
// Usage : node sonde_cascade_element.js --selecteur "#tpai-arch-new" --prop color [--theme light]
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const PORT = parseInt(arg("--port", "8870"), 10);
const SEL = arg("--selecteur", "#tpai-arch-new");
const PROP = arg("--prop", "color");
const THEME = arg("--theme", "light");
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

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

  // Lire APRES la fin des transitions : sinon on capture une valeur
  // intermediaire et on croit que la regle gagnante ne s'applique pas.
  await page.evaluate((th) => {
    document.documentElement.setAttribute("data-theme", th);
    const s = document.createElement("style");
    s.textContent = "*,*::before,*::after{transition:none !important;animation:none !important}";
    document.head.appendChild(s);
  }, THEME);
  await page.waitForTimeout(400);

  const r = await page.evaluate(({ sel, prop, th }) => {
    document.documentElement.setAttribute("data-theme", th);
    const el = document.querySelector(sel);
    if (!el) return { erreur: `aucun element pour ${sel}` };

    // Specificite (a,b,c) : ids, classes/attributs/pseudo-classes, elements.
    const specificite = (s) => {
      const sansPseudo = s.replace(/::[a-z-]+(\([^)]*\))?/g, "");
      const ids = (sansPseudo.match(/#[\w-]+/g) || []).length;
      const cls = (sansPseudo.match(/\.[\w-]+/g) || []).length
        + (sansPseudo.match(/\[[^\]]+\]/g) || []).length
        + (sansPseudo.match(/:(?!:)[a-z-]+(\([^)]*\))?/g) || []).length;
      const els = (sansPseudo.replace(/#[\w-]+/g, "").replace(/\.[\w-]+/g, "")
        .replace(/\[[^\]]+\]/g, "").replace(/:(?!:)[a-z-]+(\([^)]*\))?/g, "")
        .match(/[a-zA-Z][\w-]*/g) || []).length;
      return [ids, cls, els];
    };

    const trouvees = [];
    let ordre = 0;
    // RECURSION dans les regles de groupe (@media, @supports). Sans cela une
    // regle imbriquee est INVISIBLE a l'enumeration : le banc annoncait alors
    // un gagnant qui n'etait pas celui du navigateur, sans le dire.
    const parcourir = (regles, idFeuille, sh, contexte) => {
      for (const reg of regles) {
        if (reg.cssRules && reg.conditionText !== undefined) {
          parcourir(reg.cssRules, idFeuille, sh, `${contexte}@${reg.conditionText}`);
          continue;
        }
        if (!reg.selectorText || !reg.style) continue;
        const val = reg.style.getPropertyValue(prop);
        if (!val) continue;
        for (const un of reg.selectorText.split(",")) {
          const s = un.trim();
          let ok = false;
          try { ok = el.matches(s); } catch (x) { continue; }
          if (!ok) continue;
          trouvees.push({
            feuille: idFeuille,
            feuilleDesactivee: !!sh.disabled,
            media: contexte || (sh.media && sh.media.mediaText ? sh.media.mediaText : ""),
            selecteur: s,
            valeur: val,
            important: reg.style.getPropertyPriority(prop) === "important",
            spec: specificite(s),
            ordre: ordre++,
          });
        }
      }
    };
    for (const sh of document.styleSheets) {
      let regles; try { regles = sh.cssRules; } catch (x) { continue; }
      if (!regles) continue;
      const idFeuille = (sh.ownerNode && sh.ownerNode.id) || "(sans id)";
      parcourir(regles, idFeuille, sh, "");
    }
    // Tri : important d'abord, puis specificite, puis ordre du document.
    const cle = (o) => [o.important ? 1 : 0, o.spec[0], o.spec[1], o.spec[2], o.ordre];
    const tri = [...trouvees].sort((a, b) => {
      const ka = cle(a), kb = cle(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    });
    const gagnant = tri[tri.length - 1];
    return {
      calcule: getComputedStyle(el).getPropertyValue(prop),
      inline: el.getAttribute("style") || "",
      gagnantAnnonce: gagnant || null,
      regles: tri.reverse(),
    };
  }, { sel: SEL, prop: PROP, th: THEME });

  if (r.erreur) { console.log(r.erreur); await browser.close(); serveur.close(); return; }
  console.log(`element ${SEL} — ${PROP} calcule = ${r.calcule}`);
  if (r.inline) console.log(`style en ligne : ${r.inline}`);
  console.log("\nregles qui declarent cette propriete (gagnante en tete) :");
  for (const o of r.regles) {
    console.log(`  ${o.important ? "!" : " "} (${o.spec.join(",")}) ${o.feuille}${o.feuilleDesactivee ? " [DESACTIVEE]" : ""}${o.media && o.media !== "all" ? " @" + o.media : ""}`);
    console.log(`      ${o.selecteur}  ->  ${o.valeur}`);
  }
  if (r.gagnantAnnonce) {
    console.log(`\ngagnant annonce : ${r.gagnantAnnonce.selecteur} -> ${r.gagnantAnnonce.valeur}`);
    const attendu = r.gagnantAnnonce.valeur;
    console.log(`calcule          : ${r.calcule}`);
    console.log(`coherent         : ${attendu.indexOf("var(") >= 0 ? "indetermine (var)" : (r.calcule === attendu ? "oui" : "NON — le modele est faux")}`);
  }

  await browser.close();
  serveur.close();
})();
