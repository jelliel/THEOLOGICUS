// Banc v623 — LES SURLIGNAGES RESPECTENT LES MOTS VISÉS APRÈS RECHARGE.
//
// Reproduit le chemin utilisateur réel : sélection souris d'un mot/phrase ->
// bulle "Add to chat" -> bouton ✏️ Surligner -> choix couleur -> la marque est
// enregistrée (offset start/end) puis RÉ-APPLIQUÉE après rechargement de l'app.
//
// Cas visés (ceux que l'utilisateur dit « décalés » au redémarrage) :
//   A. mot RÉPÉTÉ (« Seigneur » x3) — on surligne la 2e occurrence (index 1).
//      Une recherche texte naïve tomberait sur la 1re -> dérive visible.
//   B. mot DANS du gras (« Fils » en **Fils**) — frontière d'élément.
//   C. phrase accentuée multi-mots (« miséricordieux envers »).
//
// Attendu après recharge : chaque marque est exactement sur le mot/phrase visé
// (occurrence correcte pour A, textContent exact pour B et C).
// Contrôle négatif implicite : avec le code actuel dépourvu de garde-fou
// d'alignement sur les marques, A dérive si l'offset n'est pas capturé.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8798;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-mk-0001";
const MSG_TS = 1790500000001;
const CONTENU = [
  "Le Seigneur est miséricordieux envers tous. Le Seigneur exerce son jugement avec justice. La parole du Seigneur demeure éternellement.",
  "",
  "Le **Fils** de Dieu s'est fait chair pour la rédemption.",
].join("\n");

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Parle-moi de la miséricorde.", ts: MSG_TS - 1 },
    { role: "assistant", content: CONTENU, ts: MSG_TS, marks: [] },
  ], title: "Banc surlignage", updated: 1, fav: false,
});

// Normalise une chaîne en ne gardant que [a-z0-9] (minuscules, diacritiques et
// espaces/punctuation retirés), et renvoie la chaîne normalisée + une table
// map[normIndex] = index du caractère D'ORIGINE correspondant. Permet de faire
// correspondre une position dans l'espace normalisé (sans espaces) à une
// position dans le texte réel (avec espaces) des nœuds.
function buildNorm(full) {
  let norm = ""; const map = [];
  for (let i = 0; i < full.length; i++) {
    const ch = full[i];
    if (/\s/.test(ch)) continue;
    const st = ch.normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/[a-z0-9]/.test(st)) { norm += st; map.push(i); }
  }
  return { norm: norm, map: map };
}
function normWord(mot) {
  let w = "";
  for (let i = 0; i < mot.length; i++) {
    const ch = mot[i];
    if (/\s/.test(ch)) continue;
    const st = ch.normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/[a-z0-9]/.test(st)) w += st;
  }
  return w;
}

// Construit une Range sur la N-ième occurrence de `mot` dans #mc-ts.
function buildRangeForOccurrence(ts, mot, occ) {
  const box = document.getElementById("mc-" + ts);
  if (!box) return null;
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
  const nodes = []; let full = ""; let n;
  while ((n = walker.nextNode())) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
  const { norm: fn, map: fmap } = buildNorm(full);
  const wn = normWord(mot);
  const startsNorm = [];
  let i = 0;
  while ((i = fn.indexOf(wn, i)) !== -1) { startsNorm.push(i); i += wn.length; }
  if (occ < 0 || occ >= startsNorm.length) return null;
  const csNorm = startsNorm[occ];
  const ceNorm = csNorm + wn.length;
  const cs = fmap[csNorm];                       // index réel dans `full`
  const ce = fmap[ceNorm - 1] + 1;
  // retrouve le nœud/début et nœud/fin correspondant à [cs, ce) dans `full`
  let sc = null, so = 0, ec = null, eo = 0;
  for (const { node, start } of nodes) {
    const end = start + node.nodeValue.length;
    if (!sc && cs >= start && cs < end) { sc = node; so = cs - start; }
    if (!ec && ce > start && ce <= end) { ec = node; eo = ce - start; }
  }
  if (!sc || !ec) return null;
  const range = document.createRange();
  range.setStart(sc, so); range.setEnd(ec, eo);
  return range;
}

