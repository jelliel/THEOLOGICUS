// Contraste MESURÉ des éléments qui consomment les jetons de thème, par thème.
//
// Sert de témoin avant/après pour le correctif v131. Les jetons concernés
// (--gold, --plasma, --plasma-dim, --violet-dim, --text-muted, --bg, --bg-dark,
// --bg-panel, --void, --grid, --plate, --neon-dim) sont référencés SANS repli :
// tant qu'ils ne sont pas définis, la déclaration est purement ignorée, donc
// l'élément garde un fond ou une couleur hérités. On ne peut pas le voir en
// lisant la feuille de style — il faut le mesurer sur l'élément rendu.
//
// Méthode : on injecte une sonde portant les VRAIES classes dans un conteneur
// dont le fond est var(--bg-card) — la surface réelle de l'application — puis on
// lit getComputedStyle. Le fond effectif est obtenu en composant la chaîne des
// fonds translucides jusqu'au premier opaque (alpha >= 0,999).
//
// Usage : node contraste_jetons.js [--port 8896] [--json sortie.json] [--seuil 3]
// Sortie : rc=0 si tout est au-dessus du seuil, rc=1 sinon.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8896;
const JSON_OUT = process.argv.includes("--json")
  ? process.argv[process.argv.indexOf("--json") + 1] : null;
const SEUIL = process.argv.includes("--seuil")
  ? parseFloat(process.argv[process.argv.indexOf("--seuil") + 1]) : 3;
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const FICHIER = path.join(RACINE, "THEOLOGICUS.html");

const THEMES = ["glass", "cyber", "midnight", "light", "v6-glass", "v6-cyber", "v6-light"];

if (!fs.existsSync(FICHIER)) {
  console.error("THEOLOGICUS.html introuvable dans " + RACINE);
  process.exit(2);
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

  const rapport = {};
  let sousSeuil = 0;

  for (const theme of THEMES) {
    const r = await page.evaluate((th) => {
      document.documentElement.setAttribute("data-theme", th);

      // ── Outils couleur ────────────────────────────────────────────────────
      const lire = (s) => {
        const m = String(s).match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[,\s/]+/).filter(x => x !== "").map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const poser = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
      });
      const fondEffectif = (el) => {
        const chaine = [];
        let n = el;
        while (n && n.nodeType === 1) {
          const c = lire(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0) chaine.push(c);
          if (c && c.a >= 0.999) break;
          n = n.parentElement;
        }
        let base = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = chaine.length - 1; i >= 0; i--) base = poser(chaine[i], base);
        return base;
      };
      const rapportDe = (fg, bg) => {
        const f = poser(fg, bg);
        const l1 = lum(f), l2 = lum(bg);
        const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      };
      const hex = (c) => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");

      // ── Sonde : les vraies classes, sur la vraie surface ──────────────────
      const hote = document.createElement("div");
      hote.id = "__sonde_jetons__";
      hote.style.cssText = "position:fixed;left:-9999px;top:0;width:640px;padding:12px;"
        + "background:var(--bg-card);color:var(--text-primary);font-size:13px;";
      hote.innerHTML = `
        <span class="badge badge-plasma">PLASMA</span>
        <span class="badge badge-violet">VIOLET</span>
        <span class="badge badge-neon">NEON</span>
        <div class="archive-match">extrait correspondant</div>
        <button class="rating-star active">&#9733;</button>
        <button class="archive-fav-btn fav">&#9829;</button>
        <button class="export-format-btn export-md"><span class="export-format-icon">&#128196;</span><span class="export-format-label">PDF</span><span class="export-format-ext">.pdf</span></button>
        <div class="message-content"><code>code</code><pre>bloc</pre></div>
        <div class="success-block">succes</div>
        <span class="status-pill active">actif</span>
        <span class="orchestrator-badge">ORCH</span>
      `;
      document.body.appendChild(hote);

      const cibles = [
        [".badge-plasma", "texte du badge plasma"],
        [".badge-violet", "texte du badge violet"],
        [".badge-neon", "texte du badge neon"],
        [".archive-match", "extrait de recherche"],
        [".rating-star.active", "etoile de notation active"],
        [".archive-fav-btn.fav", "bouton favori actif"],
        // Le libellé porte la couleur du texte ; le bouton lui-même porte le fond.
        [".export-format-label", "libelle du bouton d'export"],
        [".export-format-ext", "extension sous le libelle d'export"],
        [".message-content code", "code en ligne"],
        [".message-content pre", "bloc de code"],
        [".success-block", "bloc de succes"],
        [".status-pill.active", "pastille d'etat active"],
        [".orchestrator-badge", "badge d'orchestrateur"],
      ];
      const out = [];
      for (const [sel, quoi] of cibles) {
        const el = hote.querySelector(sel);
        if (!el) { out.push({ sel, quoi, absent: true }); continue; }
        const cs = getComputedStyle(el);
        const fg = lire(cs.color);
        const bg = fondEffectif(el);
        out.push({
          sel, quoi,
          couleur: cs.color,
          fond: hex(bg),
          fondDeclare: cs.backgroundColor,
          ratio: fg ? +rapportDe(fg, bg).toFixed(2) : null,
        });
      }
      hote.remove();

      // Jetons eux-mêmes, pour la traçabilité.
      const csHtml = getComputedStyle(document.documentElement);
      const jetons = {};
      for (const j of ["--gold", "--plasma", "--plasma-dim", "--violet-dim", "--text-muted",
                       "--bg", "--bg-dark", "--bg-panel", "--void", "--grid", "--plate",
                       "--neon-dim", "--text-code"]) {
        jetons[j] = csHtml.getPropertyValue(j).trim() || "(vide)";
      }
      return { cibles: out, jetons };
    }, theme);

    rapport[theme] = r;
    console.log(`\n=== theme « ${theme} »`);
    console.log("    jetons : " + Object.entries(r.jetons).map(([k, v]) => k + "=" + v).join("  "));
    for (const c of r.cibles) {
      if (c.absent) { console.log(`    ${c.sel.padEnd(24)} (absent du DOM)`); continue; }
      const mauvais = c.ratio !== null && c.ratio < SEUIL;
      if (mauvais) sousSeuil++;
      console.log(`    ${mauvais ? "SOUS SEUIL" : "     ok   "} ${String(c.ratio).padStart(6)}:1  `
        + `${c.sel.padEnd(24)} texte=${c.couleur.padEnd(22)} fond=${c.fond}`);
    }
  }

  await browser.close();
  serveur.close();

  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rapport, null, 2));
  console.log(`\nRÉSULTAT : ${sousSeuil} élément(s) sous ${SEUIL}:1.`);
  process.exit(sousSeuil === 0 ? 0 : 1);
})();
