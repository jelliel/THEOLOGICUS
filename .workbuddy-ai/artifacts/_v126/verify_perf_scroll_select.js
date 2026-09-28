// Banc PERF — fluidité du DÉFILEMENT et de la SÉLECTION de conversation.
//
// Plainte utilisateur : « la version windows est très laggy, la sélection
// d'une conversation, le scroll dans les conversations, très laggy, je veux
// du fluide et smooth ».
//
// Ce banc ne juge pas à l'œil : il lit les compteurs du moteur via CDP
// (`Performance.getMetrics` : LayoutCount, LayoutDuration, RecalcStyleCount,
// RecalcStyleDuration, ScriptDuration, TaskDuration) et compte les appels
// réellement faits aux API coûteuses pendant l'action.
//
//   · Sélection : temps jusqu'à ce que la conversation soit affichée, plus
//     le coût script + layout + recalcul de style de l'opération.
//   · Défilement : 120 images pilotées en rAF ; on relève le nombre de
//     mises en page (LayoutCount), la durée totale de mise en page, et les
//     écarts entre images (une image > 32 ms = une saccade visible).
//   · Compteurs : `scrollIntoView` (force une mise en page ET peut
//     déclencher un défilement animé, donc d'autres événements de scroll),
//     `getBoundingClientRect` (idem), et le nombre d'événements de scroll.
//
// Contrôle négatif : `BENCH_ROOT` pointé sur la copie d'avant correction
// (`_perf_bench/avant/`) doit donner des chiffres NETTEMENT pires. Un banc
// de performance sans contrôle négatif ne prouve rien.
//
// Usage : node verify_perf_scroll_select.js [--port 8820]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8820;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

const CHAT_A = "chat-perf-a";
const CHAT_B = "chat-perf-b";
const NB_MSGS = 40;          // 20 échanges : une conversation « longue »
const IMAGES = 120;          // 2 s de défilement à 60 Hz

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}
function ligne(nom, val, unite) {
  console.log(`  ${nom.padEnd(46)} ${String(val).padStart(10)} ${unite || ""}`);
}

/* Une conversation réaliste : listes, gras, citations, titres — de quoi
   produire un vrai arbre DOM, pas trois paragraphes. */
function messages(graine) {
  const out = [];
  const base = 1790700000000 + graine * 100000;
  for (let i = 0; i < NB_MSGS / 2; i++) {
    out.push({ role: "user", content: `Question ${i + 1} sur Hénoc et le canon.`, ts: base + i * 1000 });
    out.push({
      role: "assistant",
      ts: base + i * 1000 + 500,
      annotations: [], marks: [],
      content: [
        `### Réponse ${i + 1}`,
        "",
        `Il cite **Hénoc** comme témoignage non canonique mais utile pour réfuter les hérésies (docétisme, marcionisme).`,
        "",
        "1. Il ne justifie pas son exclusion du canon, contrairement à Athanase.",
        "2. La formulation ressemble à une *interprétation ultérieure* de sa pensée.",
        "3. Le passage reste cité comme témoignage utile, jamais comme norme.",
        "",
        "> Une citation patristique de contrôle, pour la mise en page.",
        "",
        "| Source | Statut | Usage |",
        "| --- | --- | --- |",
        "| Épître de Jude | canonique | citation explicite |",
        "| 1 Hénoc | hors canon | témoignage |",
        "",
        "```js",
        "const canon = corpus.filter(livre => livre.statut === 'canonique');",
        "```",
        "",
        "En conclusion, la distinction entre **témoignage** et **norme** structure tout le dossier.",
      ].join("\n"),
    });
  }
  return out;
}

const chat = (id, graine) => JSON.stringify({
  id, model: "mistral", messages: messages(graine), title: "Perf " + id, updated: 1 + graine, fav: false,
});

const ENV = {
  a: chat(CHAT_A, 0),
  b: chat(CHAT_B, 1),
  cour: CHAT_A,
};

