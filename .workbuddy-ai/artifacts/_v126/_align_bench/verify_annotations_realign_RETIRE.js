// ⚠️ BANC RETIRÉ (2026-09-28) — NE PAS UTILISER COMME PREUVE.
//
// Sa prémisse est FAUSSE, mesuré sur pièce : il croyait tester la dérive
// d'offset en corrompant `start/end` dans IndexedDB puis localStorage. Or
// l'app RÉÉCRIT son état à la fermeture de page (`flushChatNow` sur
// pagehide/beforeunload) : la corruption est annulée avant même le
// rechargement. Mesure : offset stocké relu = 159, et `indexOf("canonique")`
// dans l'espace des nœuds texte = 159 -> la valeur corrompue n'a jamais été
// relue. Le banc passait donc À TORT (il ne prouvait rien).
//
// Le banc qui fait foi est `../verify_annotations_offset_drift.js` : il
// construit la dérive par le CHEMIN RÉEL (sélection -> bulle -> annotation)
// et possède un contrôle négatif qui échoue sur la version d'avant.
//
// Banc v126m — le cadre reste sur le MOT VISÉ même si l'offset mémorisé dérive.
//
// Contexte : `applyHighlights` replace le surlignage après chaque re-rendu en
// utilisant l'offset `start/end` mémorisé à la sélection. Si le rendu change
// (section « questions de suivi » retirée, markdown réécrit, message modifié),
// cet offset ne pointe plus sur le mot annoté : le cadre tombe sur un AUTRE
// mot — exactement le symptôme rapporté (capture 2026-09-28 132735).
//
// Ce banc PROUVE le correctif : il crée une annotation par le chemin réel,
// puis CORROMPT volontairement son offset dans IndexedDB, recharge l'app, et
// vérifie que le cadre est quand même sur le mot visé. Sans le contrôle
// d'alignement (v126m), le cadre se poserait sur le texte situé à l'offset
// corrompu.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8796;
const RACINE = path.resolve(__dirname, "..", "..", "..");
/* BENCH_ROOT permet de servir une AUTRE copie de THEOLOGICUS.html : c'est le
   contrôle négatif (version SANS le garde-fou v126m) — voir _align_bench/. */
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const DIR = path.join(RACINE, ".workbuddy-ai", "artifacts", "_v126", "_align_bench");

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

const REPONSE = [
  "Non, Tertullien n'a jamais écrit que le Livre d'Hénoc fut retiré *à cause des propriétés d'un Messie déjà venu*.",
  "En revanche :",
  "",
  "1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).",
  "2. Il **ne** justifie pas **son** exclusion du canon, **contrairement** à **Athanase** ou Épiphan**e**.",
  "3. La formulation que vous citez ressemble à une **interprétation ultérieure** (peut-être médiévale) de sa pensée.",
].join("\n");

