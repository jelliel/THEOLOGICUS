/* ═══════════════════════════════════════════════════════════════
   Banc v597 — LE DÉBORDEMENT DE LA BANDE EST-IL VISIBLE ET ATTEIGNABLE ?

   Défaut visé (mesuré) : `.header-controls` contient 12 enfants pour 981 px de
   contenu dans une boîte de 544 px à 1280. Elle défile, mais rien ne le signale
   et la molette verticale ne la fait pas défiler.

   Méthode du projet : A/B au MÊME relais (`_before.html` matérialisé par
   `git show HEAD:…`) ET CONTRÔLE NÉGATIF — chaque capacité doit d'abord être
   PROUVÉE ABSENTE avant correction. Sans cela, le banc ne teste rien.

   Ce module ne déplace AUCUN élément : le banc vérifie donc aussi qu'aucun
   élément de la barre n'a été perdu, gagné ou déplacé. ═══════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

const ETAT = () => {
  const b = document.querySelector(".header-controls");
  if (!b) return { err: "bande absente" };
  const p = b.parentElement;
  const ap = getComputedStyle(p, "::after");
  return {
    scrollW: b.scrollWidth, clientW: b.clientWidth, scrollLeft: Math.round(b.scrollLeft),
    reste: Math.round(b.scrollWidth - b.clientWidth - b.scrollLeft),
    classe: p.classList.contains("v597-deborde"),
    opacite: parseFloat(ap.opacity) || 0,
    contenuAfter: (ap.content || "").slice(0, 12)
  };
};

/* signature de la barre, en IGNORANT mes propres classes (sinon l'A/B
   signalerait comme « modifié » ce que le module ajoute exprès). */
