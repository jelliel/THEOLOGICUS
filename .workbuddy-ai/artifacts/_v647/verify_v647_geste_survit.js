// Banc v647 — UN DEPLACEMENT MANUEL SURVIT AU REDEMARRAGE.
//
// Symptome rapporte : « a chaque demarrage ca change de place ». Le banc v634
// prouve l'idempotence d'une figure REPAREE ; celui-ci prouve qu'un geste de
// l'utilisateur — deplacer un cadre a la souris — n'est pas DEFait, ni par le
// rendu pendant le glissement, ni au demarrage suivant.
//
// Defaut mesure avant le correctif (sonde _v647/probe_snapback.js) : chaque
// ecriture de `fb.style.left` mute le DOM -> MutationObserver ->
// `_atcScheduleApply` -> `_atcSettle` -> `_ancPlace` RECALCULAIT la position
// depuis l'ancre et ecrasait le geste. Journal : left=5px (t+64ms),
// left=0px (t+176ms), left=0px (t+594ms, apres le mouseup). Le cadre
// sautillait en arriere toutes les ~200 ms puis revenait a 0.
//
// Contrat teste :
//   A. le glissement DEPLACE le cadre, et la position est STABLE (pas de
//      rappel vers l'ancre pendant ni apres le geste) ;
//   B. le store canonique (IndexedDB) enregistre la position du geste ;
//   C. apres un RELOAD complet, la geometrie (l,t,w,h) est IDENTIQUE —
//      c'est le redemarrage que l'utilisateur fait vraiment ;
//   D. l'ancre SURVIT au deplacement : le cadre continue de suivre son texte ;
//   E. le REDIMENSIONNEMENT libere toujours la boite (`libre`), donc le
//      chemin de `persistFig` que le correctif a touche n'est pas casse.
//
// Controle negatif : BENCH_ROOT sur un build pre-v647 => A echoue
// (le cadre revient a sa position d'origine AVANT la fin du geste).
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8835;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v647-geste";
const MSGTS = 1795000000333;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

// Premier paragraphe long : la boite semee (460 px) couvre une portion de la
// premiere ligne, donc le rect de l'ancre est plus ETROIT que la boite. C'est
// exactement le piege du centrage (`rr.x + (rr.w - nw)/2 + dx` borne a 0).
const TEXTE = [
  "La notion de Kyrios designe la seigneurie divine, et cette designation porte une charge confessionnelle que la Septante avait deja preparee.",
  "",
  "Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.",
  "",
  "Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.",
].join("\n");

