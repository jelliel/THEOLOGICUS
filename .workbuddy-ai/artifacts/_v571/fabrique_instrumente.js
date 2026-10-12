/* crée une copie instrumentée du banc v537 (v3 : prototype IDB + ops + navig). */
const fs = require('fs');
let src = fs.readFileSync('C:/tmp/theoverify/.workbuddy-ai/artifacts/_v537/verify_v537_selection.js', 'utf8');
src = src.replace(/\r\n/g, '\n');

const ancDialog = 'page.on("dialog", d => d.accept());';
const nouvDialog = ancDialog + '\n  page.on("framenavigated", f => { if (f === page.mainFrame()) console.log("NAVIGATION PAGE: " + f.url()); });';
const i0 = src.indexOf(ancDialog);
if (i0 === -1) { console.error('ancrage dialog absent'); process.exit(1); }
src = src.slice(0, i0) + nouvDialog + src.slice(i0 + ancDialog.length);

const ancInit = [
'  await page.addInitScript(() => {',
'    try {',
'      localStorage.setItem("theologicus_wizard_skipped", "1");',
'      localStorage.setItem("theo_sync_on_v1", "0");',
'    } catch (e) {}',
'  });'
].join('\n');
const nouvInit = [
'  await page.addInitScript(() => {',
'    try {',
'      localStorage.setItem("theologicus_wizard_skipped", "1");',
'      localStorage.setItem("theo_sync_on_v1", "0");',
'    } catch (e) {}',
'    window.__journal = window.__journal || [];   /* préservé si re-navigation */',
'    window.__logJ = (m) => { try { window.__journal.push(Math.round(performance.now()) + "ms " + m); } catch (e) {} };',
'    window.__logJ("INIT page");',
'    /* TOUS les futurs connexions : patch au niveau du prototype */',
'    try {',
'      const proto = IDBDatabase.prototype;',
'      if (!proto.__patcheJ) {',
'        proto.__patcheJ = true;',
'        const oT = proto.transaction;',
'        proto.transaction = function (store, mode) {',
'          const tx = oT.apply(this, arguments);',
'          try {',
'            const st = (new Error().stack || "").split("\\n")[2] || "";',
'            tx.addEventListener("complete", () => window.__logJ("txOK " + mode + " " + store));',
'            tx.addEventListener("abort", () => window.__logJ("txABORT " + mode + " " + store + " err=" + (tx.error && tx.error.name) + " < " + String(st).replace(/^\\s+/, "").slice(0, 100)));',
'          } catch (e) {}',
'          return tx;',
'        };',
'      }',
'    } catch (e) {}',
'    const oOpen = indexedDB.open.bind(indexedDB);',
'    indexedDB.open = function (name, version) {',
'      const st = (new Error().stack || "").split("\\n").slice(2, 3).join(" ").replace(/^\\s+/, "");',
'      window.__logJ("IDB.OPEN " + name + " v" + version + " < " + st.slice(0, 100));',
'      return oOpen(name, version);',
'    };',
'    const iv3 = setInterval(() => {',
'      try {',
'        if (typeof state !== "undefined" && state && !state.__patcheJ) {',
'          state.__patcheJ = true;',
'          let cid = state.chatId;',
'          Object.defineProperty(state, "chatId", {',
'            get: () => cid,',
'            set: (v) => { if (v !== cid) window.__logJ("CHATID " + cid + " -> " + v); cid = v; },',
'            configurable: true',
'          });',
'          clearInterval(iv3);',
'        }',
'      } catch (e) {}',
'    }, 25);',
'    document.addEventListener("change", function (e) {',
'      try {',
'        if (e.target && e.target.classList && e.target.classList.contains("arch-sel-ck")) {',
'          window.__logJ("CASE " + e.target.getAttribute("data-id") + " -> " + e.target.checked);',
'        }',
'      } catch (e2) {}',
'    }, true);',
'    const iv = setInterval(() => {',
'      try {',
'        if (typeof db !== "undefined" && db && db.put && !db.__patcheOps) {',
'          db.__patcheOps = true;',
'          const oP = db.put.bind(db), oD = db.delete.bind(db), oG = db.get.bind(db), oA = db.getAll.bind(db);',
'          db.put = async (store, data) => { const r = await oP(store, data); window.__logJ("PUT " + store + ":" + ((data && data.id) || "?")); return r; };',
'          db.delete = async (store, id) => { const r = await oD(store, id); window.__logJ("DEL " + store + ":" + id); return r; };',
'          db.get = async (store, id) => { const r = await oG(store, id); window.__logJ("GET " + store + ":" + id + (r ? "" : " (absent)")); return r; };',
'          db.getAll = async (store) => { const r = await oA(store); return r; };',
'          window.__logJ("ops instrumentees");',
'          clearInterval(iv);',
'        }',
'      } catch (e) {}',
'    }, 25);',
'  });'
].join('\n');
const i1 = src.indexOf(ancInit);
if (i1 === -1) { console.error('ancrage init absent'); process.exit(1); }
src = src.slice(0, i1) + nouvInit + src.slice(i1 + ancInit.length);

