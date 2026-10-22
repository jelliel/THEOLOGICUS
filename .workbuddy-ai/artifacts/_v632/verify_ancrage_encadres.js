// Banc v632 — ANCRAGE TEXTE DES ENCADRES (les cadres ne bougent plus au reload).
//
// Il ne vérifie pas « une fonction existe » : il reproduit le BOGUE RAPPORTÉ.
// Protocole : créer l'encadré sur un mot précis, attendre le save, RE-CHARGER
// la page (vrai démarrage), mesurer l'écart entre le cadre rendu et le RECT DU
// MOT encadré dans la mise en page courante.
//
// CONTRÔLE NÉGATIF : BENCH_ROOT=<copie pré-v632> -> les scénarios « reload »
// doivent DÉRIVER (> 40 px). Sans cela le banc ne prouve rien.
//
//   1. ancre par texte       : cadre sur un mot -> reload -> < 6 px du mot
//   2. déplacement conservé  : glisser le cadre -> reload -> À SA PLACE
//   3. contenu modifié       : texte inséré AVANT le mot -> cadre suit le mot
//   4. occurrence répétée    : mot présent 4x -> bonne occurrence encadrée
//   5. dimensionnement libre : redimensionner -> reload -> taille conservée

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8842;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const NEG = !!process.env.BENCH_ROOT;

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

const TEXTE = `Le titre **Kurios** est central. Paul de Tarse utilise Kurios pour designer Jesus comme Seigneur.
Le mot Seigneur revient souvent : c'est le Seigneur des Seigneurs.
Enfin, « personne ne peut dire Jesus est Seigneur si ce n'est par l'Esprit ».`;

const CHAT = "__b632__";
const MSGTS = 1730000000000;

