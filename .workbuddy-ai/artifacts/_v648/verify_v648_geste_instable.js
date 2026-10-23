// Banc v648 — UN GESTE MANUEL NE DOIT JAMAIS ETRE JETE, MEME QUAND LA
// MISE EN PAGE BOUGE ENCORE.
//
// Contexte : v647 a prouve qu'un deplacement manuel survit au redemarrage
// (« C. apres un RELOAD complet, la geometrie est IDENTIQUE »). Mais ce banc
// semait un store deja stabilise AVANT le geste. Il restait donc un chemin non
// couvert, et il est exactement celui que l'utilisateur decrit : « a chaque
// demarrage ca change de place ».
//
// Le garde de `persistFig` (v635) :
//
//     if (window.__atcStable === false && origine !== 'creation-manuelle') {
//       try { markChatDirty(); } catch (e) {}
//       return;                       // <- f.x/f.y NON mis a jour, RIEN enregistre
//     }
//
// Le commentaire dit « le prochain passage, sur contenu stable, fera foi ».
// Mais `_ancPlace` recalcule JUSTEMENT depuis l'ancre et ecrit par-dessus :
//
//     if (!_dejaBon) { f.x = bx; f.y = by; figEl.style.left = f.x + 'px'; }
//
// donc au passage suivant le cadre est RAPPELE sur son ancre : le geste est
// perdu, dans la session ET au redemarrage. `__atcGeste` (v647) ne protege que
// PENDANT le glissement — il est leve au `mouseup`, AVANT `persistFig`.
//
// Etat reel qui produit `__atcStable === false` : le contenu du message
// s'insere encore (streaming, fiches, puces de sources) — `__atcGeo[f.id].n`
// reste a 1. L'utilisateur annote pendant que la page vit.
//
// Contrat teste :
//   A1. le glissement DEPLACE le cadre du decalage exact demande ;
//   A2. apres stabilisation, la position est STABLE (aucun rappel a l'ancre) ;
//   B.  le store canonique (IndexedDB) enregistre la position du geste ;
//   C.  apres un RELOAD complet, la geometrie est IDENTIQUE.
//   D.  l'ancre survit, memorisee au coin du texte (ox/oy).
//
// Controle negatif : BENCH_ROOT sur un build SANS le correctif => A2 echoue
// (le cadre revient sur son ancre), B echoue, C echoue.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8861;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v648-instable";
const MSGTS = 1795000000444;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

// Premier paragraphe long : la boite semee (460 px) couvre une portion de la
// premiere ligne, donc le rect de l'ancre est plus ETROIT que la boite — le
// piege du centrage (`rr.x + (rr.w - nw)/2 + dx` borne a 0).
const TEXTE = [
  "La notion de Kyrios designe la seigneurie divine, et cette designation porte une charge confessionnelle que la Septante avait deja preparee.",
  "",
  "Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.",
  "",
  "Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.",
].join("\n");

const FIG = { id: "finst", x: 8, y: 6, w: 460, h: 96, shape: "Rectangle", color: "#4f8ef7",
  weight: 1.4, fill: "", rot: 0, text: "", note: "note du geste instable", svg: SHAPE_SVG };

const DX = 44, DY = 26;   // le geste : bord gauche, comme un utilisateur

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

