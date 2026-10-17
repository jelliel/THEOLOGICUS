/* ═══════════════════════════════════════════════════════════════
   Banc v601 — CONTRASTE PAR THÈME (garde-fou du chantier thèmes).

   Contexte : les tranches 1-2 (v600) ont rendu les couleurs d'accent
   pilotables par les jetons. Conséquence : dans les thèmes qui surchargent
   --accent, les éléments tokenisés CHANGENT de couleur. Ce banc garantit que
   ce changement n'a créé AUCUN nouveau texte illisible, dans AUCUN thème.

   Méthode (v596 généralisée) : pour chaque thème, mesurer le PIRE contraste
   de chaque texte visible (composer chaque arrêt de dégradé translucide avec
   le fond effectif — un fond dégradé n'est pas une couleur unie) et compter
   les textes sous 3:1. Baseline mesurée sur l'état pré-tokenisation (c23ecb8)
   : 1 / 1 / 1 / 14 / 15 / 1 / 1 — les coupables existants (watermark,
   tooltips cachés, badge v8-ring) sont PRÉ-EXISTANTS et documentés.

   CONTRÔLE NÉGATIF exigé : rendre --text illisible doit faire EXPLOSER le
   compte — sinon la mesure ne prouve rien.

   Note : l'état « démarrage à 2,4 s » n'est pas testé (l'initialisation de
   l'app se poursuit au-delà ; mesure non reproductible — voir journal).
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

/* Baselines mesurées avec la composition corrigée (texte translucide composé
   sur son fond effectif). Les 7 thèmes d'ORIGINE : mesurées sur l'état
   pré-tokenisation (c23ecb8) le 2026-10-17 — l'état tokenisé mesure identique.
   Les 3 thèmes v602 (parchemin/vitral/manuscrit) : mesurés à la création ;
   leurs coupables sont les mêmes défauts PRÉ-EXISTANTS que les thèmes
   apparentés (watermark, tooltips cachés, badge v8-ring, mem-tab). */
const THEMES = [
  { nom: "glass",     max: 7,  accent: "#4f8ef7" },
  { nom: "cyber",     max: 7,  accent: "#4f8ef7" },
  { nom: "midnight",  max: 7,  accent: "#9b8fff" },
  { nom: "light",     max: 13, accent: "#0070a8" },
  { nom: "v6-light",  max: 14, accent: "#185fa5" },
  { nom: "v6-glass",  max: 7,  accent: "#00e5ff" },
  { nom: "v6-cyber",  max: 7,  accent: "#ff2d95" },
  { nom: "parchemin", max: 13, accent: "#8a6d3b" },
  { nom: "vitral",    max: 7,  accent: "#e5c15a" },
  { nom: "manuscrit", max: 7,  accent: "#c9a227" },
];