/* newChat avec pile d'appel */
const ancNC = 'page.on("framenavigated"';
const iNC = src.indexOf('  /* ISOLATION :');
if (iNC === -1) { console.error('ancrage isolation absent'); process.exit(1); }
const ncPatch = [
'  /* banc : tracer newChat */',
'  page.addInitScript(() => {',
'    const iv2 = setInterval(() => {',
'      try {',
'        if (typeof window.newChat === "function" && !window.newChat.__patcheJ) {',
'          const oNC = window.newChat;',
'          window.newChat = async function () { window.__logJ("NEWCHAT < " + ((new Error().stack || "").split("\\n")[2] || "").replace(/^\\s+/, "").slice(0, 100)); const r = await oNC.apply(this, arguments); window.__logJ("NEWCHAT fini"); return r; };',
'          window.newChat.__patcheJ = true;',
'          clearInterval(iv2);',
'        }',
'      } catch (e) {}',
'    }, 25);',
'  });',
''
].join('\n');
src = src.slice(0, iNC) + ncPatch + src.slice(iNC);

/* marqueurs du banc dans le journal (section 8 ET 9) + dump avant close */
const clicLine = '  await page.evaluate(H.clicSupprimer);';
const nClics = src.split(clicLine).length - 1;
if (nClics !== 2) { console.error('clicSupprimer trouvé ' + nClics + ' fois (attendu 2)'); process.exit(1); }
src = src.split(clicLine).join('  await page.evaluate(() => window.__logJ("BANC: clic Supprimer #" + (++window.__clicN || (window.__clicN = 1))));\n' + clicLine);
const enBaseLine = '  const enBase = await page.evaluate(H.enBase);';
const iEn = src.indexOf(enBaseLine);
if (iEn === -1) { console.error('ancrage enBase absent'); process.exit(1); }
src = src.slice(0, iEn) + '  await page.evaluate(() => window.__logJ("BANC: avant enBase"));\n' + src.slice(iEn);

const ancClose = '  await browser.close();';
const nouvClose = '  const __journalFin = await page.evaluate(() => (window.__journal || []).slice(-400)).catch(() => ["(journal indisponible)"]);\n  await browser.close();';
const i3 = src.indexOf(ancClose);
if (i3 === -1) { console.error('ancrage close absent'); process.exit(1); }
src = src.slice(0, i3) + nouvClose + src.slice(i3 + ancClose.length);

const ancBilan = 'if (bons !== total) { console.log("\\nÉchecs :"); resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`)); }';
const nouvBilan = ancBilan + '\n  if (bons !== total) { console.log("JOURNAL IDB (fin) :"); (__journalFin || []).forEach(l => console.log("  " + l)); }';
const i2 = src.indexOf(ancBilan);
if (i2 === -1) { console.error('ancrage bilan absent'); process.exit(1); }
src = src.slice(0, i2) + nouvBilan + src.slice(i2 + ancBilan.length);

/* les waits avales : logger l'exception au lieu de la taire */
const nCatch = src.split('.catch(() => {});').length - 1;
if (nCatch < 1) { console.error('aucun .catch(() => {}) trouvé'); process.exit(1); }
src = src.split('.catch(() => {});').join(".catch(e => console.log('WAIT-ERR : ' + (e && e.message || e)));");

fs.writeFileSync('C:/tmp/theoverify/.workbuddy-ai/artifacts/_v571/verify_v537_instrumente.js', src, 'utf8');
console.log('banc instrumenté v3 écrit');
