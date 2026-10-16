/* ═══════════════════════════════════════════════════════════════
   Banc v595 — DÉBORDEMENT DE LA BARRE D'OUTILS.
   Défaut mesuré avant correction : la bande `.header-controls` contient
   8 boutons pour 981 px de contenu dans une boîte de 544 px à 1280 px — elle
   défile, mais son contenu est ROGNÉ (4 boutons sur 8 visibles à 1280).

   INVARIANT VÉRIFIÉ ICI : à TOUTE largeur, aucun bouton de la bande n'est
   rogné — chaque bouton est SOIT entièrement dans la boîte de la bande, SOIT
   dans le menu « Plus ». Et l'ENSEMBLE des boutons est identique partout :
   rien n'est perdu, rien n'est dupliqué.

   ⚠️ Piège de mesure évité : `getBoundingClientRect()` ne tient pas compte du
   rognage d'un ancêtre. Un relevé qui s'y fie compte comme « visibles » des
   boutons hors de la boîte — c'est ce qui a masqué le défaut au premier audit.
   On compare donc le rectangle du bouton à celui de sa BOÎTE.
   Magasin isolé (v559). ═══════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}
const LARGEURS = [1920, 1600, 1440, 1366, 1280, 1152, 1024, 900];

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v595_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1920, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2800);

  /* ── 1. le module est en place ── */
  section("1. Le module est chargé");
  const dispo = await page.evaluate(() => typeof window.__v595Topbar);
  ok("window.__v595Topbar est exposé", dispo === "object", dispo);

  const releve = async (w) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(450);          /* debounce du module : 120 ms */
    return page.evaluate(() => {
      const b = document.querySelector(".header-controls");
      const m = document.getElementById("v6-more-menu");
      if (!b || !m) return null;
      const bb = b.getBoundingClientRect();
      const dansBande = Array.prototype.slice.call(b.querySelectorAll(".hud-btn"));
      const auMenu = Array.prototype.slice.call(m.querySelectorAll('.hud-btn[data-v595="1"]'));
      const rognes = [];
      dansBande.forEach(function (el) {
        const r = el.getBoundingClientRect();
        if (r.left < bb.left - 1 || r.right > bb.right + 1) rognes.push(el.id || el.textContent.trim().slice(0, 12));
      });
      return {
        nBande: dansBande.length, nMenu: auMenu.length,
        ids: dansBande.map(e => e.id).concat(auMenu.map(e => e.id)).sort(),
        rognes: rognes,
        deborde: b.scrollWidth - b.clientWidth,
        etiquette: !!m.querySelector('.mm-label[data-v595="1"]')
      };
    });
  };

  const releves = {};
  for (const w of LARGEURS) releves[w] = await releve(w);

  /* ── 2. L'INVARIANT : aucun bouton rogné, à aucune largeur ── */
  section("2. Aucun bouton de la bande n'est rogné (l'invariant)");
  let fautifs = [];
  LARGEURS.forEach(function (w) {
    const r = releves[w];
    if (r && r.rognes.length) fautifs.push(w + "px : " + r.rognes.join(","));
  });
  ok("aucun bouton hors de la boîte à aucune des " + LARGEURS.length + " largeurs",
     fautifs.length === 0, fautifs.join(" | ") || "toutes propres");

  /* ── 3. Rien n'est perdu ni dupliqué ── */
  section("3. L'ensemble des boutons est identique partout");
  const reference = releves[1920] ? releves[1920].ids.join("|") : "";
  let ecarts = [];
  LARGEURS.forEach(function (w) {
    const r = releves[w];
    if (!r) return;
    if (r.ids.join("|") !== reference) ecarts.push(w + "px (" + r.ids.length + " boutons)");
  });
  ok("mêmes boutons à toutes les largeurs (" + (releves[1920] ? releves[1920].ids.length : 0) + ")",
     ecarts.length === 0, ecarts.join(" | ") || "identiques");

  /* ── 4. À 1920 tout tient ; à 1280 le menu prend le relais ── */
  section("4. Le menu prend le relais quand la place manque");
  const r1920 = releves[1920], r1280 = releves[1280];
  ok("à 1920 px : tout tient dans la bande (0 au menu)", r1920.nMenu === 0 && r1920.deborde <= 1,
     JSON.stringify({ bande: r1920.nBande, menu: r1920.nMenu, deborde: r1920.deborde }));
  ok("à 1280 px : des boutons sont descendus au menu", r1280.nMenu > 0, JSON.stringify({ bande: r1280.nBande, menu: r1280.nMenu }));
  ok("à 1280 px : la bande ne déborde plus", r1280.deborde <= 1, "débordement " + r1280.deborde + " px");
  ok("l'étiquette de section suit (présente quand le menu sert)",
     r1280.etiquette === true && r1920.etiquette === false,
     JSON.stringify({ a1280: r1280.etiquette, a1920: r1920.etiquette }));
  console.log("   répartition par largeur :");
  LARGEURS.forEach(function (w) {
    const r = releves[w];
    if (r) console.log("     " + String(w).padStart(5) + " px → bande " + r.nBande + ", menu " + r.nMenu + ", débordement " + r.deborde + " px");
  });

  /* ── 5. Un bouton descendu est ATTEIGNABLE dans le menu ── */
  section("5. Un bouton descendu est réellement atteignable");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(450);
  const atteignable = await page.evaluate(() => {
    const grp = document.getElementById("v6-right-grp");
    const btns = grp ? grp.querySelectorAll(".v6-iconbtn") : [];
    const more = btns[btns.length - 1];
    if (!more) return { err: "bouton Plus introuvable" };
    more.click();
    const m = document.getElementById("v6-more-menu");
    if (!m.classList.contains("open")) return { err: "menu non ouvert" };
    const cible = m.querySelector('.hud-btn[data-v595="1"]');
    if (!cible) return { err: "aucun bouton descendu" };
    const r = cible.getBoundingClientRect();
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const res = { id: cible.id, ok: !!(dessus && (dessus === cible || cible.contains(dessus))) };
    m.classList.remove("open");
    return res;
  });
  ok("le bouton descendu répond au clic dans le menu", atteignable.ok === true, JSON.stringify(atteignable));

  /* ── 6. idempotence et réversibilité ── */
  section("6. Idempotence et réversibilité");
  const idem = await page.evaluate(() => {
    const av = window.__v595Topbar.ajuster();
    const ap = window.__v595Topbar.ajuster();
    return { av: av, ap: ap };
  });
  ok("rejouer l'ajustement ne change plus rien",
     idem.av && idem.ap && idem.av.bande === idem.ap.bande && idem.av.menu === idem.ap.menu,
     JSON.stringify(idem));
  const retour = await page.evaluate(async () => {
    window.dispatchEvent(new Event("resize"));
    await new Promise(r => setTimeout(r, 500));
    return window.__v595Topbar.ajuster();
  });
  /* on est encore à 1280 : le résultat doit être stable, pas un va-et-vient */
  ok("aucun va-et-vient après un événement de redimensionnement",
     retour && retour.bande === idem.ap.bande && retour.menu === idem.ap.menu,
     JSON.stringify(retour));

  /* ── 7. retour à une grande largeur : tout remonte ── */
  const r1920b = await releve(1920);
  ok("à 1920 px de nouveau : la bande reprend TOUT, menu vide",
     r1920b.nMenu === 0 && r1920b.nBande === r1920.nBande && r1920b.rognes.length === 0,
     JSON.stringify({ bande: r1920b.nBande, menu: r1920b.nMenu, rognes: r1920b.rognes }));

  /* ── 8. propreté ── */
  section("8. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
