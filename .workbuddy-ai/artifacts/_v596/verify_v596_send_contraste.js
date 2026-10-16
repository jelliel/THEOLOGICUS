/* ═══════════════════════════════════════════════════════════════
   Banc v596 — CONTRASTE DU BOUTON SEND. A/B AUTONOME (aucun fichier externe).

   🔴 POURQUOI CE BANC A ÉTÉ RÉÉCRIT. Sa première version chargeait
   `_before.html`, un fichier matérialisé localement par `git show HEAD:…` puis
   supprimé. En CI, ce fichier N'EXISTE PAS : le banc échouait et rendait la CI
   ROUGE — pour un défaut de portabilité, pas pour une régression du code.
   (Même famille d'erreur que le chemin absolu de _v586.)
   ⇒ Un banc ne doit dépendre QUE de ce qui est versionné.

   Méthode retenue, et elle est plus précise que la précédente : l'état « avant »
   se reconstitue DANS LA PAGE en désactivant la feuille v596
   (`styleEl.sheet.disabled = true`). On obtient ainsi un A/B à instrument
   STRICTEMENT égal — même page, même DOM, même instant — et l'on isole
   exactement ce que la feuille apporte.

   Contrôle NÉGATIF exigé : feuille désactivée, le contraste doit ÊTRE SOUS le
   seuil. Sans cela, le banc ne prouverait rien.
   ══════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

/* Mesure le PIRE contraste du libellé, dégradé compris. Une couleur unie donne
   le meilleur cas ; il faut composer aussi chaque arrêt du dégradé. */
const MESURE = () => {
  const rgb = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(Number); return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const compose = (d, s) => [0, 1, 2].map(k => d.a * d.c[k] + (1 - d.a) * s[k]);
  const el = document.getElementById("send-btn");
  if (!el) return { err: "bouton absent" };
  const cs = getComputedStyle(el);
  const fg = rgb(cs.color).c;
  const base = rgb(cs.backgroundColor);
  let fond = base && base.a > 0 ? base.c : [255, 255, 255];
  if (!base || base.a === 0) {
    let n = el.parentElement;
    while (n) { const b = rgb(getComputedStyle(n).backgroundColor); if (b && b.a > 0.999) { fond = b.c; break; } n = n.parentElement; }
  }
  const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(rgb).filter(Boolean);
  const cas = [{ nom: "couleur unie seule", r: ratio(fg, fond) }];
  stops.forEach(s => cas.push({ nom: "arrêt alpha " + s.a, r: ratio(fg, compose(s, fond)) }));
  cas.sort((a, b) => a.r - b.r);
  return { texte: cs.color, base: cs.backgroundColor, image: cs.backgroundImage,
           pire: Math.round(cas[0].r * 100) / 100, meilleur: Math.round(cas[cas.length - 1].r * 100) / 100 };
};