(async () => {
  console.log("=".repeat(74));
  console.log("BANC v632 — ANCRAGE TEXTE DES ENCADRES" + (NEG ? "  [CONTRÔLE NÉGATIF]" : ""));
  console.log("=".repeat(74));

  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    if (p === "/blank.html") { rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); rs.end("<!doctype html><title>b</title>"); return; }
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
  });

  // ── semer le chat dans IndexedDB + localStorage (même origine) ──
  async function semer(texte, shapes) {
    await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async ({ chatId, texte, msgTs, shapes }) => {
      const chat = { id: chatId, title: "Banc v632", updated: Date.now(), messages: [
        { role: "system", content: "sys", ts: 1 },
        { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: shapes || [] },
      ] };
      await new Promise((res, rej) => {
        const r = indexedDB.open("THEOLOGICUS_AI_DB");
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
          if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" });
        };
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction(["chats", "settings"], "readwrite");
          tx.objectStore("chats").put(chat);
          tx.objectStore("settings").put({ id: "currentChatId", value: chatId });
          tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
        };
        r.onerror = () => rej(r.error);
      });
      localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(chat));
      localStorage.setItem("currentChatId", chatId);
      localStorage.setItem("theo_chat_id", chatId);
    }, { chatId: CHAT, texte, msgTs: MSGTS, shapes });
  }

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      window.__disarm = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay");
        if (w) w.classList.remove("active");
      }, 250);
    });
  }

  // Vrai rechargement, puis sélection du chat semé.
  async function recharger() {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector(".message-content", { timeout: 20000 });
    // laisse l'applyShapes (rAF) et le ré-ancrage se faire
    await page.waitForTimeout(1200);
  }

  // Encadre la n-ième occurrence (0-based) d'un mot, par le chemin PRODUIT.
  async function encadrer(mot, n) {
    return page.evaluate(({ mot, n }) => {
      const box = document.querySelector(".message-content");
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
      let full = "", nodes = [], nd;
      while ((nd = walker.nextNode())) { nodes.push({ node: nd, s: full.length }); full += nd.nodeValue; }
      let k = -1;
      for (let i = 0; i <= n; i++) { k = full.indexOf(mot, k + 1); if (k === -1) return { err: "mot absent" }; }
      const pos = st => { for (let i = nodes.length - 1; i >= 0; i--) if (st >= nodes[i].s) return { node: nodes[i].node, off: st - nodes[i].s }; return null; };
      const a = pos(k), b = pos(k + mot.length);
      if (!a || !b) return { err: "position" };
      const rng = document.createRange(); rng.setStart(a.node, a.off); rng.setEnd(b.node, b.off);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
      const r = rng.getBoundingClientRect();
      const mr = document.querySelector(".message.assistant") || box.closest(".message");
      const msgTs = parseInt((mr && mr.dataset && mr.dataset.msgId) || "0", 10);
      /* __DBG_FIG existe dans les DEUX builds (avant et apres v632) : le
         controle negatif mesure donc exactement le meme chemin. */
      const inser = window.__atcInsertFig
        ? function () { window.__atcInsertFig({ msgTs: msgTs, range: rng.cloneRange(),
            selRect: { left: r.left, top: r.top, width: r.width, height: r.height }, texte: mot }, "Rectangle"); }
        : function () { window.__DBG_FIG.insertFigureAt({ msgTs: msgTs, range: rng.cloneRange(),
            selRect: { left: r.left, top: r.top, width: r.width, height: r.height }, texte: mot },
            { n: "Rectangle", svg: '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="24" height="24" fill="none"/></svg>' }); };
      inser();
      return { ok: true, idx: k };
    }, { mot, n });
  }


  // ── Accès SANS hook v632 (utilisable aussi sur la copie pré-v632) ──
  // L'état est lu via le localStorage persisté : c'est la MÊME donnée que
  // window.state, et elle existe dans les deux builds.
  async function lireFigures() {
    return page.evaluate(() => {
      try {
        const id = localStorage.getItem("currentChatId") || Object.keys(localStorage).filter(k => k.startsWith("theologicus_chat_")).map(k => k.replace("theologicus_chat_", ""))[0];
        const j = JSON.parse(localStorage.getItem("theologicus_chat_" + id) || "{}");
        const msgs = j.messages || [];
        const out = [];
        msgs.forEach((m, i) => (m.shapes || []).forEach(f => out.push(Object.assign({ msgIdx: i }, f))));
        return out;
      } catch (e) { return []; }
    });
  }

  // Mesure : écart entre le cadre rendu et le rect du MOT de l'ancre.
  async function mesure() {
    const figs = await lireFigures();
    return page.evaluate((figsIn) => {
      const FIG = figsIn;
      const box = document.querySelector(".message-content");
      const fb = document.querySelector(".atc-figbox");
      if (!box || !fb) return { err: "cadre=" + !!fb + " boite=" + !!box };
      const f = (FIG || []).find(s => s.id === fb.dataset.figId);
      if (!f) return { err: "figure introuvable dans les données" };
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n.parentElement && n.parentElement.closest &&
          n.parentElement.closest(".atc-figbox, .theo-fig, .theo-src-chips, [data-no-anchor]"))
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      let full = "", nodes = [], n;
      while ((n = walker.nextNode())) { nodes.push({ node: n, s: full.length }); full += n.nodeValue; }
      const norm = s => s.normalize("NFKC").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const info = { hasAncre: !!f.ancre, ancre: f.ancre || null, persiste: [Math.round(f.w), Math.round(f.h)] };
      if (!f.ancre) return Object.assign({ ok: true, libre: true }, info);
      const T = norm(f.ancre.texte || "");
      if (!T) return Object.assign({ ok: false, err: "ancre sans texte" }, info);
      const L = f.ancre.texte.length;
      const occ = [];
      for (let i = 0; i + L <= full.length; i++) if (norm(full.slice(i, i + L)) === T) occ.push(i);
      if (!occ.length) return Object.assign({ ok: false, err: "texte d'ancre introuvable" }, info);
      let best = occ[0], bd = Infinity;
      for (const o of occ) { const d = Math.abs(o - (f.ancre.start || 0)); if (d < bd) { bd = d; best = o; } }
      const pos = st2 => { for (let i = nodes.length - 1; i >= 0; i--) if (st2 >= nodes[i].s) return { node: nodes[i].node, off: st2 - nodes[i].s }; return null; };
      const a = pos(best), b = pos(best + L);
      if (!a || !b) return Object.assign({ ok: false, err: "position ancre" }, info);
      const rng = document.createRange(); rng.setStart(a.node, a.off); rng.setEnd(b.node, b.off);
      const wr = rng.getBoundingClientRect(), br = box.getBoundingClientRect(), fr = fb.getBoundingClientRect();
      /* Le cadre doit CONTENIR le mot (marge de 8/6 px côté gauche/haut).
         On mesure l'écart du BORD GAUCHE/HAUT du cadre au mot, pas du centre :
         la largeur du cadre est bornée (min 90 px) et ne doit pas compter. */
      const ecartX = Math.round((fr.left - br.left) - (wr.left - br.left - 8));
      const ecartY = Math.round((fr.top - br.top) - (wr.top - br.top - 6));
      const decalage = Math.round(Math.hypot(ecartX, ecartY));
      const contient = fr.left <= wr.left + 2 && fr.top <= wr.top + 2 &&
                       fr.right >= wr.right - 2 && fr.bottom >= wr.bottom - 2;
      return Object.assign({ ok: true, decalage, ecartX, ecartY, contient, occ: occ.length, best,
        taille: [Math.round(fr.width), Math.round(fr.height)] }, info);
    }, figs);
  }

  const glisser = (dir, dx, dy) => page.evaluate(({ dir, dx, dy }) => {
    const fb = document.querySelector(".atc-figbox");
    const r = fb.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const sel = dir === "move" ? fb.querySelector('.fb-edge[data-bord="t"]') : fb.querySelector('.h[data-dir="' + dir + '"]');
    if (!sel) return { err: "poignee" };
    sel.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: cx, clientY: cy, button: 0 }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: cx + dx, clientY: cy + dy }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: cx + dx, clientY: cy + dy }));
    return { ok: true };
  }, { dir, dx, dy });

  try {
    // ═══ 1. ancre par texte ═══
    await semer(TEXTE, []);
    await recharger();
    const e1 = await encadrer("Seigneur des", 0);
    ok("1a. encadré créé sur « Seigneur des »", e1.ok, JSON.stringify(e1));
    await page.waitForTimeout(1300);
    const m1a = await mesure();
    ok("1b. l'ancre porte le TEXTE du passage", m1a.hasAncre && m1a.ancre && m1a.ancre.texte, m1a.ancre && JSON.stringify(m1a.ancre));
    await recharger();
    const m1b = await mesure();
    ok("1c. après RELOAD : cadre sur le MÊME mot (< 6 px)", m1b.ok && m1b.decalage < 6,
      "décalage=" + m1b.decalage + " px (dx=" + m1b.ecartX + " dy=" + m1b.ecartY + " contient=" + m1b.contient + ")");

    // ═══ 2. déplacement manuel conservé ═══
    const p0 = await page.evaluate(() => { const r = document.querySelector(".atc-figbox").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; });
    await glisser("move", 70, 40);
    await page.waitForTimeout(1400);
    const figs1 = await lireFigures();
    const mid = await page.evaluate(() => {
      const fb = document.querySelector(".atc-figbox"); const r = fb.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top) };
    });
    Object.assign(mid, { ancre: !!figs1[0].ancre, dx: figs1[0].ancre && figs1[0].ancre.dx, dy: figs1[0].ancre && figs1[0].ancre.dy });
    ok("2a. le glissement NE CASSE PAS l'ancre", mid.ancre, "dx=" + mid.dx + " dy=" + mid.dy);
    await recharger();
    const after = await page.evaluate(() => { const r = document.querySelector(".atc-figbox").getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; });
    ok("2b. après RELOAD : cadre à sa NOUVELLE place (±10 px)",
      Math.abs(after.x - mid.x) <= 10 && Math.abs(after.y - mid.y) <= 10,
      "avant=" + JSON.stringify(mid) + " après=" + JSON.stringify(after));

    // ═══ 3. un BLOC INJECTÉ s'ajoute AVANT le mot (fiche Wikipedia) ═══
    // C'est la vraie panne : le module d'illustration insère `.theo-fig`
    // (titre + extrait + lien ≈ 250 car.) AVANT le passage, après le rendu.
    const figsA = await lireFigures();
    const ancre1 = figsA[0] && figsA[0].ancre ? { texte: figsA[0].ancre.texte, start: figsA[0].ancre.start, end: figsA[0].ancre.end } : null;
    await semer(TEXTE, [{ id: "fg-t3", x: 1, y: 1, w: 100, h: 44, shape: "Rectangle", color: "#4f8ef7",
      svg: '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="24" height="24" fill="none"/></svg>', ancre: ancre1 }]);
    await recharger();
    const avantInject = await mesure();
    // injection de la fiche, exactement comme le module d'illustration
    await page.evaluate(() => {
      const box = document.querySelector(".message-content");
      if (!box) return;
      const fig = document.createElement("div");
      fig.className = "theo-fig";
      fig.innerHTML = '<a class="theo-fig-img" href="#"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Paul de Tarse"></a>' +
        '<div class="theo-fig-txt"><div class="theo-fig-t">Paul de Tarse</div>' +
        '<div class="theo-fig-x">Paul de Tarse, ou saint Paul parmi les apôtres, est une figure majeure des origines du christianisme.</div>' +
        '<a class="theo-fig-l" href="#">Article Wikipédia →</a></div>';
      box.insertBefore(fig, box.firstChild);
    });
    await page.waitForTimeout(1300);
    const m3 = await mesure();
    ok("3. fiche Wikipédia insérée AVANT : le cadre reste sur son mot (< 6 px)",
      m3.ok && m3.decalage < 6,
      "décalage=" + m3.decalage + " (avant injection " + avantInject.decalage + ", start=" + (m3.ancre && m3.ancre.start) + ")");

    // ═══ 4. occurrence répétée ═══
    await semer(TEXTE, []);
    await recharger();
    const e4 = await encadrer("Seigneur", 2);
    await page.waitForTimeout(1300);
    await recharger();
    const m4 = await mesure();
    ok("4. mot répété : cadre sur la BONNE occurrence (< 6 px)", m4.ok && m4.decalage < 6,
      "décalage=" + m4.decalage + " occurrences=" + m4.occ + " pick=" + m4.best);

    // ═══ 5. redimensionnement = boîte libre ═══
    await glisser("se", 60, 25);
    await page.waitForTimeout(1400);
    const figs5 = await lireFigures();
    const m5 = await page.evaluate(() => {
      const r = document.querySelector(".atc-figbox").getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    m5.ancre = !!figs5[0].ancre;
    ok("5a. redimensionnement -> ancre retirée (boîte libre, voulu)", !m5.ancre, JSON.stringify(m5));
    await recharger();
    const m5b = await page.evaluate(() => { const r = document.querySelector(".atc-figbox").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    ok("5b. après RELOAD : la taille manuelle est conservée (±4 px)", Math.abs(m5b.w - m5.w) <= 4, "avant=" + m5.w + " après=" + m5b.w);

    ok("aucune erreur JS", errJs.length === 0, errJs.slice(0, 2).join(" | "));
  } catch (e) {
    ok("exception du banc", false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
  }

  await browser.close();
  serveur.close();

  const bons = res.filter(r => r[0]).length;
  console.log("-".repeat(74));
  console.log(`${bons}/${res.length} vérifications passées`);
  if (NEG) {
    /* Le contrôle négatif doit montrer la DÉRIVE : au moins deux échecs
       caractéristiques parmi (ancre cassée au glissement, dérive de mot
       répété, dérive après injection). Le scénario 1 (cas simple) peut
       passer sur l'ancien build — il n'a jamais été le problème. */
    const signature = {
      ancrePerdue: !res.find(r => /^2a/.test(r[1]))[0],
      deriveMotRepere: res.find(r => /^4\./.test(r[1])) && !res.find(r => /^4\./.test(r[1]))[0],
      deriveInjection: res.find(r => /^3\./.test(r[1])) && !res.find(r => /^3\./.test(r[1]))[0],
    };
    const n = Object.keys(signature).filter(k => signature[k]).length;
    console.log("SIGNATURES DE DÉRIVE : " + JSON.stringify(signature));
    console.log(n >= 2 ? "CONTRÔLE NÉGATIF VALIDE : l'ancien build dérive bien (" + n + " signatures)"
                      : "CONTRÔLE NÉGATIF INVALIDE : l'ancien build ne dérive pas assez (" + n + ")");
    process.exit(n >= 2 ? 0 : 1);
  }
  process.exit(bons === res.length ? 0 : 1);
})();