// Renvoie l'index 0-based de l'occurrence du mot sur laquelle se trouve la
// marque portant CE mot (parmi toutes les marques du message), ou -1.
function markOccurrence(ts, mot) {
  const box = document.getElementById("mc-" + ts);
  if (!box) return -2;
  const mks = Array.from(box.querySelectorAll("[data-mark-id]"));
  if (!mks.length) return -1;
  const wn = normWord(mot);
  // la marque visée = celle dont le texte normalisé contient le mot visé
  const mk = mks.find(m => { const t = normWord(m.textContent || ""); return t === wn || t.indexOf(wn) !== -1; });
  if (!mk) return -1;
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
  let full = ""; const nodes = []; let n;
  while ((n = walker.nextNode())) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
  const { norm: fn, map: fmap } = buildNorm(full);
  const occStartsNorm = [];
  let i = 0;
  while ((i = fn.indexOf(wn, i)) !== -1) { occStartsNorm.push(i); i += wn.length; }
  const pre = document.createRange(); pre.selectNodeContents(box);
  try { pre.setEnd(mk, 0); } catch (e) { return -3; }
  const markStartFull = pre.toString().length;
  let best = -1, bestDist = 1e9;
  occStartsNorm.forEach((oNorm, idx) => {
    const oFull = fmap[oNorm];
    const d = Math.abs(oFull - markStartFull);
    if (d < bestDist) { bestDist = d; best = idx; }
  });
  return best;
}

function markText(ts) {
  const box = document.getElementById("mc-" + ts);
  if (!box) return null;
  const mk = box.querySelector("[data-mark-id]");
  return mk ? (mk.textContent || "").trim() : null;
}