/* signature de style, souris éloignée (sinon un :hover fausse l'A/B) */
const SIGNATURE = (sel) => {
  const r = document.querySelector(sel);
  if (!r) return {};
  const out = {};
  Array.prototype.forEach.call(r.querySelectorAll("*"), el => {
    const cl = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
    const cs = getComputedStyle(el);
    out[el.tagName + (el.id ? "#" + el.id : "") + cl] = [cs.color, cs.backgroundColor, cs.backgroundImage,
      cs.borderColor, cs.fontSize, cs.fontWeight, cs.opacity, cs.transform, cs.boxShadow, cs.width, cs.height].join("|");
  });
  return out;
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v596_" + Date.now()) });
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

  /* ── 1. la feuille existe et n'agit que sur #send-btn ── */
  section("1. La feuille v596 est en place et strictement ciblée");
  const feuille = await page.evaluate(() => {
    const el = document.getElementById("v596-send-contraste");
    if (!el || !el.sheet) return { err: "feuille ou feuille de style absente" };
    const sel = [];
    for (let i = 0; i < el.sheet.cssRules.length; i++) sel.push(el.sheet.cssRules[i].selectorText || "(at-rule)");
    return { n: el.sheet.cssRules.length, selecteurs: sel };
  });
  ok("la feuille v596 est chargée", !feuille.err, feuille.err || "ok");
  const tousSend = (feuille.selecteurs || []).every(s => /send-btn/.test(s));
  ok("tous ses sélecteurs visent #send-btn (donc aucun effet ailleurs)",
     (feuille.selecteurs || []).length > 0 && tousSend, (feuille.selecteurs || []).join(" | "));

  /* ── 2. CONTRÔLE NÉGATIF : feuille désactivée = état d'avant ── */
  section("2. Contrôle négatif — feuille désactivée, le défaut revient");
  const bascule = (actif) => page.evaluate((on) => {
    const el = document.getElementById("v596-send-contraste");
    el.sheet.disabled = !on;
    return el.sheet.disabled;
  }, actif);
  await bascule(false);
  await page.waitForTimeout(150);
  const mAv = await page.evaluate(MESURE);
  console.log("   avant (feuille off) : pire " + mAv.pire + ":1 | meilleur " + mAv.meilleur + ":1");
  console.log("           " + mAv.base + " + " + String(mAv.image).slice(0, 78));
  ok("sans la feuille, le contraste repasse SOUS 4,5:1", mAv.pire < 4.5, "pire = " + mAv.pire + ":1");
  ok("le pire cas vient bien du dégradé, pas de la couleur unie", mAv.pire < mAv.meilleur,
     "pire " + mAv.pire + " < meilleur " + mAv.meilleur);
  const sigAv = await page.evaluate(SIGNATURE, "#input-area");

  /* ── 3. APRÈS : seuil franchi ── */
  section("3. Feuille active — le seuil AA est franchi");
  await bascule(true);
  await page.waitForTimeout(150);
  const mAp = await page.evaluate(MESURE);
  console.log("   après (feuille on)  : pire " + mAp.pire + ":1 | meilleur " + mAp.meilleur + ":1");
  console.log("           " + mAp.base + " + " + String(mAp.image).slice(0, 78));
  ok("le fond a bien changé", mAp.base !== mAv.base, mAv.base + " → " + mAp.base);
  ok("le pire cas atteint 4,5:1", mAp.pire >= 4.5, "pire = " + mAp.pire + ":1");
  ok("le reflet n'éclaircit plus le fond", mAp.meilleur >= mAp.pire, "pire " + mAp.pire + " ≤ meilleur " + mAp.meilleur);

  /* ── 4. survol ── */
  section("4. L'état survolé passe aussi");
  await page.hover("#send-btn");
  await page.waitForTimeout(250);
  const mH = await page.evaluate(MESURE);
  console.log("   survol : pire " + mH.pire + ":1");
  ok("survol ≥ 4,5:1", mH.pire >= 4.5, "pire = " + mH.pire + ":1");
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);

  /* ── 5. A/B à instrument égal : seul #send-btn change ── */
  section("5. A/B — seul le bouton visé change");
  const sigAp = await page.evaluate(SIGNATURE, "#input-area");
  const perdus = Object.keys(sigAv).filter(k => !(k in sigAp));
  const nouveaux = Object.keys(sigAp).filter(k => !(k in sigAv));
  const modifies = Object.keys(sigAp).filter(k => k in sigAv && sigAp[k] !== sigAv[k]);
  ok("aucun élément perdu dans la zone de saisie", perdus.length === 0, perdus.slice(0, 4).join(", "));
  ok("aucun élément apparu", nouveaux.length === 0, nouveaux.slice(0, 4).join(", "));
  ok("seul #send-btn a changé de style", modifies.length === 1 && /send-btn/.test(modifies[0]),
     modifies.length + " modifié(s) : " + modifies.slice(0, 5).join(", "));

  /* ── 6. propreté ── */
  section("6. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