(async () => {
  const serveur = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rq.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html : charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(rq);
    } else { rq.writeHead(404); rq.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs, fig }) => {
    const chat = { id: chatId, title: "Banc v648", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [fig] },
    ] };
    await new Promise((res2, rej) => {
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
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chatId);
    localStorage.setItem("theo_chat_id", chatId);
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS, fig: FIG });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      // NE JAMAIS retirer setup-wizard-overlay (coupe l'init) : desarmer .active.
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
      }, 250);
    });
  }
  // Geometrie RENDUE du cadre (offsetLeft/offsetTop : meme espace que style.left).
  async function geo() {
    return await page.evaluate((id) => {
      const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
      if (!fb) return null;
      return { l: fb.offsetLeft, t: fb.offsetTop, w: fb.offsetWidth, h: fb.offsetHeight };
    }, FIG.id);
  }
  // Le store CANONIQUE est IndexedDB ; localStorage n'est qu'un filet.
  async function store() {
    return await page.evaluate(async (chatId) => {
      const idb = await new Promise((ok) => {
        const r = indexedDB.open("THEOLOGICUS_AI_DB");
        r.onsuccess = () => {
          const tx = r.result.transaction(["chats"], "readonly");
          const g = tx.objectStore("chats").get(chatId);
          g.onsuccess = () => ok(g.result); g.onerror = () => ok(null);
        };
        r.onerror = () => ok(null);
      });
      const m = idb && idb.messages ? idb.messages.find(x => x.shapes && x.shapes.length) : null;
      const f = m ? m.shapes[0] : null;
      return f ? { x: f.x, y: f.y, w: f.w, h: f.h, ancre: f.ancre || null, libre: f.libre || 0 } : null;
    }, CHAT);
  }
  // Stabilisation REELLE : le contenu grandit par paliers, il faut ~1 s de calme.
  async function stabiliser() {
    let _prec = null, _calme = 0;
    for (let i = 0; i < 30; i++) {
      const cur = await geo();
      if (cur && _prec && cur.l === _prec.l && cur.t === _prec.t && cur.w === _prec.w && cur.h === _prec.h) _calme++;
      else _calme = 0;
      _prec = cur;
      if (_calme >= 4) break;
      await page.waitForTimeout(250);
    }
    return _prec;
  }
  async function charger() {
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector('.atc-figbox[data-fig-id="' + FIG.id + '"]', { state: "attached", timeout: 20000 });
    return await stabiliser();
  }
  /* 🔴 PAS de `async` ici : une fonction async retourne une Promise, TOUJOURS
     truthy — `cond && memeGeo(...)` vaudrait donc vrai quoi qu'il arrive et le
     contrôle passerait A VIDE (c'est exactement ce qui s'était produit dans le
     banc v647, reproduit puis corrigé ici). Comparaison pure, synchrone. */
  function memeGeo(a, b) {
    return !!a && !!b && a.l === b.l && a.t === b.t && a.w === b.w && a.h === b.h;
  }

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });

  /* ───────── 1. etat de depart : store stabilise, comme d'habitude ───────── */
  await attendreApp();
  const g0 = await charger();
  ok("figure chargee et stabilisee", !!g0, JSON.stringify(g0));

  /* ───────── 2. LA MISE EN PAGE REPART (contenu qui s'insere encore) ─────────
     C'est l'etat que l'application traverse vraiment : `__atcGeo[f.id].n`
     retombe a 1, donc `__atcStable` redevient false. L'utilisateur annote
     pendant que la page vit.
     🔴 Le forcer AVANT le glissement ne suffit PAS : `_atcSettle` repasse
     entre-temps et rearme `__atcStable = true` (mesure : n=9 au depart du
     geste). Ce qui compte est l'etat A L'INSTANT OU `persistFig` lit le garde,
     c'est-a-dire au `mouseup`. On le force donc juste avant, et on VERIFIE
     apres coup qu'il etait bien false a cet instant. */
  await page.evaluate((id) => { window.__atcStable = true; }, FIG.id);

  /* ───────── 3. le geste : glisser par le BORD GAUCHE ───────── */
  const bord = await page.evaluate((id) => {
    const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
    const e = fb.querySelector('.fb-edge[data-bord="l"]');
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, FIG.id);
  await page.mouse.move(bord.x, bord.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(bord.x + DX * i / 6, bord.y + DY * i / 6);
    await page.waitForTimeout(30);
  }
  /* Etat instable AU MOMENT DE LA PERSISTANCE : `up()` le juste apres, et
     `persistFig` lit `window.__atcStable` avant tout calcul. */
  /* Mesure PENDANT le geste, avant le mouseup : elle prouve que le
     glissement a bien lieu et que c'est le RENDU qui le defait, pas la souris.
     Sans elle, un echec en +0/+0 est indistinguable d'un glissement rate. */
  const gDrag = await geo();
  const dDragL = (gDrag && g0) ? gDrag.l - g0.l : -9999;
  const dDragT = (gDrag && g0) ? gDrag.t - g0.t : -9999;
  await page.evaluate((id) => {
    window.__atcStable = false;
    try { if (window.__atcGeo && window.__atcGeo[id]) window.__atcGeo[id].n = 1; } catch (e) {}
  }, FIG.id);
  const stableAuMouseup = await page.evaluate(() => window.__atcStable);
  await page.mouse.up();
  const stableApresMouseup = await page.evaluate(() => window.__atcStable);

  const g1 = await geo();
  const dL = (g1 && g0) ? g1.l - g0.l : -9999;
  const dT = (g1 && g0) ? g1.t - g0.t : -9999;
  const gesteEffectif = Math.abs(dL - DX) <= 2 && Math.abs(dT - DY) <= 2;
  const gesteSurvecu = Math.abs(dDragL - DX) <= 2 && Math.abs(dDragT - DY) <= 2;

  ok("A-1. le glissement a bien DEPLACE le cadre pendant le geste",
     gesteSurvecu,
     `attendu +${DX}/+${DY} — obtenu +${dDragL}/+${dDragT} (${JSON.stringify(g0)} -> ${JSON.stringify(gDrag)})`);
  ok("A0. la mise en page etait bien instable A L'INSTANT du mouseup",
     stableAuMouseup === false && stableApresMouseup === false,
     `stable au mouseup=${stableAuMouseup} / juste apres=${stableApresMouseup}`);

  ok("A1. le glissement a DEPLACE le cadre du decalage exact demande",
     gesteEffectif,
     `attendu +${DX}/+${DY} — obtenu +${dL}/+${dT} (${JSON.stringify(g0)} -> ${JSON.stringify(g1)})`);

  /* ───────── 4. on laisse la mise en page se restabiliser ─────────
     C'est ICI que le defaut se voit : si `persistFig` a jete le geste,
     `_ancPlace` rappelle le cadre sur son ancre. */
  const g2 = await stabiliser();
  ok("A2. apres stabilisation, la position est STABLE (aucun rappel a l'ancre)",
     gesteEffectif && memeGeo(g1, g2), `juste apres le geste ${JSON.stringify(g1)} / apres stabilisation ${JSON.stringify(g2)}`);

  /* ───────── 5. le store a appris la position ───────── */
  const s1 = await store();
  ok("B. le store canonique enregistre la position du geste",
     gesteEffectif && !!s1 && Math.abs(s1.x - g1.l) <= 1 && Math.abs(s1.y - g1.t) <= 1,
     s1 ? `store x=${s1.x} y=${s1.y} / rendu l=${g1.l} t=${g1.t}` : "store illisible");

  /* ───────── 6. REDEMARRAGE : reload complet ───────── */
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await attendreApp();
  const g3 = await charger();

  ok("C. apres un RELOAD complet, la geometrie est IDENTIQUE",
     gesteEffectif && memeGeo(g1, g3), `geste ${JSON.stringify(g1)} / reload ${JSON.stringify(g3)}`);

  /* ───────── 7. l'ancre a survecu au deplacement ───────── */
  const s2 = await store();
  ok("D. l'ancre SURVIT au deplacement, memorisee au coin du texte (ox/oy)",
     gesteEffectif && !!s2 && !!s2.ancre && typeof s2.ancre.texte === "string" && s2.ancre.texte.length > 10
       && typeof s2.ancre.ox === "number" && typeof s2.ancre.oy === "number",
     s2 && s2.ancre ? `texte="${String(s2.ancre.texte).slice(0, 40)}..." ox=${s2.ancre.ox} oy=${s2.ancre.oy}` : "ancre perdue ou non convertible");

  ok("E. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 3).join(" | "));

  const nOk = res.filter(r => r[0]).length;
  console.log("--------------------------------------------------------------------------");
  console.log(`RESULTAT : ${nOk}/${res.length}`);
  console.log("--------------------------------------------------------------------------");
  await browser.close();
  serveur.close();
  process.exit(nOk === res.length ? 0 : 1);
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
