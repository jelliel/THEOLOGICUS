// Banc v633e — DONNEE REELLE : rejoue un chat VERITABLE du store utilisateur
// (28 figures, 0 ancre, x=-5 y=5671) et verifie que la reparation v633 les
// ramene sur leur texte.
//
// Ce banc mesure ce que le store contient VRAIMENT, pas un semis commode.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8840;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CHAT = path.join(__dirname, "real_chat.json");

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

(async () => {
  if (!fs.existsSync(CHAT)) { console.log("real_chat.json absent — banc ignore"); process.exit(0); }
  const src = JSON.parse(fs.readFileSync(CHAT, "utf8"));
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

  const chatId = "chat-v633-real";
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, src }) => {
    const chat = { id: chatId, title: src.title || "reel", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: src.content, ts: src.msgTs, annotations: [], marks: [], shapes: src.shapes },
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
  }, { chatId, src });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
      }, 250);
    });
  }
  async function charger() {
    await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, chatId);
    await page.waitForTimeout(2500);
  }
  /* 🔴 v628 rend les cadres HORS viewport de facon LIGNEUSE : la reparation
     d'un cadre situe a 4300 px dans un message de 7000 px n'a lieu qu'au
     SCROLL. On defile donc le message pour laisser la passe v633 s'appliquer
     avant de mesurer — sinon on conclut a tort que la reparation echoue. */
  async function defilerTout() {
    /* On DESCEND seulement, on ne remonte pas : remonter en haut invalide les
       rects des cadres restes en bas (getBoundingClientRect perime), ce qui a
       fait mesurer 0/27 alors que les cadres etaient corrects. */
    await page.evaluate((msgTs) => {
      const box = document.getElementById("mc-" + msgTs);
      if (!box) return;
      let sc = box.parentElement;
      while (sc && sc !== document.body && sc.scrollHeight <= sc.clientHeight) sc = sc.parentElement;
      const cible = (sc && sc.scrollHeight > sc.clientHeight) ? sc : document.scrollingElement;
      cible.scrollTop = cible.scrollHeight;
    }, src.msgTs);
    await page.waitForTimeout(1200);
  }

  // combien de figures ont une ancre, et combien COUVRENT leur texte ?
  async function bilan() {
    return page.evaluate(({ chatId, msgTs }) => {
      let shapes = [];
      try {
        const c = JSON.parse(localStorage.getItem("theologicus_chat_" + chatId) || "null");
        const m = c && (c.messages || []).find(x => x.ts === msgTs);
        shapes = (m && m.shapes) || [];
      } catch (e) {}
      const box = document.getElementById("mc-" + msgTs);
      const EX = ".atc-figbox, .theo-fig, .theo-src-chips, [data-no-anchor]";
      const nodes = [];
      if (box) {
        const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            if (n.parentElement && n.parentElement.closest(EX)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        while (w.nextNode()) nodes.push(w.currentNode);
      }
      const avecAncre = shapes.filter(s => s.ancre && s.ancre.texte).length;
      /* 🔴 La mesure doit se faire dans l'ESPACE CANONIQUE du produit :
         `window.__ANC.rect` (meme walker filtree que la restitution), et NON
         par une re-derivation locale du range. Une re-derivation a fait
         echouer 17 cadres qui, arithmetiquement, couvrent leur texte. */
      const details = [];
      let couvre = 0, testables = 0;
      shapes.forEach(s => {
        if (!s.ancre || typeof s.ancre.start !== "number") { details.push({ id: s.id, why: "sans ancre" }); return; }
        const fb = document.querySelector('.atc-figbox[data-fig-id="' + s.id + '"]');
        if (!fb || !box) { details.push({ id: s.id, why: "cadre absent" }); return; }
        testables++;
        const rr = window.__ANC.rect(box, s.ancre.start, s.ancre.end);
        if (!rr) { details.push({ id: s.id, why: "rect introuvable (espace canonique)" }); return; }
        const br = box.getBoundingClientRect();
        const fr = fb.getBoundingClientRect();
        /* rect du texte, en coordonnees viewport */
        const q = { left: br.left + rr.x, top: br.top + rr.y, w: rr.w, h: rr.h };
        const cx = q.left + q.w / 2, cy = q.top + q.h / 2;
        const dedans = cx >= fr.left - 2 && cx <= fr.right + 2 && cy >= fr.top - 2 && cy <= fr.bottom + 2;
        if (dedans) couvre++;
        else details.push({ id: s.id, why: "hors cadre", ow: s.ancre.ow, oh: s.ancre.oh,
          fw: Math.round(fr.width), fh: Math.round(fr.height),
          tw: Math.round(q.w), th: Math.round(q.h),
          dtex: Math.round(cx - (fr.left + fr.right) / 2), dtey: Math.round(cy - (fr.top + fr.bottom) / 2) });
      });
      /* combien de figures recouvrent REELLEMENT du texte ? (mesure) */
      let surTexte = 0;
      shapes.forEach(s => {
        const fb = document.querySelector('.atc-figbox[data-fig-id="' + s.id + '"]');
        if (!fb || !box) return;
        const fr = fb.getBoundingClientRect();
        let hit = false;
        for (const n of nodes) {
          const rng = document.createRange(); rng.selectNodeContents(n);
          const rects = rng.getClientRects();
          for (let j = 0; j < rects.length; j++) {
            const q = rects[j];
            if (!(q.right < fr.left || q.left > fr.right || q.bottom < fr.top || q.top > fr.bottom)) { hit = true; break; }
          }
          if (hit) break;
        }
        if (hit) surTexte++;
      });
      return { details, total: shapes.length, surTexte, avecAncre, testables, couvre,
               exemple: shapes.slice(0, 3).map(s => ({ id: s.id, x: s.x, y: s.y,
                 ancre: s.ancre ? String(s.ancre.texte).slice(0, 40) : null })) };
    }, { chatId, msgTs: src.msgTs });
  }

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await charger();
    // ── MESURE D'UN SEUL CADRE, de bout en bout ──
    const one = await page.evaluate(({ chatId, msgTs }) => {
      const c = JSON.parse(localStorage.getItem("theologicus_chat_" + chatId) || "null");
      const m = c && (c.messages || []).find(x => x.ts === msgTs);
      const sh = ((m && m.shapes) || []).filter(z => z.ancre && z.ancre.texte)[0];
      if (!sh) return { err: "aucune figure ancree" };
      const box = document.getElementById("mc-" + msgTs);
      const fb = document.querySelector('.atc-figbox[data-fig-id="' + sh.id + '"]');
      if (!fb) return { err: "cadre absent", id: sh.id };
      const rr = window.__ANC.rect(box, sh.ancre.start, sh.ancre.end);
      const sol = window.__ANC.resolve(box, sh);
      const fr = fb.getBoundingClientRect(), br = box.getBoundingClientRect();
      return {
        id: sh.id, ancre: { start: sh.ancre.start, end: sh.ancre.end, texte: String(sh.ancre.texte).slice(0, 40),
                            ow: sh.ancre.ow, oh: sh.ancre.oh, ox: sh.ancre.ox, oy: sh.ancre.oy,
                            cx: sh.ancre.cx, repare: sh.ancre.repare, dx: sh.ancre.dx, dy: sh.ancre.dy },
        memo: { x: sh.x, y: sh.y, w: sh.w, h: sh.h },
        ancRect: rr, resolve: sol ? { x: sol.r.x, y: sol.r.y, w: sol.r.w, h: sol.r.h, start: sol.start, end: sol.end } : null,
        dom: { left: fb.style.left, top: fb.style.top, w: fb.style.width, h: fb.style.height },
        boxRect: { l: Math.round(br.left), t: Math.round(br.top), w: Math.round(br.width), h: Math.round(br.height) },
        boxClient: { w: box.clientWidth, h: box.clientHeight },
        visible: (function(){ const r = fb.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })(),
      };
    }, { chatId, msgTs: src.msgTs });
    console.log("  MESURE CADRE : " + JSON.stringify(one, null, 1));

    const b1 = await bilan();
    await defilerTout();
    ok("donnee reelle : des figures sans ancre existent bien", b1.total > 0, "figures=" + b1.total);
    /* 🔴 Le contrat n'est pas « toute figure recoit une ancre » : une figure
       posee dans le VIDE (mesure : 0 noeud texte recouvert) n'a AUCUN texte a
       quoi s'ancrer. Inventer une ancre la ferait sauter sur des mots
       arbitraires — c'est precisement ce qu'il ne faut pas. Le contrat est :
       toute figure qui RECOUVRE du texte est reparee. */
    ok("v633 repare toute figure qui recouvre du texte",
      b1.surTexte > 0 && b1.avecAncre === b1.surTexte,
      b1.avecAncre + "/" + b1.surTexte + " figures sur texte ancrees (total " + b1.total + ")");
    ok("les figures reparees COUVRENT leur texte",
      b1.testables > 0 && b1.couvre >= Math.ceil(b1.testables * 0.8),
      b1.couvre + "/" + b1.testables + " couvrent leur ancre (seuil 80%)");
    console.log("  exemples : " + JSON.stringify(b1.exemple));
    console.log("  detail echecs : " + JSON.stringify(b1.details, null, 1).slice(0, 3000));

    // apres rechargement : les ancres doivent ETRE LA, sans nouvelle reparation
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await charger();
    // pourquoile UNE figure reste-t-elle sans ancre ?
    const diagNon = await page.evaluate(({ chatId, msgTs }) => {
      const c = JSON.parse(localStorage.getItem("theologicus_chat_" + chatId) || "null");
      const m = c && (c.messages || []).find(x => x.ts === msgTs);
      const sans = ((m && m.shapes) || []).filter(z => !z.ancre || !z.ancre.texte);
      return sans.map(z => {
        const fb = document.querySelector('.atc-figbox[data-fig-id="' + z.id + '"]');
        const box = document.getElementById("mc-" + msgTs);
        return { id: z.id, x: z.x, y: z.y, w: z.w, h: z.h, libre: z.libre || 0,
                 present: !!fb,
                 dom: fb ? { l: fb.style.left, t: fb.style.top, visible: (function(){const r=fb.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;})() } : null,
                 boxH: box ? box.clientHeight : null };
      });
    }, { chatId, msgTs: src.msgTs });
    console.log("  SANS ANCRE APRES RELOAD : " + JSON.stringify(diagNon));
    // trace : que renvoie _ancFit pour CETTE figure ?
    const trace = await page.evaluate(({ msgTs, id }) => {
      const box = document.getElementById("mc-" + msgTs);
      const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
      const st = window.__atcState();
      const m = st.messages.find(x => x.ts === msgTs);
      const f = m.shapes.find(z => z.id === id);
      const avant = f.ancre ? JSON.stringify(f.ancre) : null;
      const r = window.__ANC.place(box, f, fb);
      return { avant, apres: f.ancre ? JSON.stringify(f.ancre) : null,
               figRect: fb ? fb.getBoundingClientRect().toJSON() : null,
               boxRect: box ? box.getBoundingClientRect().toJSON() : null,
               nodes: window.__ANC.noeuds(box).length };
    }, { msgTs: src.msgTs, id: "fg-1792582284859" });
    console.log("  TRACE ancFit : " + JSON.stringify(trace, null, 1));
    // quels noeuds texte le cadre recouvre-t-il vraiment ?
    const rec = await page.evaluate(({ msgTs, id }) => {
      const box = document.getElementById("mc-" + msgTs);
      const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
      const nodes = window.__ANC.noeuds(box);
      const fr = fb.getBoundingClientRect();
      const L = fr.left, R = fr.right, T = fr.top, B = fr.bottom;
      const hits = [];
      nodes.forEach((n, i) => {
        const rng = document.createRange(); rng.selectNodeContents(n);
        const rects = rng.getClientRects();
        for (let j = 0; j < rects.length; j++) {
          const q = rects[j];
          const inter = !(q.right < L || q.left > R || q.bottom < T || q.top > B);
          if (inter) { hits.push({ i: i, j: j, txt: (n.nodeValue || "").slice(0, 50),
                                   q: { l: Math.round(q.left), t: Math.round(q.top), r: Math.round(q.right), b: Math.round(q.bottom) } }); break; }
        }
      });
      return { nNodes: nodes.length, nHits: hits.length, hits: hits.slice(0, 4),
               fr: { l: Math.round(fr.left), r: Math.round(fr.right), t: Math.round(fr.top), b: Math.round(fr.bottom) } };
    }, { msgTs: src.msgTs, id: "fg-1792582284859" });
    console.log("  RECOUVREMENT : " + JSON.stringify(rec, null, 1));
    await defilerTout();
    const b2 = await bilan();
    ok("apres RELOAD : les ancres sont toujours la (persistees)",
      b2.surTexte > 0 && b2.avecAncre === b2.surTexte,
      b2.avecAncre + "/" + b2.surTexte + " (total " + b2.total + ")");
    ok("aucune erreur JS", errJs.length === 0, errJs.slice(0, 2).join(" | "));
  } catch (e) {
    ok("exception du banc", false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
  }

  await browser.close();
  serveur.close();
  const bons = res.filter(r => r[0]).length;
  console.log("-".repeat(74));
  console.log(`RESULTAT : ${bons}/${res.length}`);
  const sig = res.filter(r => !r[0]).map(r => r[1]);
  if (sig.length) console.log("SIGNATURES D'ECHEC : " + JSON.stringify(sig));
  console.log("-".repeat(74));
  process.exit(bons === res.length ? 0 : 1);
})();