const CIBLE = "canonique";
const DECALAGE = 40;   // l'offset corrompu tombe 40 caractères plus loin

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v126m — LE CADRE RESTE SUR LE MOT VISÉ (offset corrompu)");
  console.log("=".repeat(72));
  if (SERVI !== RACINE) console.log(`  [info] copie servie (contrôle négatif) : ${SERVI}`);

  fs.mkdirSync(DIR, { recursive: true });
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8"
          : p.endsWith(".js") ? "application/javascript; charset=utf-8" : "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  // Profil PERSISTANT : la conversation doit survivre au reload (IndexedDB).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  /* Trace : quelle copie la conversation a-t-elle été relue (LS ou IDB) et
     que dit applyHighlights (byOffset / realigned) ? */
  const diag = [];
  page.on("console", m => {
    const t = m.text();
    if (/loadChat: using source|applyHighlights:|\[MIGRATE\]/.test(t)) diag.push(t);
  });

  const init = (reponse) => {
    try { document.cookie = "key_mistral=sk-test-mistral-align; path=/"; } catch (e) {}
    /* Les lignes [DIAG] sont MASQUÉES par défaut (script « v18-quiet-console »,
       filtre sur theo_debug / ?debug=1) : sans ça le banc ne peut pas prouver
       que la corruption d'offset a réellement été relue. */
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    /* Journal interne : la console du WebView n'est pas toujours relayée au
       pilote, on capture donc les lignes [DIAG] dans window.__diagLog. */
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () {
        try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {}
        return _cl.apply(null, arguments);
      };
    } catch (e) {}
    const _orig = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = String((init && init.method) || "GET").toUpperCase();
      if (method === "POST" && /chat\/completions|\/responses|\/v1\/messages/.test(url)) {
        const enc = new TextEncoder();
        const parts = (reponse.match(/[\s\S]{1,24}/g) || [reponse])
          .map(c => enc.encode("data: " + JSON.stringify({ choices: [{ delta: { content: c } }] }) + "\n\n"));
        parts.push(enc.encode("data: [DONE]\n\n"));
        let i = 0;
        const stream = new ReadableStream({ pull(c) { if (i >= parts.length) { c.close(); return; } c.enqueue(parts[i++]); } });
        return Promise.resolve(new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
      }
      if (_orig) return _orig(input, init);
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
  };
  await ctx.addInitScript(init, REPONSE);

  async function attendreApp(page) {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); });
  }

  async function annoter(page, ts, cible) {
    await page.evaluate(({ ts, cible }) => {
      const box = document.getElementById("mc-" + ts);
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
      let full = ""; const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
      const idx = full.indexOf(cible);
      let sc = null, so = 0, ec = null, eo = 0;
      for (const { node, start } of nodes) {
        const end = start + node.nodeValue.length;
        if (!sc && idx >= start && idx < end) { sc = node; so = idx - start; }
        if (!ec && (idx + cible.length) > start && (idx + cible.length) <= end) { ec = node; eo = (idx + cible.length) - start; }
      }
      const range = document.createRange();
      range.setStart(sc, so); range.setEnd(ec, eo);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      box.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    }, { ts, cible });
    await page.waitForTimeout(420);
    await page.evaluate(() => {
      const m = document.querySelector("#atc-bubble .atc-main");
      if (m) m.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
  }

  try {
    // ── 1. Conversation + annotation par le chemin réel ──
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp(page);
    await page.waitForSelector("#user-input");
    await page.fill("#user-input", "Tertullien a-t-il dit cela ?");
    await page.evaluate(() => document.getElementById("user-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await page.waitForFunction(() => /canonique/.test(document.getElementById("chat-container").textContent || ""), null, { timeout: 60000 });
    await page.waitForTimeout(800);

    const ts = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('[id^="mc-"]')).find(x => /canonique/.test(x.textContent || ""));
      return b ? b.id.replace("mc-", "") : null;
    });
    ok("conversation créée", !!ts, "mc-" + ts);
    if (!ts) throw new Error("pas de conversation");

    await annoter(page, ts, CIBLE);
    const pose = await page.evaluate(({ ts, cible }) => {
      const box = document.getElementById("mc-" + ts);
      const byId = new Map();
      box.querySelectorAll("[data-hl-id]").forEach(sp => byId.set(sp.dataset.hlId, (byId.get(sp.dataset.hlId) || "") + sp.textContent));
      return Array.from(byId.values()).map(t => t.trim());
    }, { ts, cible: CIBLE });
    ok(`annotation posée sur « ${CIBLE} »`, pose.includes(CIBLE), JSON.stringify(pose));

    // ── 2. Corrompt l'offset dans IndexedDB **ET** dans le miroir localStorage ──
    // ATTENTION (leçon mesurée) : l'app recharge la conversation depuis la
    // source la plus RÉCENTE (`loadChat` : `updated` le plus grand gagne, LS
    // ou IDB). Corrompre IDB seul ne prouvait RIEN : LS gagnait et l'offset
    // restait intact — le contrôle négatif passait à tort. On corrompt donc
    // les DEUX copies.
    const corruption = await page.evaluate(({ decalage }) => {
      const decaler = (obj) => {
        let n = 0;
        (obj.messages || []).forEach(m => (m.annotations || []).forEach(a => {
          if (typeof a.start === "number" && typeof a.end === "number") {
            a.start += decalage; a.end += decalage; n++;
          }
        }));
        return n;
      };
      const decalerLS = () => {
        let n = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!/^theologicus_chat_/.test(k)) continue;
          try {
            const c = JSON.parse(localStorage.getItem(k) || "{}");
            const d = decaler(c);
            if (d) { localStorage.setItem(k, JSON.stringify(c)); n += d; }
          } catch (e) {}
        }
        return n;
      };
      return new Promise((resolve) => {
        const req = indexedDB.open("THEOLOGICUS_AI_DB");
        req.onerror = () => resolve("open error");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("chats", "readwrite");
          const st = tx.objectStore("chats");
          const all = st.getAll();
          all.onsuccess = () => {
            const chats = all.result || [];
            let touche = 0;
            chats.forEach(c => { touche += decaler(c); st.put(c); });
            const ls = decalerLS();
            tx.oncomplete = () => resolve("IDB décalés: " + touche + " / LS décalés: " + ls);
            tx.onerror = () => resolve("tx error");
          };
          all.onerror = () => resolve("getAll error");
        };
      });
    }, { decalage: DECALAGE });
    ok("offset corrompu dans IndexedDB ET localStorage", /IDB décalés: [1-9]/.test(String(corruption)) && /LS décalés: [1-9]/.test(String(corruption)), String(corruption));

    // ── 3. Recharge : l'app relit la conversation et réapplique les cadres ──
    const _diagAvant = diag.length;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp(page);
    await page.waitForFunction(() => /canonique/.test(document.getElementById("chat-container").textContent || ""), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const _dl = await page.evaluate(() => (window.__diagLog || []).filter(l => /loadChat: using source|applyHighlights:|\[MIGRATE\]/.test(l)));
    _dl.forEach(l => console.log("  [diag] " + l.slice(0, 220)));
    ok("la conversation relue porte bien l'offset corrompu (la corruption a pris effet)",
      _dl.some(l => /applyHighlights:.*byOffset=[1-9]/.test(l)) || _dl.some(l => /realigned=[1-9]/.test(l)),
      _dl.filter(l => /applyHighlights/.test(l)).slice(-1)[0] || "aucune ligne applyHighlights");

    const apres = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('[id^="mc-"]')).find(x => /canonique/.test(x.textContent || ""));
      if (!box) return null;
      const byId = new Map();
      box.querySelectorAll("[data-hl-id]").forEach(sp => byId.set(sp.dataset.hlId, (byId.get(sp.dataset.hlId) || "") + sp.textContent));
      return Array.from(byId.values()).map(t => t.trim());
    });

    /* Mesure : que porte RÉELLEMENT la copie relue, et quel texte occupe cet
       offset dans l'espace des nœuds texte ? (Lève toute ambiguïté.) */
    const mesure = await page.evaluate((ts) => {
      let rec = null;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!/^theologicus_chat_/.test(k)) continue;
        const c = JSON.parse(localStorage.getItem(k) || "{}");
        (c.messages || []).forEach(m => (m.annotations || []).forEach(a => { if (a.text === "canonique") rec = { start: a.start, end: a.end, text: a.text }; }));
      }
      const box = document.getElementById("mc-" + ts);
      let full = "";
      const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
      let n; while ((n = w.nextNode())) full += n.nodeValue;
      return { rec, espaceTexte: full.length, aOffset: rec ? JSON.stringify(full.slice(rec.start, rec.end)) : null, iCanonique: full.indexOf("canonique") };
    }, ts);
    console.log("  [info] mesure : " + JSON.stringify(mesure));

    ok("le cadre est TOUJOURS sur le mot visé après reload (offset corrompu)",
      Array.isArray(apres) && apres.includes(CIBLE), JSON.stringify(apres));

    // Contre-épreuve : le texte situé à l'offset corrompu ne doit PAS être cadré.
    const voisin = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('[id^="mc-"]')).find(x => /canonique/.test(x.textContent || ""));
      const t = box.textContent || "";
      const i = t.indexOf("canonique");
      return i === -1 ? null : t.slice(i + 40, i + 60);
    });
    console.log(`  [info] texte présent à l'offset corrompu : "${voisin}"`);
    ok("aucun cadre vide résiduel", await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('[id^="mc-"]')).find(x => /canonique/.test(x.textContent || ""));
      return Array.from(box.querySelectorAll("[data-hl-id]")).filter(sp => !(sp.textContent || "").trim()).length;
    }) === 0);

    ok("aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("banc exécuté sans exception", false, String(e && e.message || e));
  } finally {
    await browser.close();
    serveur.close();
  }

  const reussis = resultats.filter(r => r[0]).length;
  console.log("-".repeat(72));
  console.log(`RESULTAT : ${reussis}/${resultats.length}`);
  console.log("-".repeat(72));
  process.exit(reussis === resultats.length ? 0 : 1);
})();
