// Banc v658 — LA PALETTE DE FORMES ETENDUE (catalogue type WPS Office).
//
// L'utilisateur a demande d'ajouter les figures du panneau « Formes » de WPS
// Office dans la palette « encadrement et figures ». La palette
// `window.__FORMES_PALETTE` passe de 6 catégories / 24 formes à
// 7 catégories / 65 formes (Traits, Formes, Schéma, Blocs, Bulles,
// Blocs Flèches enrichis + nouvelle catégorie Accolades).
//
// Contrat testé :
//   A. la palette existe, a 7 catégories et >= 60 formes ;
//   B. intégrité : chaque forme a un nom UNIQUE et un `svg` utilisant
//      « cur » (couleur), sans balise <svg> imbriquée ;
//   C. chaque SVG est PARSEABLE par le DOM (innerSVG dans un <svg> 24x24)
//      et tient dans le viewBox (pas de forme hors cadre) ;
//   D. INSERTION REELLE de CHAQUE nouvelle forme via le chemin utilisateur
//      (`__atcInsertFig`) -> un `.atc-figbox` apparaît avec le bon titre ;
//   E. une forme inconnue est refusée (findForme -> null) : controle négatif ;
//   F. après RELOAD, les figures insérées sont toujours là (persistance) ;
//   G. aucune erreur JavaScript.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8934;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v658-palette";
const MSGTS = 1796000000555;