async function lire(client) {
  const r = await client.send("Performance.getMetrics");
  const o = {};
  r.metrics.forEach(m => { o[m.name] = m.value; });
  return o;
}
const delta = (a, b, k) => +(((b[k] || 0) - (a[k] || 0)) * 1000).toFixed(1); // ms

/* Trace CDP : les compteurs `Performance.getMetrics` ne voient PAS le coût
   de peinture et de composition, qui est justement celui qui fait ramer un
   défilement. La trace, elle, donne la durée réellement passée dans
   `Paint`, `CompositeLayers` et `UpdateLayerTree` — c'est la mesure qui
   distingue « le script est lent » de « le compositeur est saturé ». */
const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink.user_timing",
].join(",");
const SUIVIS = /^(Paint|CompositeLayers|UpdateLayerTree|Layout|RecalcStyle|PrePaint|HitTest|ScrollLayer|FunctionCall|EventDispatch|TimerFire|ParseHTML|UpdateLayoutTree|Commit)$/;

/* Compte les calques de composition et POURQUOI ils existent. En mode
   headless le compositeur ne trace pas (`CompositeLayers` reste a 0), mais
   `LayerTree` reste fiable : c'est la seule facon objective de montrer que
   chaque `.message` occupe son propre calque GPU. */
async function calques(client, page) {
  const vus = [];
  const maj = (e) => { if (e && e.layers) { vus.length = 0; for (const l of e.layers) vus.push(l); } };
  client.on("LayerTree.layerTreeDidChange", maj);
  try {
    await client.send("LayerTree.enable");
    await page.waitForTimeout(700);
    await page.evaluate(() => { document.body.style.opacity = "0.999"; });
    await page.waitForTimeout(700);
    await page.evaluate(() => { document.body.style.opacity = ""; });
    await page.waitForTimeout(700);
  } catch (e) { return { erreur: String(e) }; }
  const raisons = {};
  for (const l of vus.slice(0, 400)) {
    try {
      const r = await client.send("LayerTree.compositingReasons", { layerId: l.layerId });
      for (const x of (r.compositingReasons || [])) raisons[x] = (raisons[x] || 0) + 1;
    } catch (e) {}
  }
  try { await client.send("LayerTree.disable"); } catch (e) {}
  return { total: vus.length, raisons };
}

async function trace(client, action) {
  await client.send("Tracing.start", { categories: CATEGORIES, transferMode: "ReturnAsStream" });
  const fin = new Promise(r => client.once("Tracing.tracingComplete", r));
  await action();
  await client.send("Tracing.end");
  const { stream } = await fin;
  let brut = "";
  for (;;) {
    const r = await client.send("IO.read", { handle: stream });
    brut += r.data || "";
    if (r.eof) break;
  }
  try { await client.send("IO.close", { handle: stream }); } catch (e) {}
  let evts = [];
  try { evts = (JSON.parse(brut).traceEvents || []); } catch (e) { return { erreur: String(e) }; }
  const agg = {};
  let span = 0;
  for (const ev of evts) {
    if (ev.ph !== "X" || !ev.dur) continue;
    if (!SUIVIS.test(ev.name)) continue;
    const a = agg[ev.name] || (agg[ev.name] = { n: 0, ms: 0 });
    a.n++; a.ms += ev.dur / 1000;
  }
  for (const k in agg) agg[k].ms = +agg[k].ms.toFixed(1);
  /* Durée couverte par la trace : le premier au dernier événement suivi. */
  const suivis = evts.filter(e => e.ph === "X" && e.dur && SUIVIS.test(e.name));
  if (suivis.length) {
    const t0 = Math.min(...suivis.map(e => e.ts));
    const t1 = Math.max(...suivis.map(e => e.ts + e.dur));
    span = +((t1 - t0) / 1000).toFixed(1);
  }
  return { agg, span, total: evts.length };
}

