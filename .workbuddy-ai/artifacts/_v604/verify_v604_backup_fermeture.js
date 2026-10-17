/* ═══════════════════════════════════════════════════════════════
   Banc v604 — BACKUP DES CONVERSATIONS À CHAQUE FERMETURE.

   Demande utilisateur : qu'à chaque fermeture de THEOLOGICUS un backup des
   conversations soit fait. v604 ajoute trois déclencheurs complémentaires
   (visibilitychange caché, pagehide/beforeunload, filet 5 min) et deux
   destinations : IndexedDB auto_backups (garder 7, toutes plateformes) et
   backups/ du serveur (garder 30, via /save-data).

   Isolation : THEO_BACKUPS_DIR est fixé AVANT le lancement du relais — les
   fichiers de backup du banc atterrissent dans un dossier temporaire et non
   dans le dépôt (backups/ est gitignoré mais on évite d'écrire dedans).

   CONTRÔLE NÉGATIF : les exports MANUELS (autres noms de fichiers) ne sont
   jamais purgés par la purge des conversations.
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os"), fs = require("fs");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "theo_v604_"));
process.env.THEO_BACKUPS_DIR = path.join(TMP, "backups");
const B64 = (s) => Buffer.from(s, "utf8").toString("base64");

async function posterSauvegarde(port, filename, contenu) {
  const r = await fetch(`http://127.0.0.1:${port}/save-data`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, data64: B64(contenu) }),
  });
  return r.status;
}

function fichiersConversations() {
  const d = process.env.THEO_BACKUPS_DIR;
  try { return fs.readdirSync(d).filter(f => /^THEOLOGICUS-conversations-.*\.json$/.test(f)); }
  catch (e) { return []; }
}

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v604_idb_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); });
  try { await page.addStyleTag({ content: "#setup-wizard-overlay,#theo-maj-bandeau{display:none !important}" }); } catch (e) {}

  /* ── 1. Semer 2 conversations dans IndexedDB ── */
  section("1. Deux conversations semées dans IndexedDB (store chats)");
  const semees = await page.evaluate(async () => {
    function putChat(chat) {
      return new Promise((res, rej) => {
        const rq = indexedDB.open("THEOLOGICUS_AI_DB");
        rq.onerror = () => rej(rq.error);
        rq.onsuccess = () => {
          const c = rq.result;
          try {
            const tx = c.transaction("chats", "readwrite");
            tx.objectStore("chats").put(chat);
            tx.oncomplete = () => { c.close(); res(true); };
            tx.onerror = () => { c.close(); rej(tx.error); };
          } catch (e) { c.close(); rej(e); }
        };
      });
    }
    await putChat({ id: "bench-chat-A", title: "Conversation banc A", updated: Date.now() - 2000,
      messages: [{ role: "user", content: "Bonjour A" }, { role: "assistant", content: "Réponse A" }] });
    await putChat({ id: "bench-chat-B", title: "Conversation banc B", updated: Date.now() - 1000,
      messages: [{ role: "user", content: "Bonjour B" }] });
    return true;
  });
  ok("2 chats semés", semees === true, "");

  /* ── 2. Fermeture simulée : sauvegardeFermeture(true) ── */
  section("2. Fermeture simulée — instantané IndexedDB auto_backups");
  await page.evaluate(() => window.sauvegardeFermeture(true));
  await page.waitForTimeout(1200);
  const idb = await page.evaluate(async () => {
    const liste = await window.listerAutoBackups();
    return liste.map(e => ({ id: e.id, ts: e.ts, contient: e.json || "" }));
  });
  ok("un instantané auto_backups existe", idb.length >= 1, idb.length + " entrée(s)");
  const derniere = idb.sort((a, b) => b.ts - a.ts)[0] || { contient: "" };
  ok("l'instantané contient les DEUX conversations",
     /Conversation banc A/.test(derniere.contient) && /Conversation banc B/.test(derniere.contient), "");
  ok("format restaurable (champ data.chats)", /"chats"/.test(derniere.contient), "");

  /* ── 3. Le fichier daté arrive dans backups/ du serveur ── */
  section("3. Fichier serveur — THEOLOGICUS-conversations-*.json écrit dans backups/");
  let fichierServeur = [];
  for (let i = 0; i < 20; i++) {
    fichierServeur = fichiersConversations();
    if (fichierServeur.length) break;
    await new Promise(r => setTimeout(r, 500));
  }
  ok("au moins un fichier daté écrit par le serveur", fichierServeur.length >= 1,
     fichierServeur.slice(0, 2).join(", "));
  if (fichierServeur.length) {
    const contenu = fs.readFileSync(path.join(process.env.THEO_BACKUPS_DIR, fichierServeur[0]), "utf8");
    ok("le fichier serveur contient les conversations", /Conversation banc A/.test(contenu), "");
    ok("payload restaurable (data.chats + source THEOLOGICUS)", /"chats"/.test(contenu) && /THEOLOGICUS/.test(contenu), "");
  }

  /* ── 4. Purge IndexedDB — garder 7 ── */
  section("4. Purge IndexedDB — au-delà de 7 instantanés, les plus vieux partent");
  await page.evaluate(async () => {
    for (let i = 1; i <= 9; i++) {
      await new Promise((res) => {
        const rq = indexedDB.open("THEOLOGICUS_AI_DB");
        rq.onsuccess = () => {
          const c = rq.result;
          const tx = c.transaction("auto_backups", "readwrite");
          tx.objectStore("auto_backups").put({ id: "conv-vieux-" + i, ts: Date.now() - 100000 * i, type: "conversations", json: "{}" });
          tx.oncomplete = () => { c.close(); res(); };
          tx.onerror = () => { c.close(); res(); };
        };
      });
    }
  });
  await page.evaluate(() => window.sauvegardeFermeture(true));
  await page.waitForTimeout(1200);
  const apres = await page.evaluate(async () => {
    const liste = await window.listerAutoBackups();
    const ids = liste.map(e => e.id);
    return { count: ids.length, ids };
  });
  ok("auto_backups limité à 7", apres.count <= 7, apres.count + " entrée(s)");
  ok("les plus VIEUX ont été supprimés", !apres.ids.includes("conv-vieux-9") && !apres.ids.includes("conv-vieux-8"), "");

  /* ── 5. Purge serveur — garder 30, exports manuels épargnés ── */
  section("5. Purge serveur — 32 fichiers conversations -> 30, exports manuels épargnés");
  await posterSauvegarde(port, "THEOLOGICUS-backup-manuel.json", '{"manuel":true}');
  for (let i = 1; i <= 32; i++) {
    await posterSauvegarde(port, `THEOLOGICUS-conversations-2099-01-01_${String(i).padStart(5, "0")}.json`, `{"n":${i}}`);
  }
  await new Promise(r => setTimeout(r, 1500));
  const conv = fichiersConversations();
  const manuel = fs.existsSync(path.join(process.env.THEO_BACKUPS_DIR, "THEOLOGICUS-backup-manuel.json"));
  ok("les conversations sont purgées à 30 (au plus)", conv.length <= 30, conv.length + " fichier(s)");
  ok("l'export MANUEL n'est pas touché par la purge", manuel, "");

  /* ── 6. Propreté ── */
  section("6. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 2).join(" | "));

  await browser.close();
  relais.child.kill();
  const passes = resultats.filter(r => r.pass).length;
  console.log("\n========================================================================");
  console.log("RESULTAT : " + passes + "/" + resultats.length);
  console.log("========================================================================");
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("ERREUR BANC:", e); process.exit(1); });