const FIG = { id: "fgest", x: 8, y: 6, w: 460, h: 96, shape: "Rectangle", color: "#4f8ef7",
  weight: 1.4, fill: "", rot: 0, text: "", note: "note du geste", svg: SHAPE_SVG };

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
      rq.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
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
    const chat = { id: chatId, title: "Banc v647", updated: Date.now(), messages: [
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
  async function charger() {
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector('.atc-figbox[data-fig-id="' + FIG.id + '"]', { state: "attached", timeout: 20000 });
    /* v647 — LAISSE LA MISE EN PAGE SE STABILISER, MAIS POUR DE VRAI.
       Le contenu grandit PAR PALIERS (mesure : scrollHeight 391 -> 727 ->
       788 -> 849) et le cadre suit avec le retard d'une passe. Deux mesures
       concordantes tombent donc aussi sur un palier intermediaire : on
       exige 5 mesures consecutives identiques espacces de 250 ms, soit ~1 s
       de calme. Sans cela, une comparaison avant/apres reload peut porter
       sur deux positions provisoires differentes. */
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
  async function memeGeo(a, b) {
    return !!a && !!b && a.l === b.l && a.t === b.t && a.w === b.w && a.h === b.h;
  }

  // Semis fait depuis une page neutre, puis on entre vraiment dans l'app.
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });

  /* ─────────────── 1. état de départ ─────────────── */
  await attendreApp();
  const g0 = await charger();
  ok("figure chargee et stabilisee", !!g0, JSON.stringify(g0));

  /* ─────────────── 2. le geste : glisser par le BORD GAUCHE ─────────────── */
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
  await page.mouse.up();
  await page.waitForTimeout(400);   // laisse les passes de stabilisation passer

  const g1 = await geo();
  const g1b = await (async () => { await page.waitForTimeout(400); return await geo(); })();

  /* Le geste doit avoir produit EXACTEMENT le decalage demande. Sans ce
     garde, un build qui defait le geste ferait « reussir » A2/B/C/D en
     comparant une position immobile a elle-meme — controle vide. */
  const dL = (g1 && g0) ? g1.l - g0.l : -9999;
  const dT = (g1 && g0) ? g1.t - g0.t : -9999;
  const gesteEffectif = Math.abs(dL - DX) <= 2 && Math.abs(dT - DY) <= 2;

  ok("A1. le glissement a DEPLACE le cadre du decalage exact demande",
     gesteEffectif,
     `attendu +${DX}/+${DY} — obtenu +${dL}/+${dT} (${JSON.stringify(g0)} -> ${JSON.stringify(g1)})`);
  ok("A2. la position est STABLE apres le geste (aucun rappel vers l'ancre)",
     gesteEffectif && memeGeo(g1, g1b), `${JSON.stringify(g1)} -> ${JSON.stringify(g1b)}`);

  /* ─────────────── 3. le store a appris la position ─────────────── */
  const s1 = await store();
  ok("B. le store canonique enregistre la position du geste",
     gesteEffectif && !!s1 && Math.abs(s1.x - g1.l) <= 1 && Math.abs(s1.y - g1.t) <= 1,
     s1 ? `store x=${s1.x} y=${s1.y} / rendu l=${g1.l} t=${g1.t}` : "store illisible");

  /* ─────────────── 4. REDEMARRAGE : reload complet ─────────────── */
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await attendreApp();
  const g2 = await charger();

  ok("C. apres un RELOAD complet, la geometrie est IDENTIQUE",
     gesteEffectif && memeGeo(g1, g2), `geste ${JSON.stringify(g1)} / reload ${JSON.stringify(g2)}`);

  /* ─────────────── 5. l'ancre a survécu au déplacement ─────────────── */
  const s2 = await store();
  ok("D. l'ancre SURVIT au deplacement, memorisee au coin du texte (ox/oy)",
     gesteEffectif && !!s2 && !!s2.ancre && typeof s2.ancre.texte === "string" && s2.ancre.texte.length > 10
       && typeof s2.ancre.ox === "number" && typeof s2.ancre.oy === "number",
     s2 && s2.ancre ? `texte="${String(s2.ancre.texte).slice(0, 40)}…" ox=${s2.ancre.ox} oy=${s2.ancre.oy}` : "ancre perdue ou non convertible");

  /* ─────────────── 6. le redimensionnement libère toujours la boîte ─────────────── */
  const coin = await page.evaluate((id) => {
    const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
    fb.classList.add('sel');
    const h = fb.querySelector('.h[data-dir="se"]');
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: fb.offsetWidth, h: fb.offsetHeight };
  }, FIG.id);
  await page.mouse.move(coin.x, coin.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(coin.x + 40 * i / 6, coin.y + 20 * i / 6);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const g3 = await geo();
  const s3 = await store();
  ok("E. le redimensionnement agrandit la boite ET la libere (ancre retiree)",
     !!g3 && g3.w > coin.w && g3.h > coin.h && !!s3 && s3.libre === 1 && !s3.ancre,
     `w ${coin.w}->${g3 && g3.w} h ${coin.h}->${g3 && g3.h} libre=${s3 && s3.libre} ancre=${s3 && !!s3.ancre}`);

  /* ─────────────── 7. aucune erreur JS ─────────────── */
  ok("F. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const passes = res.filter(r => r[0]).length;
  console.log("\nRESULTAT : " + passes + "/" + res.length);
  if (passes !== res.length) res.filter(r => !r[0]).forEach(r => console.log("  ÉCHEC : " + r[1]));
  await browser.close();
  serveur.close();
  process.exit(passes === res.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
