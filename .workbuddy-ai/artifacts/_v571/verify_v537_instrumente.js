// Banc v537 — SÉLECTION MULTIPLE DANS LES ARCHIVES.
//
// Vérifie qu'on peut cocher PLUSIEURS conversations dans les Archives et les
// supprimer en UNE fois, sans casser : le clic sur l'item (charger la
// conversation), la corbeille v521 (la suppression reste RÉVERSIBLE), le
// compteur, ni « tout sélectionner ».
//
// ⚠️ Trois pièges d'écriture, tous MESURÉS à l'exécution :
//   1. IndexedDB n'est JAMAIS vide au démarrage — l'app crée sa propre
//      conversation au boot. Compter « 4 items » est donc faux : on sélectionne
//      PAR ID, et on n'affirme que sur les conversations semées.
//   2. `.archive-item` existe dans TROIS listes (.archives-list : panneau, vue,
//      sidebar) : tout comptage de classe doit être porté sur UNE liste, sinon
//      on lit 3× la valeur.
//   3. INVARIANT v513 : « aucun composant ui-* dans le DOM au repos ». La
//      sidebar d'Archives étant VISIBLE dès l'amorçage, le bouton de
//      suppression n'est créé QUE s'il y a une sélection. Le banc le vérifie
//      explicitement (barre présente, bouton absent, audit à 0).
//
// Usage : node verify_v537_selection.js [--port 8765]

const path = require("path");
const { spawn, execSync } = require("child_process");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");
const BHC = require('../../../tools/bench_common.js');

for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "FTP_PROXY", "ftp_proxy"]) delete process.env[k];
process.env.NO_PROXY = "*"; process.env.no_proxy = "*";

