/* ═══════════════════════════════════════════════════════════════
   AUDIT D'INTERFACE de THEOLOGICUS — par la MESURE, pas par lecture du code.
   Règle du projet : PRÉSENT ≠ VISIBLE ≠ ACTIF ≠ ATTEIGNABLE.
   On mesure donc, à quatre largeurs, ce qui est RÉELLEMENT rendu :
     · boutons du HUD : DOM / visibles / atteignables (elementFromPoint) ;
     · débordement horizontal et éléments hors écran ;
     · cibles tactiles trop petites (mobile) ;
     · contraste réel (fond COMPOSÉ, dégradés déclarés non mesurables) ;
     · ressources réellement téléchargées ;
     · erreurs JS.
   Aucune valeur attendue n'est figée : le rapport CHIFFRE, il ne juge pas.
   ══════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");

const VIEWPORTS = [
  { nom: "1280x900 (bureau)", w: 1280, h: 900 },
  { nom: "768x1024 (tablette)", w: 768, h: 1024 },
  { nom: "390x844 (téléphone)", w: 390, h: 844 },
  { nom: "320x568 (petit)", w: 320, h: 568 }
];

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_audit_" + Date.now());
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const browser = await H.launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  /* la porte doit être PARTIE, sinon on mesure la porte */
  const porte = await page.evaluate(() => {
    const o = document.getElementById("auth-overlay");
    return o ? getComputedStyle(o).display : "absente";
  });
  console.log("Porte d'authentification : " + porte + (porte === "none" || porte === "absente" ? "  (OK)" : "  ⚠ ENCORE LÀ — les mesures porteraient sur la porte"));

  /* ── ressources réellement téléchargées ── */
  const res = await page.evaluate(() => {
    const e = performance.getEntriesByType("resource") || [];
    const gros = e.map(r => ({ n: (r.name || "").split("/").pop(), t: r.transferSize || 0 }))
                   .sort((a, b) => b.t - a.t).slice(0, 8);
    return { n: e.length, total: e.reduce((s, r) => s + (r.transferSize || 0), 0), gros: gros };
  });
  console.log("\nRESSOURCES : " + res.n + " requête(s), " + Math.round(res.total / 1024) + " Ko transférés");
  res.gros.forEach(g => console.log("   " + String(Math.round(g.t / 1024)).padStart(6) + " Ko  " + g.n));

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const vis = el => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      };
      /* HUD : DOM / visibles / ATTEIGNABLES (non recouverts) */
      const hud = Array.prototype.slice.call(document.querySelectorAll(".hud-btn"));
      let vus = 0, atteints = 0;
      hud.forEach(function (b) {
        if (!vis(b)) return;
        vus++;
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
        const dessus = document.elementFromPoint(cx, cy);
        if (dessus && (dessus === b || b.contains(dessus) || dessus.contains(b))) atteints++;
      });

      /* débordement horizontal */
      const de = document.documentElement;
      const deborde = de.scrollWidth - de.clientWidth;

      /* éléments hors écran à droite */
      const hors = [];
      document.querySelectorAll("body *").forEach(function (el) {
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
        if (!vis(el)) return;
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 2 && r.width < innerWidth * 2) {
          const id = el.id ? "#" + el.id : (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : el.tagName);
          hors.push(id + " (" + Math.round(r.right) + ">" + innerWidth + ")");
        }
      });

      /* cibles tactiles trop petites (seulement en mobile) */
      const petites = [];
      if (innerWidth <= 430) {
        document.querySelectorAll("button, a, [role=button], input[type=checkbox]").forEach(function (el) {
          if (!vis(el)) return;
          const r = el.getBoundingClientRect();
          if (r.width < 32 || r.height < 32) {
            const id = el.id ? "#" + el.id : (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : el.tagName);
            petites.push(id + " " + Math.round(r.width) + "×" + Math.round(r.height));
          }
        });
      }

      /* ── contraste : fond COMPOSÉ, du bas vers le haut ── */
      const rgb = s => {
        const m = String(s).match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map(x => parseFloat(x));
        return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
      };
      const lum = c => {
        const f = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
      };
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
      /* un dégradé à forte amplitude n'est PAS mesurable en couleur unie */
      function amplitudeDegrade(el) {
        let maxA = 0;
        for (let i = 0; i < el.style.length; i++) maxA = Math.max(maxA, 0);
        const img = getComputedStyle(el).backgroundImage;
        if (!img || img === "none") return 0;
        const stops = (img.match(/rgba?\([^)]+\)/g) || []).map(rgb).filter(s => s && s.a >= 0.05);
        if (stops.length < 2) return 0;
        const L = stops.map(s => lum(s.c));
        return (Math.max.apply(null, L) + 0.05) / (Math.min.apply(null, L) + 0.05);
      }
      function fondCompose(el) {
        const couches = [];
        let n = el;
        while (n && n.nodeType === 1) {
          const b = rgb(getComputedStyle(n).backgroundColor);
          if (b && b.a > 0) couches.push(b);
          n = n.parentElement;
        }
        let out = [255, 255, 255];
        for (let i = couches.length - 1; i >= 0; i--) {
          const c = couches[i];
          out = [0, 1, 2].map(k => c.a * c.c[k] + (1 - c.a) * out[k]);
        }
        return out;
      }
      const sousSeuil = [], nonMesurables = [];
      let mesures = 0;
      document.querySelectorAll("body *").forEach(function (el) {
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
        if (el.children.length > 0) return;              /* feuilles de texte seulement */
        const t = (el.textContent || "").trim();
        if (!t) return;
        if (!vis(el)) return;
        const cs = getComputedStyle(el);
        const fg = rgb(cs.color);
        if (!fg) return;
        const amp = amplitudeDegrade(el);
        if (amp >= 1.5) { nonMesurables.push(1); return; }
        const bg = fondCompose(el);
        mesures++;
        const r = ratio(fg.c, bg);
        const taille = parseFloat(cs.fontSize) || 16;
        const gras = (parseInt(cs.fontWeight, 10) || 400) >= 700;
        const seuil = (taille >= 24 || (taille >= 18.66 && gras)) ? 3 : 4.5;
        if (r < seuil) {
          const id = el.id ? "#" + el.id : (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : el.tagName);
          sousSeuil.push({ sel: id, r: Math.round(r * 100) / 100, seuil: seuil, fg: cs.color, txt: t.slice(0, 28) });
        }
      });
      sousSeuil.sort((a, b) => a.r - b.r);

      return {
        hud: { dom: hud.length, visibles: vus, atteignables: atteints },
        deborde: deborde, hors: hors.slice(0, 6), nHors: hors.length,
        petites: petites.slice(0, 6), nPetites: petites.length,
        contrastes: { mesures: mesures, sous: sousSeuil.slice(0, 6), nSous: sousSeuil.length, nonMes: nonMesurables.length }
      };
    });

    console.log("\n=== " + vp.nom + " ===");
    console.log("HUD : " + m.hud.dom + " dans le DOM | " + m.hud.visibles + " visibles | " + m.hud.atteignables + " ATTEIGNABLES"
      + (m.hud.atteignables < m.hud.visibles ? "   ⚠ " + (m.hud.visibles - m.hud.atteignables) + " recouvert(s)" : ""));
    console.log("DÉBORDEMENT horizontal : " + (m.deborde > 0 ? "⚠ " + m.deborde + " px" : "aucun"));
    console.log("ÉLÉMENTS HORS ÉCRAN : " + m.nHors + (m.nHors ? "  " + m.hors.join(", ") : ""));
    if (vp.w <= 430) console.log("CIBLES < 32px : " + m.nPetites + (m.nPetites ? "  " + m.petites.join(", ") : ""));
    console.log("CONTRASTE : " + m.contrastes.mesures + " texte(s) mesuré(s) | " + m.contrastes.nSous + " sous le seuil | "
      + m.contrastes.nonMes + " non mesurable(s) (dégradé)");
    m.contrastes.sous.forEach(c => console.log("   " + c.r + ":1 (seuil " + c.seuil + ")  " + c.sel + "  « " + c.txt + " »"));
  }

  console.log("\nERREURS JS : " + erreurs.length + (erreurs.length ? "  " + erreurs.slice(0, 2).join(" | ") : ""));
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