/* Retourne la liste triée des textes visibles sous 3:1 (méthode v596 généralisée). */
const OFFENDERS = () => {
  const rgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(Number); return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const compose = (d, base) => [0, 1, 2].map(k => d.a * d.c[k] + (1 - d.a) * base[k]);
  const out = [];
  Array.prototype.forEach.call(document.querySelectorAll("body *"), el => {
    let texte = "";
    for (const n of el.childNodes) if (n.nodeType === 3) texte += n.textContent;
    texte = texte.trim();
    if (!texte) return;
    const rct = el.getBoundingClientRect();
    if (rct.width === 0 || rct.height === 0) return;
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || +cs.opacity === 0) return;
    const fgM = rgb(cs.color);
    if (!fgM) return;
    const couches = [];
    let base = [255, 255, 255], node = el, prof = 0;
    while (node && node.nodeType === 1 && prof < 25) {
      const c = getComputedStyle(node);
      const bgc = rgb(c.backgroundColor);
      const stops = (c.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(rgb).filter(Boolean);
      if (bgc && bgc.a >= 0.999) { base = bgc.c; break; }
      if (bgc && bgc.a > 0) couches.push({ d: bgc });
      for (const s of stops) if (s.a > 0) couches.push({ d: s });
      node = node.parentElement; prof++;
    }
    /* Fonds candidats : chaque couche translucide composée de l'extérieur vers
       l'intérieur + le fond effectif final. 🔴 Le texte translucide se compose
       sur SON PROPRE FOND effectif (pas sur du blanc arbitraire) — sinon un
       texte transparent paraît « lisible » et le contrôle négatif ne mord pas
       (défaut de mesure attrapé par le contrôle négatif lui-même). */
    const candidatsBg = [];
    let eff = base;
    for (const couche of couches.slice().reverse()) {
      candidatsBg.push(compose(couche.d, eff));
      eff = compose(couche.d, eff);
    }
    candidatsBg.push(eff);
    const fgEff = fgM.a >= 0.999 ? fgM.c : compose(fgM, eff);
    const pire = Math.round(Math.min.apply(null,
      candidatsBg.map(bg => ratio(fgEff, bg))) * 100) / 100;
    if (pire < 3) {
      out.push({ pire, desc: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
        (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") });
    }
  });
  out.sort((a, b) => a.pire - b.pire);
  return out;
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v601_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2400);
  await page.mouse.move(2, 2);

  /* ── 1. Contraste de chaque thème : aucun nouveau texte illisible ── */
  section("1. Contraste par thème — compte de textes sous 3:1 ≤ baseline");
  for (const t of THEMES) {
    await page.evaluate(th => { document.documentElement.dataset.theme = th; }, t.nom);
    await page.waitForTimeout(600);
    const r1 = await page.evaluate(OFFENDERS);
    await page.waitForTimeout(400);
    const r2 = await page.evaluate(OFFENDERS);
    const liste = r1.length <= r2.length ? r1 : r2; // min de 2 passes : filtre les transitoires
    ok("thème " + t.nom + " : " + liste.length + " sous 3:1 (baseline " + t.max + ")",
       liste.length <= t.max,
       liste.length ? "pire : " + liste[0].pire + " " + liste[0].desc : "aucun");
  }

  /* ── 2. Spot-check : --accent suit bien chaque thème ── */
  section("2. Spot-check — --accent résout la valeur du thème (les tokens vivent)");
  for (const t of THEMES) {
    await page.evaluate(th => { document.documentElement.dataset.theme = th; }, t.nom);
    await page.waitForTimeout(150);
    const val = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
    ok("thème " + t.nom + " : --accent = " + t.accent, val === t.accent, val);
  }

  /* ── 2b. Chemin UI RÉEL : les 3 habillages v602 sont sélectionnables ── */
  section("2b. Chemin UI réel — parchemin sélectionnable dans #theme-select");
  const optPresente = await page.evaluate(() => {
    const s = document.getElementById("theme-select");
    if (!s) return { err: "select absent" };
    return { valeurs: Array.prototype.map.call(s.options, o => o.value) };
  });
  ok("les 3 options v602 existent dans le select",
     (optPresente.valeurs || []).includes("parchemin") &&
     (optPresente.valeurs || []).includes("vitral") &&
     (optPresente.valeurs || []).includes("manuscrit"),
     (optPresente.valeurs || []).join(","));
  await page.selectOption("#theme-select", "parchemin");
  await page.waitForTimeout(400);
  const applique = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
  }));
  ok("sélectionner PARCHEMIN dans le select applique le thème (chemin UI + persistance)",
     applique.theme === "parchemin" && applique.accent === "#8a6d3b",
     JSON.stringify(applique));

  /* ── 3. CONTRÔLE NÉGATIF : la mesure détecte un thème rendu illisible ── */
  section("3. Contrôle négatif — forcer TOUT le texte transparent doit faire exploser le compte");
  await page.evaluate(th => { document.documentElement.dataset.theme = th; }, "glass");
  /* Le contrôle négatif valide le DÉTECTEUR, pas le thème : une règle universelle
     est déterministe (--text seul ne touche que les éléments qui l'utilisent). */
  await page.evaluate(() => {
    const s = document.createElement("style");
    s.id = "v601-negatif";
    s.textContent = "* { color: rgba(0,0,0,0) !important; }";
    document.head.appendChild(s);
  });
  await page.waitForTimeout(500);
  const neg = await page.evaluate(OFFENDERS);
  await page.evaluate(() => { const s = document.getElementById("v601-negatif"); if (s) s.remove(); });
  await page.waitForTimeout(400);
  ok("texte universellement transparent : le compte explose (la mesure DÉTECTE)",
     neg.length > 100, neg.length + " textes sous 3:1 (baseline 7)");
  const apresNeg = await page.evaluate(OFFENDERS);
  ok("retirer la surcharge restaure le compte baseline", apresNeg.length <= 7, apresNeg.length);

  /* ── 4. Propreté ── */
  section("4. Propreté");
  ok("aucune erreur JavaScript pendant les 10 changements de thème", bruit.length === 0,
     bruit.slice(0, 2).join(" | "));

  await browser.close();
  relais.child.kill();
  const passes = resultats.filter(r => r.pass).length;
  console.log("\n========================================================================");
  console.log("RESULTAT : " + passes + "/" + resultats.length);
  console.log("========================================================================");
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("ERREUR BANC:", e); process.exit(1); });
