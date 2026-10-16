/* ═══════════════════════════════════════════════════════════════
   Banc v598 — LE MENU « PLUS » REND-IL TOUS LES CONTRÔLES ATTEIGNABLES ?

   🔴 AUTONOME (leçon v596/v597) : l'état « avant » se reconstitue DANS LA PAGE
   via window.__v598Overflow.disable() (retire le bouton + le menu), sans aucun
   fichier externe. A/B à instrument strictement égal — même page, même instant.
   Contrôle NÉGATIF exigé : sans le module, la bande déborde MAIS aucun bouton
   « Plus » n'existe → le défaut est réel et seul le module le comble.

   Périmètres :
   · le bouton n'apparaît QUE sur débordement, et est RETIRÉ à 1920 → le DOM y est
     strictement identique à avant (garde-fou 1920 de v595) ;
   · aucun contrôle existant n'est déplacé : on crée de nouveaux proxys ;
   · le menu liste tous les contrôles présents dans la bande à l'ouverture. ══════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ pass: !!cond, label, detail: detail || "" });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

const ETAT = () => {
  const b = document.querySelector(".header-controls");
  const plus = document.getElementById("v598-plus");
  const menu = document.getElementById("v598-menu");
  const grp = b ? b.parentElement : null;
  const rp = plus ? plus.getBoundingClientRect() : null;
  const rg = grp ? grp.getBoundingClientRect() : null;
  const inter = b ? Array.prototype.filter.call(b.children,
    c => (c.tagName === "BUTTON" || c.tagName === "SELECT") && c.id !== "v598-plus").length : 0;
  return {
    scrollW: b ? b.scrollWidth : 0, clientW: b ? b.clientWidth : 0,
    plusPresent: !!plus,
    plusVisible: plus ? (getComputedStyle(plus).display !== "none" && plus.getBoundingClientRect().width > 0) : false,
    plusRight: rp ? Math.round(rp.right) : null,
    grpRight: rg ? Math.round(rg.right) : null,
    menuPresent: !!menu,
    itemCount: (window.__v598Overflow ? window.__v598Overflow.itemCount() : 0),
    bandInteractive: inter,
    order: b ? Array.prototype.map.call(b.children, c => c.id || c.tagName).join(",") : ""
  };
};

const SIGNATURE = () => {
  const t = document.getElementById("v6-topbar");
  if (!t) return {};
  const out = {};
  Array.prototype.forEach.call(t.querySelectorAll("*"), el => {
    if (el.id === "v598-plus" || el.id === "v598-menu") return; // ajout attendu, exclu
    // on exclut les classes dynamiques de v597 (débordement) et les dimensions
    // fragiles (width/height) : un bouton sticky ajouté provoque une redistribution
    // de ~4 px entre les deux groupes de la barre, sans déplacer AUCUN contrôle
    // (voir garde-fou « rects » en section 6). « restylé » = couleur/fond/police/
    // position/display modifiés, pas un simple delta de largeur de conteneur.
    const cl = typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).filter(c => c && c !== "v597" && c !== "v597-deborde").join(".") : "";
    const cs = getComputedStyle(el);
    out[el.tagName + (el.id ? "#" + el.id : "") + cl] =
      [cs.color, cs.backgroundColor, cs.fontSize, cs.position, cs.display].join("|");
  });
  return out;
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v598_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!window.__v598Overflow && !!document.querySelector(".header-controls"), { timeout: 15000 });
  await page.waitForTimeout(2600);
  await page.mouse.move(2, 2);

  // helpers de bascule/ouverture/fermeture — définis DANS l'IIFE pour clore sur `page`
  const basculer = (on) => page.evaluate((o) => {
    if (o) window.__v598Overflow.enable(); else window.__v598Overflow.disable();
    return true;
  }, on);
  const ouvrir = () => page.evaluate(() => { const p = document.getElementById("v598-plus"); if (p) p.click(); return !!document.getElementById("v598-menu"); });
  const fermer = () => page.evaluate(() => { if (window.__v598Overflow) window.__v598Overflow.closeMenu(); return true; });
  // snapshot des rectangles de tous les contrôles de la bande (hors #v598-plus).
  // comparer on/off prouve qu'AUCUN contrôle existant ne BOUGE (garde-fou « pas de
  // changement de mise en page » au sens utilisateur — le seul ajout est le Plus).
  const RECTS = () => page.evaluate(() => {
    const b = document.querySelector(".header-controls");
    return Array.prototype.map.call(b.children, c => (c.id || c.tagName) + ":" +
      (() => { const r = c.getBoundingClientRect();
        return Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width) + "x" + Math.round(r.height); })()).join("|");
  });
  const sansPlus = (s) => s.split("|").filter(t => !/^v598-plus:/.test(t)).join("|");

  // Normalise : #v598-plus n'est un enfant de la bande QUE quand le module est actif ;
  // on le retire des deux côtés pour comparer l'ORDRE RÉEL des contrôles existants.
  const NORM_ORDRE = (s) => s.split(",").filter(x => x !== "v598-plus").join(",");
  const baselineOrdre = NORM_ORDRE((await page.evaluate(ETAT)).order);

  /* ── 1. CONTRÔLE NÉGATIF ── */
  section("1. Contrôle négatif — sans le module, débordement réel mais aucun « Plus »");
  await basculer(false);
  await page.waitForTimeout(250);
  const a1 = await page.evaluate(ETAT);
  ok("la bande déborde bien (le défaut est réel)", a1.scrollW - a1.clientW > 100, "reste = " + (a1.scrollW - a1.clientW) + " px");
  ok("aucun bouton #v598-plus sans le module", a1.plusPresent === false, "plusPresent = " + a1.plusPresent);
  ok("aucun menu #v598-menu sans le module", a1.menuPresent === false, "menuPresent = " + a1.menuPresent);

  /* ── 2. APRÈS : bouton visible, non rogné, ouvre le menu ── */
  section("2. Avec le module — bouton visible, non rogné, ouvre le menu");
  await basculer(true);
  await page.waitForTimeout(350);
  const b1 = await page.evaluate(ETAT);
  ok("le bouton #v598-plus existe", b1.plusPresent === true);
  ok("il est visible", b1.plusVisible === true);
  ok("il n'est PAS rogné (bord droit ≤ bord droit du groupe)",
     b1.plusRight !== null && b1.grpRight !== null && b1.plusRight <= b1.grpRight + 2,
     "plus.right=" + b1.plusRight + " grp.right=" + b1.grpRight);
  const ouvert = await ouvrir();
  await page.waitForTimeout(200);
  const b2 = await page.evaluate(ETAT);
  ok("clic sur le bouton ouvre le menu", ouvert && b2.menuPresent, "menuPresent=" + b2.menuPresent);
  ok("le menu liste TOUS les contrôles de la bande",
     b2.itemCount === b1.bandInteractive && b1.bandInteractive > 0,
     "items=" + b2.itemCount + " / interactifs=" + b1.bandInteractive);
  await fermer();
  await page.waitForTimeout(120);

  /* ── 3. COMPORTEMENT : un item déclenche le vrai contrôle ── */
  section("3. Un item de menu déclenche le contrôle réel (sans ouvrir de modale parasite)");
  const tgt = await page.evaluate(() => {
    const b = document.querySelector(".header-controls");
    const el = Array.prototype.find.call(b.children, c => c.tagName === "BUTTON" && c.id !== "v598-plus");
    window.__spy = false;
    el.addEventListener("click", function (ev) { ev.stopImmediatePropagation(); ev.preventDefault(); window.__spy = true; }, true);
    return el.id;
  });
  await ouvrir();
  await page.waitForTimeout(150);
  await page.evaluate((id) => {
    const it = document.querySelector('.v598-item[data-tgt="' + id + '"]');
    if (it) it.click();
  }, tgt);
  await page.waitForTimeout(150);
  const spy = await page.evaluate(() => window.__spy);
  const ferme3 = await page.evaluate(() => !window.__v598Overflow.isOpen());
  ok("cliquer l'item a bien appelé le contrôle (" + tgt + ")", spy === true, "spy=" + spy);
  ok("le menu s'est refermé après l'action", ferme3 === true);

  /* ── 4. SÉLECTEUR : le proxy focuse/sélectionne sans erreur ── */
  section("4. Un sélecteur (modèle/agent) est actionnable depuis le menu");
  const selId = await page.evaluate(() => {
    const b = document.querySelector(".header-controls");
    const s = Array.prototype.find.call(b.children, c => c.tagName === "SELECT" && c.id !== "v598-plus");
    return s ? s.id : null;
  });
  if (selId) {
    await ouvrir();
    await page.waitForTimeout(150);
    await page.evaluate((id) => {
      const it = document.querySelector('.v598-item[data-tgt="' + id + '"]');
      if (it) it.click();
    }, selId);
    await page.waitForTimeout(150);
    const ferme4 = await page.evaluate(() => !window.__v598Overflow.isOpen());
    ok("clic sur le sélecteur " + selId + " : menu refermé, aucune exception", ferme4 === true);
  } else {
    ok("sélecteur présent dans la bande (modèle/agent)", false, "aucun SELECT trouvé");
  }

  /* ── 5. 1920 : aucune régression, DOM identique à avant ── */
  section("5. À 1920 px — pas de débordement, donc aucun bouton ajouté");
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.waitForTimeout(500);
  await basculer(false); // état « avant » de référence À 1920 (pas de débordement → aucun Plus)
  await page.waitForTimeout(250);
  const wideAv = await page.evaluate(ETAT);
  const sigAv = await page.evaluate(SIGNATURE);
  await basculer(true); // module actif à 1920
  await page.waitForTimeout(450);
  const b4 = await page.evaluate(ETAT);
  const sigAp = await page.evaluate(SIGNATURE);
  ok("aucun débordement à 1920", b4.scrollW - b4.clientW <= 1, "reste = " + (b4.scrollW - b4.clientW));
  ok("le bouton est RETIRÉ (DOM identique à avant)", b4.plusPresent === false, "plusPresent=" + b4.plusPresent);
  const perdus = Object.keys(sigAv).filter(k => !(k in sigAp));
  const nouveaux = Object.keys(sigAp).filter(k => !(k in sigAv));
  const modifies = Object.keys(sigAp).filter(k => k in sigAv && sigAp[k] !== sigAv[k]);
  ok("A/B 1920 : aucun élément perdu", perdus.length === 0, perdus.slice(0, 4).join(", "));
  ok("A/B 1920 : aucun élément apparu", nouveaux.length === 0, nouveaux.slice(0, 4).join(", "));
  ok("A/B 1920 : aucun élément restylé", modifies.length === 0, modifies.slice(0, 4).join(", "));

  /* ── 6. A/B à 1280 : SEUL #v598-plus s'ajoute ── */
  section("6. A/B à 1280 — seul #v598-plus s'ajoute, rien d'autre ne bouge");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(500);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  const sig1280av = await page.evaluate(SIGNATURE); // avec module actif (plus present, exclu de la signature)
  await basculer(false);
  await page.waitForTimeout(250);
  const sig1280off = await page.evaluate(SIGNATURE); // module désactivé
  const rectsOff = sansPlus(await RECTS());
  // les deux signatures excluent déjà #v598-plus/#v598-menu
  const pNiches = Object.keys(sig1280av).filter(k => !(k in sig1280off));
  const pPerdus = Object.keys(sig1280off).filter(k => !(k in sig1280av));
  const pMod = Object.keys(sig1280off).filter(k => k in sig1280av && sig1280off[k] !== sig1280av[k]);
  ok("A/B 1280 : aucun élément perdu quand le module est retiré", pPerdus.length === 0, pPerdus.slice(0, 4).join(", "));
  ok("A/B 1280 : aucun élément apparu (hors #v598-plus, exclu)", pNiches.length === 0, pNiches.slice(0, 4).join(", "));
  ok("A/B 1280 : aucun élément restylé", pMod.length === 0, pMod.slice(0, 4).join(", "));
  const ordre1280 = NORM_ORDRE((await page.evaluate(ETAT)).order);
  ok("l'ORDRE des enfants de la bande est inchangé (aucun déplacé)",
     ordre1280 === baselineOrdre, ordre1280.slice(0, 60));
  await basculer(true);
  await page.waitForTimeout(300);
  const rectsOn = sansPlus(await RECTS());
  ok("aucun contrôle existant ne BOUGE (rects identiques on/off, hors Plus)",
     rectsOn === rectsOff, (rectsOn === rectsOff ? "" : "ON=" + rectsOn.slice(0, 80) + " / OFF=" + rectsOff.slice(0, 80)));

  /* ── 6b. ACCESSIBILITÉ (clavier + ARIA) ── */
  section("6b. Accessibilité — clavier + ARIA du menu « Plus »");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(150);
  const a11yBtn = await page.evaluate(() => {
    const b = document.getElementById("v598-plus");
    return b ? { popup: b.getAttribute("aria-haspopup"), ctl: b.getAttribute("aria-controls"), exp: b.getAttribute("aria-expanded") } : null;
  });
  ok("le bouton déclare aria-haspopup=menu", a11yBtn && a11yBtn.popup === "menu", JSON.stringify(a11yBtn));
  ok("le bouton relie le menu via aria-controls=v598-menu", a11yBtn && a11yBtn.ctl === "v598-menu", JSON.stringify(a11yBtn));

  const ouvertA = await ouvrir();
  await page.evaluate(() => { const m = document.getElementById("v598-menu"); if (m) m.focus(); });
  await page.waitForTimeout(180);
  const a11yMenu = await page.evaluate(() => {
    const m = document.getElementById("v598-menu");
    if (!m) return null;
    return {
      role: m.getAttribute("role"),
      labelled: m.getAttribute("aria-labelledby"),
      tab: m.tabIndex,
      activedesc: m.getAttribute("aria-activedescendant"),
      items: Array.prototype.map.call(m.querySelectorAll(".v598-item"), (it) => ({ role: it.getAttribute("role"), id: it.id })),
      active: window.__v598Overflow.activeIndex(),
      focusSurMenu: document.activeElement && document.activeElement.id === "v598-menu"
    };
  });
  ok("le menu s'ouvre", ouvertA && !!a11yMenu);
  ok("le menu porte role=menu + aria-labelledby=v598-plus", a11yMenu && a11yMenu.role === "menu" && a11yMenu.labelled === "v598-plus");
  ok("les items portent role=menuitem et des id stables v598-item-N",
     a11yMenu && a11yMenu.items.length > 0 && a11yMenu.items.every((it, i) => it.role === "menuitem" && it.id === "v598-item-" + i),
     a11yMenu ? a11yMenu.items.length + " items" : "menu absent");
  ok("à l'ouverture : focus sur le menu, 1er item actif + aria-activedescendant",
     a11yMenu && a11yMenu.focusSurMenu && a11yMenu.active === 0 && a11yMenu.activedesc === "v598-item-0",
     "active=" + (a11yMenu ? a11yMenu.active : "?"));

  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(60);
  let ai = await page.evaluate(() => window.__v598Overflow.activeIndex());
  ok("FlècheBas → item suivant (0→1)", ai === 1, "active=" + ai);
  await page.keyboard.press("ArrowUp"); await page.waitForTimeout(60);
  ai = await page.evaluate(() => window.__v598Overflow.activeIndex());
  ok("FlècheHaut → 1er item (1→0)", ai === 0, "active=" + ai);
  await page.keyboard.press("End"); await page.waitForTimeout(60);
  const lastIdx = await page.evaluate(() => window.__v598Overflow.itemCount() - 1);
  ai = await page.evaluate(() => window.__v598Overflow.activeIndex());
  ok("Fin → dernier item", ai === lastIdx, "active=" + ai + " last=" + lastIdx);
  await page.keyboard.press("Home"); await page.waitForTimeout(60);
  ai = await page.evaluate(() => window.__v598Overflow.activeIndex());
  ok("Début → 1er item", ai === 0, "active=" + ai);

  // Entrée sur un sélecteur (item 1 = model-select) : active l'item, ferme le menu, sans modale
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(60);
  await page.keyboard.press("Enter"); await page.waitForTimeout(220);
  const apresEntree = await page.evaluate(() => ({ open: window.__v598Overflow.isOpen() }));
  ok("Entrée active l'item et ferme le menu", apresEntree.open === false, JSON.stringify(apresEntree));

  await ouvrir();
  await page.evaluate(() => { const m = document.getElementById("v598-menu"); if (m) m.focus(); });
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape"); await page.waitForTimeout(180);
  const apresEchap = await page.evaluate(() => ({ open: window.__v598Overflow.isOpen(), focus: document.activeElement ? document.activeElement.id : null }));
  ok("Échap ferme le menu", apresEchap.open === false, JSON.stringify(apresEchap));
  ok("Échap rend le focus au bouton #v598-plus", apresEchap.focus === "v598-plus", "focus=" + apresEchap.focus);

  await ouvrir();
  await page.evaluate(() => { const m = document.getElementById("v598-menu"); if (m) m.focus(); });
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForTimeout(450);
  const apresResize = await page.evaluate(() => window.__v598Overflow.isOpen());
  ok("le menu se ferme au redimensionnement de la fenêtre", apresResize === false, "open=" + apresResize);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);

  /* ── 7. PROPRETÉ ── */
  section("7. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.child.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