/* Instrumentation : on compte les appels réels aux API qui forcent une mise
   en page, plutôt que de raisonner sur le code source. */
const INSTRUMENT = () => {
  window.__perf = { si: 0, rect: 0, scroll: 0 };
  const _si = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () { window.__perf.si++; return _si.apply(this, arguments); };
  const _gr = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () { window.__perf.rect++; return _gr.apply(this, arguments); };
  document.addEventListener("scroll", function () { window.__perf.scroll++; }, true);
};

(async () => {
  console.log("=".repeat(74));
  console.log("BANC PERF — DÉFILEMENT ET SÉLECTION DE CONVERSATION");
  console.log("=".repeat(74));
  if (SERVI !== RACINE) console.log(`  [info] copie servie : ${SERVI}`);

  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream",
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  await ctx.addInitScript((env) => {
    try { document.cookie = "key_mistral=sk-test-perf; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try {
      if (!localStorage.getItem("__bench_perf_seeded")) {
        localStorage.setItem("theologicus_chat_" + "chat-perf-a", env.a);
        localStorage.setItem("theologicus_chat_" + "chat-perf-b", env.b);
        localStorage.setItem("theologicus_currentChatId", env.cour);
        localStorage.setItem("__bench_perf_seeded", "1");
      }
    } catch (e) {}
  }, ENV);

  const client = await ctx.newCDPSession(page);
  await client.send("Performance.enable");

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    });
    await page.addStyleTag({ content: "#setup-wizard-overlay{display:none !important}" });
    await page.waitForFunction(() => document.querySelectorAll("#chat-container .message").length > 0, null, { timeout: 90000 });
    await page.waitForTimeout(1500);

    // ── État de départ : le CSS hérité est-il animé ? ──
    const css = await page.evaluate(() => {
      const c = document.getElementById("chat-container");
      const m = document.querySelector("#chat-container .message");
      const cm = m ? getComputedStyle(m) : null;
      return {
        scrollBehavior: c ? getComputedStyle(c).scrollBehavior : "?",
        willChange: cm ? cm.willChange : "?",
        animationName: cm ? cm.animationName : "?",
        nbMessages: document.querySelectorAll("#chat-container .message").length,
      };
    });
    console.log("\n── État de départ ──");
    ligne("messages dans la conversation", css.nbMessages, "");
    ligne("scroll-behavior hérité", css.scrollBehavior, "");
    ligne("will-change sur .message", css.willChange, "");
    ligne("animation sur .message", css.animationName, "");

    await page.evaluate(INSTRUMENT);

    // ══════════ 0. CALQUES GPU ══════════
    console.log("\n── 0. Calques de composition ──");
    const cl = await calques(client, page);
    ligne("calques composés", cl.total === undefined ? "?" : cl.total, "");
    if (cl.raisons) {
      const top = Object.entries(cl.raisons).sort((a, b) => b[1] - a[1]).slice(0, 6);
      top.forEach(([k, v]) => ligne("  raison : " + k, v, "calque(s)"));
    }

    // ══════════ 1. SÉLECTION D'UNE CONVERSATION ══════════
    console.log("\n── 1. Sélection d'une conversation ──");
    await page.evaluate(() => { window.__perf.si = 0; window.__perf.rect = 0; window.__perf.scroll = 0; });
    let m0 = await lire(client);
    const t0 = Date.now();
    await page.evaluate((id) => { window.loadArchiveChat(id, -1); }, CHAT_B);
    await page.waitForFunction(() => document.querySelectorAll("#chat-container .message").length > 0, null, { timeout: 60000 });
    const wall = Date.now() - t0;
    await page.waitForTimeout(1200);          // laisse tomber les setTimeout internes
    let m1 = await lire(client);

    const sel = {
      wall,
      script: delta(m0, m1, "ScriptDuration"),
      layout: delta(m0, m1, "LayoutDuration"),
      recalc: delta(m0, m1, "RecalcStyleDuration"),
      task: delta(m0, m1, "TaskDuration"),
      layoutCount: Math.round((m1.LayoutCount || 0) - (m0.LayoutCount || 0)),
      si: await page.evaluate(() => window.__perf.si),
      rect: await page.evaluate(() => window.__perf.rect),
      scroll: await page.evaluate(() => window.__perf.scroll),
    };
    ligne("temps jusqu'à affichage", sel.wall, "ms");
    ligne("durée script", sel.script, "ms");
    ligne("durée mise en page", sel.layout, "ms");
    ligne("durée recalcul de style", sel.recalc, "ms");
    ligne("durée totale de tâche", sel.task, "ms");
    ligne("nombre de mises en page", sel.layoutCount, "");
    ligne("appels scrollIntoView", sel.si, "");
    ligne("appels getBoundingClientRect", sel.rect, "");

    // ══════════ 2. DÉFILEMENT ══════════
    console.log("\n── 2. Défilement de la conversation ──");
    await page.evaluate(() => { window.__perf.si = 0; window.__perf.rect = 0; window.__perf.scroll = 0; });
    m0 = await lire(client);
    const frames = await page.evaluate((N) => new Promise((resolve) => {
      const c = document.getElementById("chat-container");
      const d = [];
      let last = performance.now(), n = 0;
      const max = Math.max(1, c.scrollHeight - c.clientHeight);
      const step = () => {
        const now = performance.now();
        d.push(now - last); last = now;
        n++;
        c.scrollTop = max * (n / N);
        if (n < N) requestAnimationFrame(step); else resolve(d);
      };
      requestAnimationFrame(step);
    }), IMAGES);
    m1 = await lire(client);

    const tri = frames.slice(1).sort((a, b) => a - b);
    const p = q => +tri[Math.min(tri.length - 1, Math.floor(tri.length * q))].toFixed(1);
    const sc = {
      layoutCount: Math.round((m1.LayoutCount || 0) - (m0.LayoutCount || 0)),
      layout: delta(m0, m1, "LayoutDuration"),
      recalc: delta(m0, m1, "RecalcStyleDuration"),
      script: delta(m0, m1, "ScriptDuration"),
      max: +Math.max(...tri).toFixed(1),
      p95: p(0.95),
      mediane: p(0.5),
      saccades: tri.filter(x => x > 32).length,
      si: await page.evaluate(() => window.__perf.si),
      rect: await page.evaluate(() => window.__perf.rect),
      scroll: await page.evaluate(() => window.__perf.scroll),
    };
    ligne("images mesurées", tri.length, "");
    ligne("écart médian entre images", sc.mediane, "ms");
    ligne("écart p95", sc.p95, "ms");
    ligne("écart maximal", sc.max, "ms");
    ligne("images > 32 ms (saccades)", sc.saccades, "");
    ligne("durée mise en page", sc.layout, "ms");
    ligne("durée recalcul de style", sc.recalc, "ms");
    ligne("nombre de mises en page", sc.layoutCount, "");
    ligne("appels scrollIntoView", sc.si, "");
    ligne("appels getBoundingClientRect", sc.rect, "");
    ligne("événements de scroll reçus", sc.scroll, "");

    // ══════════ 3. DÉFILEMENT SOUS TRACE (peinture et composition) ══════════
    console.log("\n── 3. Défilement sous trace CDP (peinture / composition) ──");
    const tr = await trace(client, async () => {
      await page.evaluate((N) => new Promise((resolve) => {
        const c = document.getElementById("chat-container");
        let n = 0;
        const max = Math.max(1, c.scrollHeight - c.clientHeight);
        const step = () => { n++; c.scrollTop = max * (n / N); if (n < N) requestAnimationFrame(step); else resolve(); };
        requestAnimationFrame(step);
      }), IMAGES);
    });
    const g = (k) => (tr.agg && tr.agg[k]) ? tr.agg[k] : { n: 0, ms: 0 };
    const paint = g("Paint"), comp = g("CompositeLayers"), lay = g("Layout"), rec = g("UpdateLayoutTree") ;
    const recalc = rec.n ? rec : g("RecalcStyle");
    ligne("durée couverte par la trace", tr.span, "ms");
    ligne("Paint : appels / durée", paint.n + " / " + paint.ms, "ms");
    ligne("CompositeLayers : appels / durée", comp.n + " / " + comp.ms, "ms");
    ligne("Layout : appels / durée", lay.n + " / " + lay.ms, "ms");
    ligne("Recalcul de style : appels / durée", recalc.n + " / " + recalc.ms, "ms");
    ligne("UpdateLayerTree : appels / durée", g("UpdateLayerTree").n + " / " + g("UpdateLayerTree").ms, "ms");
    ligne("PrePaint : appels / durée", g("PrePaint").n + " / " + g("PrePaint").ms, "ms");
    const peinturePart = tr.span ? +(((paint.ms + comp.ms) / tr.span) * 100).toFixed(1) : 0;
    ligne("part du temps en peinture + composition", peinturePart, "%");

    // ══════════ 4. LA MINIMAP FONCTIONNE TOUJOURS ══════════
    /* La minimap est devenue paresseuse : elle n'est construite qu'à
       l'ouverture, et son surlignage ne tourne plus pendant le défilement.
       C'est le changement le plus risqué du lot — il faut donc vérifier
       qu'elle marche encore quand on la regarde. */
    console.log("\n── 4. La minimap fonctionne toujours ──");
    await page.evaluate(() => { window.__perf.si = 0; });
    await page.evaluate(() => { document.getElementById("chat-container").scrollTop = 0; });
    await page.waitForTimeout(250);
    await page.hover("#custom-scrollbar");
    await page.waitForTimeout(500);
    const mm = await page.evaluate(() => {
      const m = document.getElementById("chat-minimap");
      return {
        visible: m.classList.contains("visible"),
        entrees: m.querySelectorAll(".mm-entry").length,
        actifs: m.querySelectorAll(".mm-entry.active").length,
      };
    });
    ligne("minimap visible au survol", mm.visible, "");
    ligne("entrées de minimap", mm.entrees, "");
    ligne("entrées actives", mm.actifs, "");
    ok("la minimap s'ouvre au survol de la barre", mm.visible);
    ok("la minimap est peuplée", mm.entrees > 0, mm.entrees);
    ok("exactement une entrée active", mm.actifs === 1, mm.actifs);

    /* Minimap ouverte : le surlignage doit suivre le défilement. On relève
       l'entrée active EN HAUT puis EN BAS — comparer deux mesures prises
       toutes les deux en bas ne prouve rien (erreur commise au premier jet
       de ce banc). */
    const rang = () => page.evaluate(() => {
      const a = document.querySelector("#chat-minimap .mm-entry.active");
      return a ? Array.from(a.parentNode.children).indexOf(a) : -1;
    });
    const actifHaut = await rang();
    await page.evaluate(() => { window.__perf.si = 0; });
    await page.evaluate((N) => new Promise((resolve) => {
      const c = document.getElementById("chat-container");
      let n = 0;
      const max = Math.max(1, c.scrollHeight - c.clientHeight);
      const step = () => { n++; c.scrollTop = max * (n / N); if (n < N) requestAnimationFrame(step); else resolve(); };
      requestAnimationFrame(step);
    }), 40);
    await page.waitForTimeout(300);
    const actifBas = await rang();
    const siOuvert = await page.evaluate(() => window.__perf.si);
    ligne("entrée active en haut / en bas", actifHaut + " / " + actifBas, "");
    ligne("appels scrollIntoView (minimap ouverte)", siOuvert, "");
    ok("l'entrée active de la minimap suit le défilement", actifBas > actifHaut, actifHaut + " -> " + actifBas);
    ok("la minimap ne force plus de mise en page par image",
      siOuvert === 0, siOuvert + " scrollIntoView pour 40 images");
    const mmScroll = await page.evaluate(() => document.getElementById("chat-minimap").scrollTop);
    ligne("défilement interne de la minimap", mmScroll, "px");
    ok("la minimap a suivi l'entrée active (elle a défilé)", mmScroll > 0, mmScroll + " px");

    /* Minimap fermée : plus aucun travail. */
    await page.mouse.move(700, 450);
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.__perf.si = 0; });
    await page.evaluate((N) => new Promise((resolve) => {
      const c = document.getElementById("chat-container");
      let n = 0;
      const max = Math.max(1, c.scrollHeight - c.clientHeight);
      const step = () => { n++; c.scrollTop = max * (n / N); if (n < N) requestAnimationFrame(step); else resolve(); };
      requestAnimationFrame(step);
    }), 40);
    await page.waitForTimeout(200);
    const siFerme = await page.evaluate(() => window.__perf.si);
    const mmFermee = await page.evaluate(() => document.getElementById("chat-minimap").classList.contains("visible"));
    ligne("minimap visible après sortie de survol", mmFermee, "");
    ligne("appels scrollIntoView (minimap fermée)", siFerme, "");
    ok("la minimap se referme quand on la quitte", !mmFermee);
    ok("minimap fermée : plus aucun scrollIntoView pendant le défilement", siFerme === 0, siFerme);

    // ══════════ 5. LE MARQUAGE DE LA CONVERSATION ACTIVE SUIT ══════════
    /* `loadArchiveChat` ne reconstruit plus toute la liste : il déplace la
       classe `active-chat`. Il faut donc vérifier que le déplacement a bien
       lieu — sinon la sélection ne se verrait plus dans la liste. */
    console.log("\n── 5. Marquage de la conversation active ──");
    /* `renderArchives()` lit IndexedDB (`db.getAll('chats')`), alors que le
       semis du banc ne remplit que localStorage (le schema IndexedDB n'existe
       pas encore au moment d'addInitScript). Sans ce semis, la liste reste
       vide et l'assertion ne teste rien. */
    const semis = await page.evaluate(async (env) => {
      try {
        await db.put("chats", JSON.parse(env.a));
        await db.put("chats", JSON.parse(env.b));
        return "ok";
      } catch (e) { return "ERREUR " + e; }
    }, ENV);
    ligne("semis IndexedDB", semis, "");
    await page.evaluate(() => window.renderArchives());
    await page.waitForTimeout(400);
    const marque = (id) => page.evaluate((i) => {
      const actifs = Array.from(document.querySelectorAll(".archive-item.active-chat"))
        .map(e => e.dataset.chatId);
      const cible = document.querySelector('.archive-item[data-chat-id="' + i + '"]');
      return {
        total: document.querySelectorAll(".archive-item").length,
        actifs,
        cibleActive: !!(cible && cible.classList.contains("active-chat")),
      };
    }, id);

    await page.evaluate(() => window.loadArchiveChat("chat-perf-a", -1));
    await page.waitForTimeout(1000);
    const mA = await marque("chat-perf-a");
    ligne("éléments dans la liste", mA.total, "");
    ligne("éléments marqués actifs (A)", JSON.stringify(mA.actifs), "");
    ok("la liste contient les conversations", mA.total >= 2, mA.total);
    ok("la conversation chargée est marquée active",
      mA.cibleActive && mA.actifs.length === 1, JSON.stringify(mA));

    await page.evaluate(() => window.loadArchiveChat("chat-perf-b", -1));
    await page.waitForTimeout(1000);
    const mB = await marque("chat-perf-b");
    ligne("éléments marqués actifs (B)", JSON.stringify(mB.actifs), "");
    ok("le marquage suit la nouvelle sélection",
      mB.cibleActive && mB.actifs.length === 1, JSON.stringify(mB));

    // ══════════ Verdict ══════════
    console.log("\n── Verdict ──");
    /* Seuils : ce sont des plafonds de non-régression, pas des objectifs.
       Ils sont volontairement larges (la machine de mesure n'est pas un
       appareil de référence) mais suffisamment serrés pour qu'une
       régression franche les franchisse. */
    ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
    ok("le défilement ne rejoue pas d'animation sur toute la conversation",
      css.animationName === "none" || css.animationName === "", css.animationName);
    ok("aucun calque GPU permanent par message (will-change)",
      css.willChange === "auto" || css.willChange === "", css.willChange);
    ok("le défilement n'est pas animé par le CSS hérité",
      css.scrollBehavior === "auto", css.scrollBehavior);
    ok("sélection : durée de tâche sous 1200 ms", sel.task < 1200, sel.task + " ms");
    /* Seuil : 25. La révision d'avant correction en produisait 105 pour la
       même conversation (second rendu complet + buildMinimap par message +
       reconstruction de la liste des conversations). Une valeur plancher de
       3 n'était pas atteignable : rendre 40 messages demande de vraies mises
       en page. */
    ok("sélection : au plus 25 mises en page", sel.layoutCount <= 25, sel.layoutCount);
    ok("sélection : aucun scrollIntoView", sel.si === 0, sel.si);
    ok("sélection : moins de 100 appels getBoundingClientRect", sel.rect < 100, sel.rect);
    ok("défilement : écart p95 sous 34 ms", sc.p95 < 34, sc.p95 + " ms");
    ok("défilement : aucune image au-delà de 100 ms", sc.max < 100, sc.max + " ms");
    ok("défilement : au plus 4 mises en page par image",
      sc.layoutCount <= IMAGES * 4, sc.layoutCount + " pour " + IMAGES + " images");
    ok("défilement : aucun scrollIntoView", sc.si === 0, sc.si);
    ok("défilement : durée de mise en page sous 250 ms", sc.layout < 250, sc.layout + " ms");
    ok("défilement : peinture + composition sous 25 % du temps",
      peinturePart < 25, peinturePart + " %");
    ok("défilement : au plus 1 composition par image",
      comp.n <= IMAGES, comp.n + " pour " + IMAGES + " images");
    /* Le nom de raison renvoyé par CDP est une phrase
       (« Has a will-change: transform compositing hint. ») : on cherche par
       sous-chaîne, sinon l'assertion passe toujours. */
    const rw = Object.keys(cl.raisons || {})
      .filter(k => /will-change/i.test(k))
      .reduce((s, k) => s + cl.raisons[k], 0);
    /* Plafond : la coque, les panneaux et l'en-tête sont des éléments
       UNIQUES, promus volontairement. Le défaut était d'en promouvoir un par
       message : 47 mesurés sur une conversation de 40. */
    ok("calques GPU promus par will-change sous 10 (éléments uniques)", rw < 10, rw + " calque(s)");
    ok("moins de 40 calques composés au total", (cl.total || 0) < 40, cl.total);

    console.log("\n" + "-".repeat(74));
    const ko = resultats.filter(r => !r[0]).length;
    console.log(`RESULTAT : ${resultats.length - ko}/${resultats.length}`);
    console.log("-".repeat(74));
    console.log("JSON " + JSON.stringify({
      sel, sc, css, calques: cl,
      trace: { span: tr.span, paint, comp, layout: lay, recalc, peinturePart },
    }));
  } catch (e) {
    console.log("[EXCEPTION] " + (e && e.stack ? e.stack : e));
    resultats.push([false, "exception", String(e)]);
  } finally {
    await browser.close();
    serveur.close();
  }
  process.exit(resultats.some(r => !r[0]) ? 1 : 0);
})();