const SIGNATURE = () => {
  const t = document.getElementById("v6-topbar");
  if (!t) return {};
  const out = {};
  Array.prototype.forEach.call(t.querySelectorAll("*"), el => {
    const cl = typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).filter(c => c !== "v597" && c !== "v597-deborde").join(".") : "";
    const id = el.id ? "#" + el.id : "";
    const cs = getComputedStyle(el);
    out[el.tagName + id + cl] = [cs.color, cs.backgroundColor, cs.fontSize, cs.width, cs.height, cs.position].join("|");
  });
  return out;
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v597_" + Date.now()) });
  const browser = await H.launchBrowser();
  const base = "http://127.0.0.1:" + port + "/";
  const bruit = [];
  async function charger(f) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    p.on("pageerror", e => bruit.push(f + " : " + String(e)));
    await p.addInitScript(H.isolationInit);
    await p.goto(base + f, { waitUntil: "domcontentloaded", timeout: 60000 });
    await H.adminLogin(p, H.AUTH_HASH);
    await p.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(2400);
    return p;
  }

  /* ── 1. CONTRÔLE NÉGATIF : avant, le débordement est muet ── */
  section("1. Contrôle négatif — avant, rien ne signalait le débordement");
  const av = await charger("_before.html");
  const a1 = await av.evaluate(ETAT);
  console.log("   avant : scrollW " + a1.scrollW + " / clientW " + a1.clientW + " → reste " + a1.reste + " px à droite");
  ok("la bande débordait bien (le défaut est réel)", a1.reste > 100, "reste = " + a1.reste + " px");
  ok("aucun signal de débordement n'existait (pas de pseudo-élément)", a1.contenuAfter === "none", JSON.stringify({ op: a1.opacite, content: a1.contenuAfter }));
  /* la molette verticale ne faisait pas défiler la bande */
  await av.hover(".header-controls");
  await av.mouse.wheel(0, 400);
  await av.waitForTimeout(300);
  const a2 = await av.evaluate(() => Math.round(document.querySelector(".header-controls").scrollLeft));
  ok("la molette verticale faisait DÉJÀ défiler la bande (natif — aucun JS requis)", a2 > 0, "scrollLeft = " + a2);
  /* la souris est restée sur la bande après le défilement : un bouton survolé
     porte des styles :hover, ce qui ferait échouer l'A/B pour rien. */
  await av.mouse.move(2, 2);
  await av.waitForTimeout(200);
  const sigAv = await av.evaluate(SIGNATURE);

  /* ── 2. APRÈS : le débordement est signalé ── */
  section("2. Après — le débordement est signalé");
  const ap = await charger("THEOLOGICUS.html");
  const b1 = await ap.evaluate(ETAT);
  ok("un dégradé de bord est posé", b1.contenuAfter !== "none" && b1.contenuAfter !== "", "content = " + b1.contenuAfter);
  ok("il est VISIBLE quand il reste du contenu", b1.classe === true && b1.opacite > 0.9, JSON.stringify({ classe: b1.classe, op: b1.opacite }));

  /* ── 3. la molette fait maintenant défiler ── */
  section("3. Après — le défilement natif fonctionne toujours (le module n'y touche pas)");
  await ap.hover(".header-controls");
  await ap.mouse.wheel(0, 400);
  await ap.waitForTimeout(350);
  const b2 = await ap.evaluate(ETAT);
  ok("scrollLeft a augmenté", b2.scrollLeft > 0, "scrollLeft = " + b2.scrollLeft + " (reste " + b2.reste + " px)");

  /* ── 4. le signal disparaît quand on est au bout ── */
  section("4. Le signal disparaît une fois au bout");
  const b3 = await ap.evaluate(async () => {
    const b = document.querySelector(".header-controls");
    b.scrollLeft = b.scrollWidth;          /* tout à droite */
    b.dispatchEvent(new Event("scroll"));
    await new Promise(r => setTimeout(r, 250));
    const p = b.parentElement;
    return { reste: Math.round(b.scrollWidth - b.clientWidth - b.scrollLeft), classe: p.classList.contains("v597-deborde") };
  });
  ok("au bout, le dégradé s'efface (il n'annonce plus de suite)", b3.reste <= 1 && b3.classe === false, JSON.stringify(b3));

  /* ── 5. à 1920 : aucun débordement, donc aucun signal ── */
  section("5. À 1920 px — rien à signaler, donc rien n'est affiché");
  await ap.setViewportSize({ width: 1920, height: 900 });
  await ap.waitForTimeout(500);
  const b4 = await ap.evaluate(ETAT);
  ok("aucun débordement", b4.reste <= 1, "reste = " + b4.reste + " px");
  ok("aucun signal affiché", b4.classe === false && b4.opacite === 0, JSON.stringify({ classe: b4.classe, op: b4.opacite }));

  /* ── 6. A/B : rien n'a été déplacé ni perdu ── */
  section("6. A/B — aucun élément déplacé, perdu ou restylé");
  await ap.setViewportSize({ width: 1280, height: 900 });
  await ap.waitForTimeout(400);
  await ap.mouse.move(2, 2);          /* sinon l'état :hover d'un bouton fausse l'A/B */
  await ap.waitForTimeout(200);
  const sigAp = await ap.evaluate(SIGNATURE);
  const perdus = Object.keys(sigAv).filter(k => !(k in sigAp));
  const nouveaux = Object.keys(sigAp).filter(k => !(k in sigAv));
  const modifies = Object.keys(sigAp).filter(k => k in sigAv && sigAp[k] !== sigAv[k]);
  ok("aucun élément perdu dans la barre", perdus.length === 0, perdus.slice(0, 5).join(", "));
  ok("aucun élément apparu", nouveaux.length === 0, nouveaux.slice(0, 5).join(", "));
  const voulus = modifies.filter(k => k === "DIV.v6-grp");
  const autres = modifies.filter(k => k !== "DIV.v6-grp");
  ok("seul .v6-grp a changé, et seulement de position (ancrage du dégradé)",
     voulus.length === 1 && autres.length === 0, "modifiés : " + modifies.slice(0, 5).join(", "));
  const posGrp = await ap.evaluate(() => getComputedStyle(document.querySelector(".header-controls").parentElement).position);
  ok("v6-grp est bien en position relative (et cela ne déplace rien)", posGrp === "relative", posGrp);
  const ordre = await ap.evaluate(() => Array.prototype.map.call(document.querySelector(".header-controls").children, c => c.id || c.tagName).join(","));
  const ordreAv = await av.evaluate(() => Array.prototype.map.call(document.querySelector(".header-controls").children, c => c.id || c.tagName).join(","));
  ok("l'ORDRE des enfants de la bande est identique", ordre === ordreAv, ordre.slice(0, 60));

  /* ── 7. propreté ── */
  section("7. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
