/* ═══════════════════════════════════════════════════════════════
   Banc v596 — CONTRASTE DU BOUTON SEND (A/B avec contrôle négatif).

   Méthode exigée par le projet : un « avant/après » n'a de sens qu'avec le MÊME
   instrument des deux côtés, et un banc sans contrôle négatif ne prouve rien.
   On sert donc `_before.html` (état d'avant, matérialisé depuis git) ET
   `THEOLOGICUS.html` (état d'après) au MÊME relais, et on exige :
     · avant  : contraste < 4,5:1  ← le défaut EXISTE (sinon le banc ne teste rien)
     · après  : contraste ≥ 4,5:1  ← le défaut est corrigé
     · après  : l'état :hover passe AUSSI le seuil (le reflet blanc y était pire)
     · A/B    : SEUL #send-btn a changé de style — aucun effet de bord.

   ⚠️ Le fond n'est pas une couleur unie : c'est une couleur SURMONTÉE d'un
   dégradé translucide. Composer seulement la couleur unie donne le MEILLEUR
   cas. On compose donc AUSSI les arrêts du dégradé et on retient le PIRE.
   ══════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

/* mesure le pire contraste du texte d'un élément, dégradé compris */
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
  /* le fond réellement empilé : on remonte les ancêtres opaques */
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
           pire: Math.round(cas[0].r * 100) / 100, meilleur: Math.round(cas[cas.length - 1].r * 100) / 100, cas: cas };
};

/* signature de style d'un sous-arbre, pour l'A/B */
const SIGNATURE = (sel) => {
  const racine = document.querySelector(sel);
  if (!racine) return {};
  const out = {};
  Array.prototype.forEach.call(racine.querySelectorAll("*"), el => {
    const id = el.id ? "#" + el.id : "";
    const cl = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
    const cs = getComputedStyle(el);
    out[el.tagName + id + cl] = [cs.color, cs.backgroundColor, cs.backgroundImage, cs.borderColor,
      cs.fontSize, cs.fontWeight, cs.opacity, cs.transform, cs.boxShadow, cs.width, cs.height].join("|");
  });
  return out;
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v596_" + Date.now()) });
  const browser = await H.launchBrowser();
  const base = "http://127.0.0.1:" + port + "/";
  const bruit = [];

  async function charger(fichier) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", e => bruit.push(fichier + " : " + String(e)));
    await page.addInitScript(H.isolationInit);
    await page.goto(base + fichier, { waitUntil: "domcontentloaded", timeout: 60000 });
    await H.adminLogin(page, H.AUTH_HASH);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2200);
    return page;
  }

  /* ── 1. AVANT : le défaut doit EXISTER (contrôle négatif) ── */
  section("1. Contrôle négatif — le défaut existait bien avant");
  const av = await charger("_before.html");
  const mA = await av.evaluate(MESURE);
  console.log("   avant : pire " + mA.pire + ":1 | meilleur " + mA.meilleur + ":1");
  console.log("           " + mA.base + " + " + String(mA.image).slice(0, 80));
  ok("le bouton SEND existait", !mA.err, mA.err || "ok");
  ok("son contraste était SOUS 4,5:1 (le défaut est réel)",
     mA.pire < 4.5, "pire = " + mA.pire + ":1");
  ok("le pire cas vient bien du dégradé (pas de la couleur unie)",
     mA.pire < mA.meilleur, "pire " + mA.pire + " < meilleur " + mA.meilleur);
  const sigAv = await av.evaluate(SIGNATURE, "#input-area");

  /* ── 2. APRÈS : le seuil est franchi ── */
  section("2. Après correction — le seuil AA est franchi");
  const ap = await charger("THEOLOGICUS.html");
  const mB = await ap.evaluate(MESURE);
  console.log("   après : pire " + mB.pire + ":1 | meilleur " + mB.meilleur + ":1");
  console.log("           " + mB.base + " + " + String(mB.image).slice(0, 80));
  ok("le fond a bien changé", mB.base !== mA.base, mA.base + " → " + mB.base);
  ok("le pire cas atteint 4,5:1", mB.pire >= 4.5, "pire = " + mB.pire + ":1");
  ok("le reflet n'éclaircit plus le fond (il l'assombrit)",
     mB.meilleur >= mB.pire, "pire " + mB.pire + " ≤ meilleur " + mB.meilleur);

  /* ── 3. l'état :hover passe aussi ── */
  section("3. L'état survolé passe le seuil lui aussi");
  await ap.hover("#send-btn");
  await ap.waitForTimeout(250);
  const mH = await ap.evaluate(MESURE);
  console.log("   survol : pire " + mH.pire + ":1");
  ok("survol ≥ 4,5:1", mH.pire >= 4.5, "pire = " + mH.pire + ":1");

  /* ── 4. A/B : seul le bouton visé a changé ── */
  section("4. A/B — aucun effet de bord");
  const sigAp = await ap.evaluate(SIGNATURE, "#input-area");
  const perdus = Object.keys(sigAv).filter(k => !(k in sigAp));
  const nouveaux = Object.keys(sigAp).filter(k => !(k in sigAv));
  const modifies = Object.keys(sigAp).filter(k => k in sigAv && sigAp[k] !== sigAv[k]);
  ok("aucun élément perdu dans la zone de saisie", perdus.length === 0, perdus.slice(0, 4).join(", "));
  ok("aucun élément apparu", nouveaux.length === 0, nouveaux.slice(0, 4).join(", "));
  ok("seul #send-btn a changé de style", modifies.length === 1 && /send-btn/.test(modifies[0]),
     modifies.length + " modifié(s) : " + modifies.slice(0, 5).join(", "));

  /* ── 5. la barre supérieure n'a pas bougé (le correctif ne la touche pas) ── */
  section("5. La barre supérieure est intacte");
  const sigTopAp = await ap.evaluate(SIGNATURE, "#v6-topbar");
  const sigTopAv = await av.evaluate(SIGNATURE, "#v6-topbar");
  const diffTop = Object.keys(sigTopAp).filter(k => k in sigTopAv && sigTopAp[k] !== sigTopAv[k]);
  ok("aucun style de la barre supérieure n'a changé", diffTop.length === 0, diffTop.slice(0, 4).join(", "));

  /* ── 6. propreté ── */
  section("6. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