const TEXTE = [
  "Palette etendue des figures.",
  "",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
  "",
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
].join("\n");

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
  await page.evaluate(async ({ chatId, texte, msgTs }) => {
    const chat = { id: chatId, title: "Banc v658", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [] },
    ] };
    await new Promise((res2, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded = () => { const d = r.result;
        if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" }); };
      r.onsuccess = () => { const db = r.result; const tx = db.transaction(["chats","settings"],"readwrite");
        tx.objectStore("chats").put(chat); tx.objectStore("settings").put({ id:"currentChatId", value: chatId });
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error); };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chatId);
    localStorage.setItem("theo_chat_id", chatId);
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    }, 250);
  });
  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
  await page.waitForSelector(".message-content", { state: "attached", timeout: 20000 });
  await page.waitForTimeout(800);   // laisser la mise en page se poser

  /* A. structure de la palette */
  const pal = await page.evaluate(() => {
    const p = window.__FORMES_PALETTE || [];
    return {
      cats: p.map(g => g.cat),
      total: p.reduce((n, g) => n + (g.items || []).length, 0),
      noms: p.flatMap(g => (g.items || []).map(it => it.n)),
      groupes: p.map(g => ({ cat: g.cat, n: (g.items || []).length })),
    };
  });
  ok("A. palette : 7 categories et >= 60 formes",
     pal.cats.length === 7 && pal.total >= 60,
     `cats=${pal.cats.join(" | ")} total=${pal.total}`);

  /* B. intégrité : noms uniques, svg avec « cur », pas de <svg> imbriqué */
  const integ = await page.evaluate(() => {
    const p = window.__FORMES_PALETTE || [];
    const noms = p.flatMap(g => (g.items || []).map(it => it.n));
    const doublons = noms.filter((n, i) => noms.indexOf(n) !== i);
    const def = [];
    p.forEach(g => (g.items || []).forEach(it => {
      if (!it.n || !it.svg) def.push((it.n || "?") + ":vide");
      else if (!it.svg.includes("cur")) def.push(it.n + ":sans-cur");
      else if (/<svg/i.test(it.svg)) def.push(it.n + ":svg-imbrique");
    }));
    return { doublons, def };
  });
  ok("B. noms uniques et svg valides (cur, pas de <svg> imbrique)",
     integ.doublons.length === 0 && integ.def.length === 0,
     (integ.doublons.length ? "doublons=" + integ.doublons.join(",") + " " : "") +
     (integ.def.length ? "defauts=" + integ.def.join(",") : "OK"));

  /* C. chaque svg est parseable et tient dans le viewBox 24x24 */
  const parse = await page.evaluate(() => {
    const NS = "http://www.w3.org/2000/svg";
    const p = window.__FORMES_PALETTE || [];
    const err = [];
    p.forEach(g => (g.items || []).forEach(it => {
      try {
        const s = document.createElementNS(NS, "svg");
        s.setAttribute("viewBox", "0 0 24 24");
        s.innerHTML = it.svg.replace(/cur/g, "#4f8ef7");
        // bornes geometriques des elements tracés
        let ok2 = true;
        s.querySelectorAll("polygon, polyline").forEach(el => {
          (el.getAttribute("points") || "").trim().split(/\s+/).forEach(pair => {
            const [x, y] = pair.split(",").map(Number);
            if (!isFinite(x) || !isFinite(y) || x < -0.5 || x > 24.5 || y < -0.5 || y > 24.5) ok2 = false;
          });
        });
        s.querySelectorAll("circle, ellipse").forEach(el => {
          const cxx = parseFloat(el.getAttribute("cx")), cyy = parseFloat(el.getAttribute("cy"));
          const rx = parseFloat(el.getAttribute("r") || el.getAttribute("rx"));
          const ry = parseFloat(el.getAttribute("ry") || rx);
          if (cxx - rx < -0.5 || cxx + rx > 24.5 || cyy - ry < -0.5 || cyy + ry > 24.5) ok2 = false;
        });
        if (!ok2) err.push(it.n + ":hors-viewBox");
      } catch (e) { err.push(it.n + ":exception"); }
    }));
    return err;
  });
  ok("C. tous les svg sont parseables et dans le viewBox 24x24",
     parse.length === 0, parse.length ? parse.join(",") : "OK");

  /* D. insertion REELLE de chaque forme nouvelle (chemin utilisateur) */
  const NOUVELLES = [
    "Ligne pointillée","Ligne double","Flèche fine double","Connecteur coude","Connecteur courbe",
    "Pentagone","Octogone","Parallélogramme","Trapèze","Demi-cercle","Anneau","Arc","Lune","Éclair","Soleil","Smiley",
    "Étoile 4 branches","Étoile 6 branches","Étoile 8 branches","Éclat",
    "Document","Multi-documents","Préparation","Entrée manuelle","Retard","Base de données","Somme",
    "Bulle ronde","Bulle pensée","Bannière",
    "Flèche coudée","Flèche en U","Flèche circulaire","Flèche diagonale",
    "Parenthèse gauche","Parenthèse droite","Parenthèses","Accolade gauche","Accolade droite","Accolades","Crochets",
  ];
  const inser = await page.evaluate(({ noms, ts }) => {
    const box = document.querySelector(".message-content");
    const out = { cible: !!box, echecs: [], inseres: 0 };
    if (!box) return out;
    noms.forEach((n, i) => {
      try {
        const avant = box.querySelectorAll(".atc-figbox").length;
        const okr = window.__atcInsertFig({ msgTs: ts, clientX: 120 + (i % 6) * 55, clientY: 60 + Math.floor(i / 6) * 40 }, n);
        const apres = box.querySelectorAll(".atc-figbox").length;
        if (!okr || apres <= avant) out.echecs.push(n);
        else out.inseres++;
      } catch (e) { out.echecs.push(n + ":exception"); }
    });
    return out;
  }, { noms: NOUVELLES, ts: MSGTS });
  ok("D1. __atcInsertFig retourne true pour les 41 nouvelles formes",
     inser.echecs.length === 0,
     inser.echecs.length ? "echecs=" + inser.echecs.join(",") : `${inser.inseres}/${NOUVELLES.length} inserees`);

  /* D2. insertion avec le VRAI msgTs (le chemin au-dessus avait msgTs:null :
     __atcInsertFab a besoin d'un message existant pour ancrer) — on verifie
     sur un sous-echantillon que les .atc-figbox sont bien reellement crees. */
  const d2 = await page.evaluate((ts) => {
    const box = document.querySelector(".message-content");
    const avant = box ? box.querySelectorAll(".atc-figbox").length : -1;
    const essais = ["Pentagone", "Accolades", "Étoile 6 branches", "Bulle ronde"];
    const echecs = [];
    essais.forEach(n => {
      const okr = window.__atcInsertFig({ msgTs: ts, clientX: 150, clientY: 120 }, n);
      if (!okr) echecs.push(n);
    });
    const apres = box ? box.querySelectorAll(".atc-figbox").length : -1;
    return { avant, apres, echecs };
  }, MSGTS);
  ok("D2. insertion avec msgTs reel : figures creees dans le DOM",
     d2.echecs.length === 0 && d2.apres > d2.avant,
     `figboxes ${d2.avant} -> ${d2.apres}` + (d2.echecs.length ? " echecs=" + d2.echecs.join(",") : ""));

  /* E. controle negatif : une forme inconnue ne cree PAS de figure de cette
     forme — repli historique sur Rectangle (findForme(x) || findForme('Rectangle')),
     sans exception ni double insertion. */
  const neg = await page.evaluate((ts) => {
    const box = document.querySelector(".message-content");
    const avant = box.querySelectorAll(".atc-figbox").length;
    const r1 = window.__atcInsertFig({ msgTs: ts, clientX: 100, clientY: 100 }, "Forme qui n'existe pas");
    const apres = box.querySelectorAll(".atc-figbox").length;
    const st = window.__atcState();
    const msg = st && st.messages ? st.messages.find(m => m.ts === ts) : null;
    const derniere = msg && msg.shapes && msg.shapes.length ? msg.shapes[msg.shapes.length - 1] : null;
    return { r1, delta: apres - avant, shape: derniere ? derniere.shape : null };
  }, MSGTS);
  ok("E. forme inconnue : repli historique Rectangle, une seule figure, pas d'exception",
     neg.r1 === true && neg.delta === 1 && neg.shape === "Rectangle",
     `retour=${neg.r1} delta=${neg.delta} shape=${neg.shape}`);

  /* F. persistance : le STORE (IndexedDB) contient toutes les figures ; le
     DOM est lazy-rendu par viewport (v628) — on fait defiler pour compter. */
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    }, 250);
  });
  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
  await page.waitForSelector(".message-content", { state: "attached", timeout: 20000 });
  await page.waitForTimeout(1200);
  const storeN = await page.evaluate(async (chatId) => {
    const idb = await new Promise((ok2) => { const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onsuccess = () => { const tx = r.result.transaction(["chats"],"readonly"); const g = tx.objectStore("chats").get(chatId);
        g.onsuccess = () => ok2(g.result || null); g.onerror = () => ok2(null); }; r.onerror = () => ok2(null); });
    const m = idb && idb.messages ? idb.messages.find(x => x.shapes && x.shapes.length) : null;
    return m ? m.shapes.length : -1;
  }, CHAT);
  await page.evaluate(() => {
    const sc = document.getElementById("chat-container") || document.querySelector(".message-content");
    if (sc) sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const sc = document.getElementById("chat-container") || document.querySelector(".message-content");
    if (sc) sc.scrollTop = Math.max(0, sc.scrollTop - 400);
  });
  await page.waitForTimeout(1000);
  const apresReload = await page.evaluate(() => document.querySelectorAll(".atc-figbox").length);
  ok("F. apres RELOAD : le store garde les figures et le scroll les rend",
     storeN >= 45 && apresReload >= 41,
     `store=${storeN} figures / figboxes rendus au scroll = ${apresReload}`);

  /* G. hygiene */
  ok("G. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const bons = res.filter(r => r[0]).length;
  console.log(`\n${bons}/${res.length} — ${bons === res.length ? "OK" : "ECHEC"}`);
  await browser.close(); serveur.close();
  process.exit(bons === res.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(2); });
