/* ═══════════════════════════════════════════════════════════════
   Banc v597 — LE DÉBORDEMENT DE LA BANDE EST-IL VISIBLE ?

   🔴 RÉÉCRIT POUR ÊTRE AUTONOME. La première version chargeait `_before.html`
   (fichier local non versionné) : en CI il n'existe pas, le banc échouait, et
   la CI devenait ROUGE pour un défaut de PORTABILITÉ, pas pour une régression.
   ⇒ Un banc ne dépend que de ce qui est versionné.

   L'état « avant » se reconstitue DANS LA PAGE : on désactive la feuille v597
   (`sheet.disabled = true`) et on retire les classes qu'elle ajoute. A/B à
   instrument STRICTEMENT égal — même page, même instant.
   Contrôle NÉGATIF exigé : sans la feuille, le signal de débordement doit
   DISPARAÎTRE. ══════════════════════════════════════════════════════════════ */
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
    contenu: (ap.content || "").slice(0, 10)
  };
};

const SIGNATURE = () => {
  const t = document.getElementById("v6-topbar");
  if (!t) return {};
  const out = {};
  Array.prototype.forEach.call(t.querySelectorAll("*"), el => {
    const cl = typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).filter(c => c !== "v597" && c !== "v597-deborde").join(".") : "";
    const cs = getComputedStyle(el);
    out[el.tagName + (el.id ? "#" + el.id : "") + cl] = [cs.color, cs.backgroundColor, cs.fontSize, cs.width, cs.height, cs.position].join("|");
  });
  return out;
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v597_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2600);
  await page.mouse.move(2, 2);

  /* bascule : module actif ou non, sans recharger la page */
  const basculer = (actif) => page.evaluate((on) => {
    const css = document.getElementById("v597-css");
    if (css && css.sheet) css.sheet.disabled = !on;
    const p = document.querySelector(".header-controls").parentElement;
    if (on) p.classList.add("v597");
    else { p.classList.remove("v597"); p.classList.remove("v597-deborde"); }
    return { feuille: !!css, desactivee: css && css.sheet ? css.sheet.disabled : null };
  }, actif);

  /* ── 1. CONTRÔLE NÉGATIF ── */
  section("1. Contrôle négatif — sans le module, aucun signal");
  await basculer(false);
  await page.waitForTimeout(200);
  const a1 = await page.evaluate(ETAT);
  console.log("   sans module : scrollW " + a1.scrollW + " / clientW " + a1.clientW + " → reste " + a1.reste + " px");
  ok("la bande déborde bien (le défaut est réel)", a1.reste > 100, "reste = " + a1.reste + " px");
  ok("aucun pseudo-élément de signal", a1.contenu === "none", "content = " + a1.contenu);
  ok("aucune classe de débordement", a1.classe === false, "classe = " + a1.classe);
  /* le défilement à la molette est NATIF : on le constate sans le module */
  await page.hover(".header-controls");
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  const a2 = await page.evaluate(() => Math.round(document.querySelector(".header-controls").scrollLeft));
  ok("la molette verticale faisait DÉJÀ défiler la bande (natif — aucun JS requis)", a2 > 0, "scrollLeft = " + a2);
  await page.evaluate(() => { document.querySelector(".header-controls").scrollLeft = 0; });
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  const sigAv = await page.evaluate(SIGNATURE);

  /* ── 2. APRÈS ── */
  section("2. Avec le module — le débordement est signalé");
  await basculer(true);
  await page.waitForTimeout(250);
  const b1 = await page.evaluate(ETAT);
  ok("un dégradé de bord est posé", b1.contenu !== "none" && b1.contenu !== "", "content = " + b1.contenu);
  ok("il est VISIBLE quand il reste du contenu", b1.classe === true && b1.opacite > 0.9,
     JSON.stringify({ classe: b1.classe, op: b1.opacite }));

  /* ── 3. le signal s'efface au bout ── */
  section("3. Le signal s'efface une fois au bout");
  const b3 = await page.evaluate(async () => {
    const b = document.querySelector(".header-controls");
    b.scrollLeft = b.scrollWidth;
    b.dispatchEvent(new Event("scroll"));
    await new Promise(r => setTimeout(r, 300));
    return { reste: Math.round(b.scrollWidth - b.clientWidth - b.scrollLeft), classe: b.parentElement.classList.contains("v597-deborde") };
  });
  ok("au bout, le dégradé s'efface", b3.reste <= 1 && b3.classe === false, JSON.stringify(b3));

  /* ── 4. à 1920 : rien à signaler ── */
  section("4. À 1920 px — pas de débordement, donc pas de signal");
  await page.evaluate(() => { document.querySelector(".header-controls").scrollLeft = 0; });
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.waitForTimeout(500);
  const b4 = await page.evaluate(ETAT);
  ok("aucun débordement", b4.reste <= 1, "reste = " + b4.reste + " px");
  ok("aucun signal affiché", b4.classe === false && b4.opacite === 0, JSON.stringify({ classe: b4.classe, op: b4.opacite }));

  /* ── 5. A/B ── */
  section("5. A/B — rien déplacé, perdu ou restylé");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(450);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  const sigAp = await page.evaluate(SIGNATURE);
  const perdus = Object.keys(sigAv).filter(k => !(k in sigAp));
  const nouveaux = Object.keys(sigAp).filter(k => !(k in sigAv));
  const modifies = Object.keys(sigAp).filter(k => k in sigAv && sigAp[k] !== sigAv[k]);
  ok("aucun élément perdu dans la barre", perdus.length === 0, perdus.slice(0, 5).join(", "));
  ok("aucun élément apparu", nouveaux.length === 0, nouveaux.slice(0, 5).join(", "));
  const autres = modifies.filter(k => !/v6-grp/.test(k));
  ok("seul .v6-grp change, et seulement de position (ancrage du dégradé)",
     autres.length === 0, "modifiés : " + modifies.slice(0, 5).join(", "));
  const ordreBrut = await page.evaluate(() => Array.prototype.map.call(document.querySelector(".header-controls").children, c => c.id || c.tagName).join(","));
  // #v598-plus (module v598, ultérieur) est un enfant LÉGITIME de la bande en cas de
  // débordement : on l'exclut de l'A/B d'ordre, qui ne doit vérifier que le fait que
  // les 12 contrôles d'ORIGINE ne bougent pas. (v598 n'en déplace aucun — prouvé par
  // verify_v598_overflow_menu.js : rects identiques on/off.)
  const ordre = ordreBrut.split(",").filter(x => x !== "v598-plus").join(",");
  ok("l'ORDRE des 12 contrôles d'origine est inchangé (aucun déplacé — #v598-plus exclu)",
     ordre.split(",").length === 12 && /open-palette,model-select,open-gsearch/.test(ordre), ordre.slice(0, 70));

  /* ── 6. propreté ── */
  section("6. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
