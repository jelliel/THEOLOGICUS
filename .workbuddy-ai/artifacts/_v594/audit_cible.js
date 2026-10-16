/* Seconde passe CIBLÉE sur les trois points ambigus du premier relevé :
   1. quels boutons du HUD sont VISIBLES mais RECOUVERTS, et par quoi ?
   2. la barre d'outils du composeur est-elle défilable (donc le SEND
      atteignable) ou tronquée (donc perdu) ?
   3. #send-btn : dégradé ou couleur unie ? (le skill avertit qu'un dégradé
      n'est PAS mesurable comme une couleur unie)
   4. sur mobile, comment atteint-on les 51 boutons du HUD non visibles ?
   ═══════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_audit2_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const nom = "el => el.id ? '#'+el.id : (typeof el.className==='string'&&el.className ? '.'+el.className.trim().split(/\\s+/)[0] : el.tagName)";

  for (const vp of [{ n: "1280", w: 1280, h: 900 }, { n: "390", w: 390, h: 844 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const nm = el => el.id ? "#" + el.id : (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : el.tagName);
      const vis = el => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
        const b = el.getBoundingClientRect();
        return b.width > 1 && b.height > 1;
      };
      const out = {};

      /* 1. boutons visibles mais recouverts */
      out.recouverts = [];
      Array.prototype.forEach.call(document.querySelectorAll(".hud-btn"), function (b) {
        if (!vis(b)) return;
        const b2 = b.getBoundingClientRect();
        const cx = b2.left + b2.width / 2, cy = b2.top + b2.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { out.recouverts.push({ qui: nm(b), par: "HORS ÉCRAN" }); return; }
        const d = document.elementFromPoint(cx, cy);
        if (d && !(d === b || b.contains(d) || d.contains(b))) out.recouverts.push({ qui: nm(b), par: nm(d) });
      });

      /* 2. la barre du composeur */
      const bar = document.querySelector(".v12-bar");
      if (bar) {
        const cs = getComputedStyle(bar);
        const sb = document.getElementById("send-btn");
        const rb = bar.getBoundingClientRect(), rs = sb ? sb.getBoundingClientRect() : null;
        out.barre = {
          overflowX: cs.overflowX, scrollW: bar.scrollWidth, clientW: bar.clientWidth,
          defilable: bar.scrollWidth > bar.clientWidth + 1,
          sendVisible: rs ? (rs.left >= rb.left - 1 && rs.right <= rb.right + 1) : null,
          sendDansLeChamp: rs ? (rs.left >= 0 && rs.right <= innerWidth) : null,
          sendRight: rs ? Math.round(rs.right) : null, vw: innerWidth
        };
      }
      /* 3. le fond réel du bouton SEND */
      const sb = document.getElementById("send-btn");
      if (sb) {
        const cs = getComputedStyle(sb);
        out.send = {
          color: cs.color, bgColor: cs.backgroundColor, bgImage: (cs.backgroundImage || "").slice(0, 120),
          gradient: cs.backgroundImage && cs.backgroundImage !== "none"
        };
      }
      /* 4. l'accès aux boutons masqués sur mobile */
      const burger = document.querySelector('#burger, .burger, [id*="menu"], [id*="burger"], [aria-label*="menu"]');
      out.accueilMobile = {
        burger: burger ? nm(burger) : "aucun",
        hudVisibles: Array.prototype.filter.call(document.querySelectorAll(".hud-btn"), vis).map(nm),
        hudTotal: document.querySelectorAll(".hud-btn").length
      };
      return out;
    });
    console.log("\n══════ " + vp.n + " px ══════");
    console.log("Boutons du HUD visibles mais NON atteignables : " + r.recouverts.length);
    r.recouverts.forEach(x => console.log("   " + x.qui + "  ← recouvert par " + x.par));
    if (r.barre) {
      console.log("Barre du composeur : overflow-x=" + r.barre.overflowX + " | scrollW " + r.barre.scrollW + " / clientW " + r.barre.clientW
        + " | défilable=" + r.barre.defilable);
      console.log("   SEND : entièrement dans la barre ? " + r.barre.sendVisible
        + " | dans le champ visible ? " + r.barre.sendDansLeChamp + " (right " + r.barre.sendRight + " / " + r.barre.vw + ")");
    }
    if (r.send) {
      console.log("SEND — color " + r.send.color + " | background-color " + r.send.bgColor);
      console.log("       background-image " + (r.send.gradient ? r.send.bgImage : "(aucun — couleur unie, donc MESURABLE)"));
    }
    console.log("HUD visible : " + r.accueilMobile.hudVisibles.length + "/" + r.accueilMobile.hudTotal
      + " → " + r.accueilMobile.hudVisibles.join(", "));
    console.log("Bouton de menu détecté : " + r.accueilMobile.burger);
  }
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(0);
})();