async function surligner(page, ts, mot, occ, couleur) {
  return page.evaluate(({ ts, mot, occ, couleur }) => {
    const range = (window.__buildRangeForOccurrence)(ts, mot, occ);
    if (!range) return { err: "range introuvable" };
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const box = document.getElementById("mc-" + ts);
    box.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    return { text: window.getSelection().toString() };
  }, { ts, mot, occ, couleur });
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v623 — SURLIGNAGES ANCRES AUX MOTS VISÉS APRÈS RECHARGE");
  console.log("=".repeat(72));
  if (SERVI !== RACINE) console.log(`  [info] copie servie (contrôle négatif) : ${SERVI}`);

  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-mistral-mk; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
    try {
      // seed une seule fois
      if (!localStorage.getItem("__mk_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__mk_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  // expose les helpers dans la page (globals pour que les références internes
  // buildNorm / normWord soient résolues)
  await ctx.addInitScript((srcs) => {
    try { window.buildNorm = eval("(" + srcs.buildNorm + ")"); } catch (e) {}
    try { window.normWord = eval("(" + srcs.normWord + ")"); } catch (e) {}
    try { window.__buildRangeForOccurrence = eval("(" + srcs.buildRangeForOccurrence + ")"); } catch (e) {}
    try { window.__markOccurrence = eval("(" + srcs.markOccurrence + ")"); } catch (e) {}
  }, {
    buildNorm: buildNorm.toString(),
    normWord: normWord.toString(),
    buildRangeForOccurrence: buildRangeForOccurrence.toString(),
    markOccurrence: markOccurrence.toString(),
  });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); });
  }

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(800);

    // ── A. mot répété « Seigneur » occurrence 2 (index 1) ──
    const rA = await surligner(page, MSG_TS, "Seigneur", 1, "yellow");
    await page.waitForTimeout(500);
    const bulleA = await page.evaluate(() => !!document.querySelector("#atc-bubble .atc-act[data-act=\"hl\"]"));
    ok("A — bulle + bouton ✏️ présents", bulleA, JSON.stringify(rA));
    if (bulleA) {
      await page.click("#atc-bubble .atc-act[data-act=\"hl\"]");
      await page.waitForTimeout(300);
      await page.click("#atc-color-menu .cc-dot[data-color=\"yellow\"]");
      await page.waitForTimeout(500);
    }
    const texteAvant = await page.evaluate((ts) => {
      const mk = document.getElementById("mc-" + ts).querySelector("[data-mark-id]");
      return mk ? mk.textContent.trim() : null;
    }, MSG_TS);
    ok("A — marque posée avant recharge (texte « Seigneur »)", texteAvant === "Seigneur", "texte=" + JSON.stringify(texteAvant));
    // attendre la persistance
    await page.waitForTimeout(700);
    const persiste = await page.evaluate((chatId) => {
      const raw = localStorage.getItem("theologicus_chat_" + chatId);
      if (!raw) return null;
      const c = JSON.parse(raw);
      const m = c.messages.find(x => x.ts === 1790500000001);
      return m && m.marks && m.marks.length ? m.marks.map(k => ({ id: k.id, text: k.text, start: k.start, end: k.end })) : [];
    }, CHAT_ID);
    ok("A — marque persistée avec offset (start/end définis)", Array.isArray(persiste) && persiste.length === 1 && typeof persiste[0].start === "number" && typeof persiste[0].end === "number", JSON.stringify(persiste));

    // ── B. mot dans gras « Fils » (occurrence 0) ──
    const rB = await surligner(page, MSG_TS, "Fils", 0, "green");
    await page.waitForTimeout(500);
    const bulleB = await page.evaluate(() => !!document.querySelector("#atc-bubble .atc-act[data-act=\"hl\"]"));
    if (bulleB) {
      await page.click("#atc-bubble .atc-act[data-act=\"hl\"]");
      await page.waitForTimeout(300);
      await page.click("#atc-color-menu .cc-dot[data-color=\"green\"]");
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(500);
    const texteB = await page.evaluate((ts) => {
      const mks = document.getElementById("mc-" + ts).querySelectorAll("[data-mark-id]");
      return Array.from(mks).map(m => m.textContent.trim());
    }, MSG_TS);
    ok("B — marque « Fils » posée (texte exact)", texteB.includes("Fils"), "textes=" + JSON.stringify(texteB));

    // ── C. phrase accentuée multi-mots « miséricordieux envers » (occurrence 0) ──
    const rC = await surligner(page, MSG_TS, "miséricordieux envers", 0, "pink");
    await page.waitForTimeout(500);
    const bulleC = await page.evaluate(() => !!document.querySelector("#atc-bubble .atc-act[data-act=\"hl\"]"));
    if (bulleC) {
      await page.click("#atc-bubble .atc-act[data-act=\"hl\"]");
      await page.waitForTimeout(300);
      await page.click("#atc-color-menu .cc-dot[data-color=\"pink\"]");
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(700);

    // ═══ RECHARGE (restart de l'app) ═══
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(1200); // laisse __applyMarks tourner

    const occA = await page.evaluate((ts) => (window.__markOccurrence)(ts, "Seigneur"), MSG_TS);
    ok("A — après recharge : surlignage SUR LA 2e occurrence (index 1)", occA === 1, "occurrenceIndex=" + occA);
    const texteAreload = await page.evaluate((ts) => {
      const mks = document.getElementById("mc-" + ts).querySelectorAll("[data-mark-id]");
      return Array.from(mks).map(m => m.textContent.trim());
    }, MSG_TS);
    ok("A — texte du surlignage intact après recharge", texteAreload.includes("Seigneur"), "textes=" + JSON.stringify(texteAreload));
    const occB = await page.evaluate((ts) => (window.__markOccurrence)(ts, "Fils"), MSG_TS);
    ok("B — après recharge : surlignage SUR « Fils » (index 0)", occB === 0, "occurrenceIndex=" + occB);
    const texteCreload = await page.evaluate((ts) => {
      const mks = document.getElementById("mc-" + ts).querySelectorAll("[data-mark-id]");
      return Array.from(mks).map(m => m.textContent.replace(/\s+/g, ' ').trim());
    }, MSG_TS);
    ok("C — après recharge : surlignage SUR « miséricordieux envers »", texteCreload.some(t => /mis[eé]ricordieux envers/.test(t)), "textes=" + JSON.stringify(texteCreload));

    ok("aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("banc exécuté sans exception", false, String((e && e.message) || e));
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