const PORT = process.argv.includes("--port") ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY_BIN || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";
const N = 4;   /* conversations semées */

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]); console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`); return !!cond; }
function section(t) { console.log("\n" + t); }

let relais = null;

const H = {
  semer: async (n) => {
    for (let i = 0; i < n; i++) {
      await db.put('chats', {
        id: 'sel-test-' + i, title: 'Conversation sélection ' + i,
        updated: Date.now() - (n - i) * 1000,
        messages: [{ role: 'user', content: 'Q' + i }, { role: 'assistant', content: 'R' + i }]
      });
    }
    await renderArchives();
    return true;
  },
  ouvrir: async () => {
    document.getElementById('archives-panel').classList.add('active');
    await renderArchives();
    return true;
  },
  fermer: () => { document.getElementById('archives-panel').classList.remove('active'); return true; },
  /* L'invariant : aucune barre ne porte de bouton ui-* quand rien n'est coché */
  barresSansBouton: () => Array.from(document.querySelectorAll('.arch-sel-bar'))
    .every(b => !b.querySelector('.arch-sel-del')),
  usages: () => (window.__v509Design ? window.__v509Design.audit().usages : -1),
  etat: () => {
    const l = document.getElementById('archives-list');
    const items = l.querySelectorAll('.archive-item');
    const bar = l.querySelector('.arch-sel-bar');
    const btn = bar ? bar.querySelector('.arch-sel-del') : null;
    return {
      items: items.length,
      cases: l.querySelectorAll('.archive-item > .arch-sel-ck').length,
      marques: l.querySelectorAll('.archive-item.arch-sel-on').length,
      barre: !!bar,
      bouton: !!btn,
      barresDoc: document.querySelectorAll('.arch-sel-bar').length,
      n: bar ? bar.querySelector('.arch-sel-n').textContent : '',
      btn: btn ? btn.textContent : '',
      desactive: btn ? btn.disabled : null,
      allCoche: bar ? bar.querySelector('.arch-sel-all-ck').checked : null,
      allIndetermine: bar ? bar.querySelector('.arch-sel-all-ck').indeterminate : null,
      usagesUi: window.__v509Design ? window.__v509Design.audit().usages : -1,
      idsListes: Array.from(items).map(x => x.getAttribute('data-chat-id'))
    };
  },
  coche: (ids) => {
    const l = document.getElementById('archives-list');
    ids.forEach(id => {
      const ck = l.querySelector('.archive-item[data-chat-id="' + id + '"] > .arch-sel-ck');
      if (ck) ck.click();
    });
    return true;
  },
  clicTout: () => { document.getElementById('archives-list').querySelector('.arch-sel-all-ck').click(); return true; },
  clicSupprimer: () => { document.getElementById('archives-list').querySelector('.arch-sel-del').click(); return true; },
  enBase: async () => (await db.getAll('chats')).map(c => c.id),
  corbeille: () => (JSON.parse(localStorage.getItem('theo_chats_trash_v1') || '[]') || []).map(c => c.id)
};

const SEMES = Array.from({ length: N }, (_, i) => 'sel-test-' + i);

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v537 — SÉLECTION MULTIPLE DANS LES ARCHIVES");
  console.log(BASE);
  console.log("=".repeat(72));
relais = await BHC.spawnRelay({ port: PORT });
if (!relais.child || relais.child.exitCode !== null) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });
  page.on("dialog", d => d.accept());
  page.on("framenavigated", f => { if (f === page.mainFrame()) console.log("NAVIGATION PAGE: " + f.url()); });

  /* banc : tracer newChat */
  page.addInitScript(() => {
    const iv2 = setInterval(() => {
      try {
        if (typeof window.newChat === "function" && !window.newChat.__patcheJ) {
          const oNC = window.newChat;
          window.newChat = async function () { window.__logJ("NEWCHAT < " + ((new Error().stack || "").split("\n")[2] || "").replace(/^\s+/, "").slice(0, 100)); const r = await oNC.apply(this, arguments); window.__logJ("NEWCHAT fini"); return r; };
          window.newChat.__patcheJ = true;
          clearInterval(iv2);
        }
      } catch (e) {}
    }, 25);
  });
  /* ISOLATION : on coupe la synchronisation serveur pour ce banc. Sans cela, le
     magasin partagé (690 conversations) est tiré dans IndexedDB pendant le banc,
     la liste des Archives devient énorme et une suppression groupée n'a plus de
     durée bornée. Le banc teste la SÉLECTION, pas la synchronisation. */
  await page.addInitScript(() => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("theo_sync_on_v1", "0");
    } catch (e) {}
    window.__journal = window.__journal || [];   /* préservé si re-navigation */
    window.__logJ = (m) => { try { window.__journal.push(Math.round(performance.now()) + "ms " + m); } catch (e) {} };
    window.__logJ("INIT page");
    /* TOUS les futurs connexions : patch au niveau du prototype */
    try {
      const proto = IDBDatabase.prototype;
      if (!proto.__patcheJ) {
        proto.__patcheJ = true;
        const oT = proto.transaction;
        proto.transaction = function (store, mode) {
          const tx = oT.apply(this, arguments);
          try {
            const st = (new Error().stack || "").split("\n")[2] || "";
            tx.addEventListener("complete", () => window.__logJ("txOK " + mode + " " + store));
            tx.addEventListener("abort", () => window.__logJ("txABORT " + mode + " " + store + " err=" + (tx.error && tx.error.name) + " < " + String(st).replace(/^\s+/, "").slice(0, 100)));
          } catch (e) {}
          return tx;
        };
      }
    } catch (e) {}
    const oOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function (name, version) {
      const st = (new Error().stack || "").split("\n").slice(2, 3).join(" ").replace(/^\s+/, "");
      window.__logJ("IDB.OPEN " + name + " v" + version + " < " + st.slice(0, 100));
      return oOpen(name, version);
    };
    const iv3 = setInterval(() => {
      try {
        if (typeof state !== "undefined" && state && !state.__patcheJ) {
          state.__patcheJ = true;
          let cid = state.chatId;
          Object.defineProperty(state, "chatId", {
            get: () => cid,
            set: (v) => { if (v !== cid) window.__logJ("CHATID " + cid + " -> " + v); cid = v; },
            configurable: true
          });
          clearInterval(iv3);
        }
      } catch (e) {}
    }, 25);
    document.addEventListener("change", function (e) {
      try {
        if (e.target && e.target.classList && e.target.classList.contains("arch-sel-ck")) {
          window.__logJ("CASE " + e.target.getAttribute("data-id") + " -> " + e.target.checked);
        }
      } catch (e2) {}
    }, true);
    const iv = setInterval(() => {
      try {
        if (typeof db !== "undefined" && db && db.put && !db.__patcheOps) {
          db.__patcheOps = true;
          const oP = db.put.bind(db), oD = db.delete.bind(db), oG = db.get.bind(db), oA = db.getAll.bind(db);
          db.put = async (store, data) => { const r = await oP(store, data); window.__logJ("PUT " + store + ":" + ((data && data.id) || "?")); return r; };
          db.delete = async (store, id) => { const r = await oD(store, id); window.__logJ("DEL " + store + ":" + id); return r; };
          db.get = async (store, id) => { const r = await oG(store, id); window.__logJ("GET " + store + ":" + id + (r ? "" : " (absent)")); return r; };
          db.getAll = async (store) => { const r = await oA(store); return r; };
          window.__logJ("ops instrumentees");
          clearInterval(iv);
        }
      } catch (e) {}
    }, 25);
  });

  section("0. Ouverture de l'application");
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((h) => {
    const enc = new TextEncoder().encode("remember:" + h);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("theologicus_remember", JSON.stringify({ v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok }));
    });
  }, AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(e => console.log('WAIT-ERR : ' + (e && e.message || e)));
  await page.waitForTimeout(1200);
  ok("le module v537 est chargé", await page.evaluate(() => !!window.__v537Selection));
  ok("renderArchives() est bien enveloppé", await page.evaluate(() => window.__v537Selection.enveloppee()));
  ok("les Archives existent (3 listes : panneau, vue, sidebar)",
    (await page.evaluate(() => document.querySelectorAll('.archives-list').length)) === 3,
    await page.evaluate(() => document.querySelectorAll('.archives-list').length));

  section("1. Au repos : INVARIANT v513 préservé (aucun ui-* malgré la sidebar visible)");
  await page.evaluate(() => { try { localStorage.removeItem('theo_chats_trash_v1'); } catch (e) {} });
  await page.evaluate(H.semer, N);                 /* rend la liste — panneau FERMÉ */
  let e = await page.evaluate(H.etat);
  ok("les conversations sont bien listées (le rendu a eu lieu)", e.items >= N, "items=" + e.items);
  ok("aucune case à cocher dans une liste cachée", e.cases === 0, "cases=" + e.cases);
  ok("aucune barre dans une liste cachée", e.barre === false);
  ok("aucun composant ui-* dans le DOM au repos", e.usagesUi === 0, "usages=" + e.usagesUi);
  ok("les barres présentes (sidebar visible) ne portent AUCUN bouton",
    await page.evaluate(H.barresSansBouton));

  section("2. À l'ouverture des ARCHIVES, cases et barre apparaissent");
  await page.evaluate(H.ouvrir);
  await page.waitForTimeout(300);
  e = await page.evaluate(H.etat);
  ok("chaque conversation listée a sa case à cocher", e.cases === e.items, "cases=" + e.cases + " items=" + e.items);
  ok("la barre d'action est présente", e.barre === true);
  ok("le bouton « Supprimer » n'est PAS encore là (rien de coché)", e.bouton === false);
  ok("l'audit est toujours à 0", e.usagesUi === 0, "usages=" + e.usagesUi);

  section("3. Cocher plusieurs conversations (par identifiant)");
  await page.evaluate(H.coche, SEMES);
  e = await page.evaluate(H.etat);
  ok(N + " identifiants sélectionnés", (await page.evaluate(() => window.__v537Selection.nb())) === N,
    (await page.evaluate(() => window.__v537Selection.ids())).join(","));
  ok("le compteur annonce " + N, new RegExp(N + ' sélectionnée').test(e.n), e.n);
  ok("le bouton APPARAÎT", e.bouton === true);
  ok("le bouton porte le nombre", new RegExp('\\(' + N + '\\)').test(e.btn), e.btn);
  ok("le bouton est actif", e.desactive === false);
  ok("les items cochés sont marqués visuellement (dans CETTE liste)", e.marques === N, "marqués=" + e.marques);
  ok("des composants ui-* sont maintenant comptés", e.usagesUi >= 1, "usages=" + e.usagesUi);

  section("4. Cocher NE CHARGE PAS la conversation (l'item porte un onclick)");
  const avant = await page.evaluate(() => state.chatId);
  await page.evaluate(H.coche, [SEMES[0]]);        /* décoche */
  await page.evaluate(H.coche, [SEMES[0]]);        /* recoche */
  const apres = await page.evaluate(() => state.chatId);
  ok("la conversation courante n'a pas changé", avant === apres, String(avant) + " -> " + String(apres));
  ok("elle est toujours cochée", (await page.evaluate(() => window.__v537Selection.nb())) === N);

  section("5. Décocher");
  await page.evaluate(H.coche, [SEMES[0]]);
  ok("il ne reste que " + (N - 1) + " sélectionnées", (await page.evaluate(() => window.__v537Selection.nb())) === N - 1);
  e = await page.evaluate(H.etat);
  ok("« tout » devient indéterminé", e.allIndetermine === true, String(e.allIndetermine));
  await page.evaluate(H.coche, [SEMES[0]]);        /* on la remet */
  e = await page.evaluate(H.etat);
  ok("« tout » n'est coché que si TOUTE la liste l'est", e.allCoche === (e.items === N), "coché=" + e.allCoche + " items=" + e.items);

  section("6. Tout décocher retire le bouton (retour à l'invariant)");
  await page.evaluate(() => { window.__v537Selection.vide(); window.__v537Selection.majBarres(); });
  e = await page.evaluate(H.etat);
  ok("le bouton a disparu", e.bouton === false);
  ok("l'audit revient à 0", e.usagesUi === 0, "usages=" + e.usagesUi);
  ok("la barre, elle, reste (compteur + « Tout »)", e.barre === true);

  section("7. « Tout sélectionner »");
  await page.evaluate(H.clicTout);
  const nTout = await page.evaluate(() => window.__v537Selection.nb());
  const nbAff = (await page.evaluate(H.etat)).items;
  ok("toutes les conversations affichées sont sélectionnées", nTout === nbAff, "sélectionnées=" + nTout + " affichées=" + nbAff);
  e = await page.evaluate(H.etat);
  ok("« tout » est coché", e.allCoche === true);
  ok("le bouton annonce " + nTout, new RegExp('\\(' + nTout + '\\)').test(e.btn), e.btn);

  section("8. Suppression SIMULTANÉE des " + N);
  await page.evaluate(H.coche, [SEMES[0]]);        /* on ne garde que les 4 semées */
  await page.evaluate(() => {
    const l = document.getElementById('archives-list');
    l.querySelectorAll('.archive-item').forEach(it => {
      const id = it.getAttribute('data-chat-id');
      const ck = it.querySelector('.arch-sel-ck');
      const voulu = ['sel-test-0', 'sel-test-1', 'sel-test-2', 'sel-test-3'].indexOf(id) >= 0;
      if (ck && ck.checked !== voulu) ck.click();
    });
  });
  ok("exactement " + N + " sélectionnées", (await page.evaluate(() => window.__v537Selection.nb())) === N,
    "n=" + (await page.evaluate(() => window.__v537Selection.nb())));
  await page.evaluate(() => window.__logJ("BANC: clic Supprimer #" + (++window.__clicN || (window.__clicN = 1))));
  await page.evaluate(H.clicSupprimer);
  /* suppression ASYNCHRONE : on attend la disparition effective, pas un délai */
  await page.waitForFunction(async (ids) => {
    const tous = (await db.getAll('chats')).map(c => c.id);
    return ids.every(i => tous.indexOf(i) < 0);
  }, SEMES, { timeout: 30000 }).catch(e => console.log('WAIT-ERR : ' + (e && e.message || e)));
  await page.evaluate(() => window.__logJ("BANC: avant enBase"));
  const enBase = await page.evaluate(H.enBase);
  const corb = await page.evaluate(H.corbeille);
  ok("les " + N + " conversations ont quitté les Archives", SEMES.every(i => enBase.indexOf(i) < 0),
    "encore en base : " + SEMES.filter(i => enBase.indexOf(i) >= 0).join(","));
  ok("les " + N + " sont allées dans la CORBEILLE (réversible, comme « ✕ Effacer »)",
    SEMES.every(i => corb.indexOf(i) >= 0), "corbeille=" + corb.length + " dont " + SEMES.filter(i => corb.indexOf(i) >= 0).length + "/" + N);
  ok("la sélection est remise à zéro", (await page.evaluate(() => window.__v537Selection.nb())) === 0);
  e = await page.evaluate(H.etat);
  ok("le compteur affiche 0", /0 sélectionnée/.test(e.n), e.n);
  ok("le bouton a disparu", e.bouton === false);
  ok("aucune conversation semée n'est restée marquée", e.marques === 0, "marqués=" + e.marques);

  section("9. « Tout sélectionner » puis suppression, et retour à l'invariant");
  const restants = (await page.evaluate(H.etat)).idsListes;
  if (restants.length) {
    await page.evaluate(H.clicTout);
    const nSel = await page.evaluate(() => window.__v537Selection.nb());
    ok("tout est sélectionné (" + restants.length + " affichées)", nSel === restants.length, "n=" + nSel);
    await page.evaluate(() => window.__logJ("BANC: clic Supprimer #" + (++window.__clicN || (window.__clicN = 1))));
  await page.evaluate(H.clicSupprimer);
    /* la suppression groupée est ASYNCHRONE (db.delete un par un) : on attend la
       fin au lieu de parier sur un délai fixe. */
    await page.waitForFunction(
      (c) => { const p = window.__v537Selection; return p.nb() === 0 && c.every(i => p.ids().indexOf(i) < 0); },
      restants, { timeout: 30000 }
    ).catch(e => console.log('WAIT-ERR : ' + (e && e.message || e)));
    const apres = await page.evaluate(H.enBase);
    ok("aucune des conversations affichées ne subsiste", restants.every(i => apres.indexOf(i) < 0),
      "encore là : " + restants.filter(i => apres.indexOf(i) >= 0).length + "/" + restants.length);
    ok("la sélection est retombée à zéro", (await page.evaluate(() => window.__v537Selection.nb())) === 0);
  } else {
    ok("rien à supprimer (liste déjà vide)", true);
    ok("sélection à zéro", true);
  }
  await page.evaluate(H.fermer);
  await page.waitForTimeout(400);
  e = await page.evaluate(H.etat);
  ok("panneau fermé : plus de barre dans la liste cachée", e.barre === false);
  ok("l'invariant tient après fermeture (aucun ui-* au repos)", e.usagesUi === 0, "usages=" + e.usagesUi);

  section("10. Propreté");
  ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  const __journalFin = await page.evaluate(() => (window.__journal || []).slice(-400)).catch(() => ["(journal indisponible)"]);
  await browser.close();
  if (relais) BHC.killRelay(relais);

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) { console.log("\nÉchecs :"); resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`)); }
  if (bons !== total) { console.log("JOURNAL IDB (fin) :"); (__journalFin || []).forEach(l => console.log("  " + l)); }
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error("\n[EXCEPTION] " + (e && e.stack || e)); if (relais) BHC.killRelay(relais); process.exit(3); });
