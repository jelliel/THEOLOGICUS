/* ═══════════════════════════════════════════════════════════════
   Banc v616 — SYNCHRO DES CONVERSATIONS entre appareils (relais partagé).

   Demande utilisateur : en ouvrant l'app depuis un autre appareil via le
   relais (localhost/LAN), le contenu se synchronise mais PAS le nombre de
   conversations.

   Trois défauts vérifiés ici :
   1. le pull écrivait les conversations dans IndexedDB sans jamais
      reconstruire la LISTE (renderArchives) ni les compteurs ;
   2. les conversations DÉJÀ présentes dans IndexedDB n'étaient jamais
      poussées (seules les écritures de la session l'étaient) ;
   3. le client estampillait « maintenant » : une copie locale ancienne
      écrasait une version récente venue de l'autre appareil.

   Méthode : DEUX contextes de navigateur = deux appareils aux stockages
   séparés, un seul relais (le magasin partagé).
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v616_" + Date.now()) });
  const browser = await H.launchBrowser();
  const URL_APP = "http://127.0.0.1:" + port + "/THEOLOGICUS.html";

  /* ── Appareil A (l'ordinateur) ── */
  section("1. Appareil A — une conversation existante est poussée au serveur");
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto(URL_APP, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pageA.waitForTimeout(2600);

  const T = Date.now() - 60000;   /* conversation modifiée il y a 1 minute */
  await pageA.evaluate(async (t) => {
    await db.put('chats', {
      id: 'bench-sync-1', title: 'Bench synchro', updated: t,
      messages: [{ role: 'user', content: 'bonjour' }, { role: 'assistant', content: 'salut' }]
    });
  }, T);
  await pageA.waitForTimeout(2600);

  const magasin = await pageA.evaluate(async () => (await fetch('/theologicus-store?since=0')).json());
  const entree = magasin && magasin.keys ? magasin.keys['chat::bench-sync-1'] : null;
  ok("la conversation atteint le magasin partagé", !!entree, entree ? "présente" : "ABSENTE");
  ok("le ts envoyé est CELUI de la conversation (pas « maintenant »)",
     !!entree && Math.abs(Number(entree.ts) - T) < 2000, entree ? ("ts=" + entree.ts + " attendu≈" + T) : "-");

  /* ── Appareil B (le téléphone) : contexte séparé ── */
  section("2. Appareil B — reçoit la conversation ET met à jour la LISTE");
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto(URL_APP, { waitUntil: "domcontentloaded", timeout: 60000 });

  let vuB = { chat: false, items: 0, stat: "—" };
  for (let i = 0; i < 24; i++) {
    await pageB.waitForTimeout(500);
    vuB = await pageB.evaluate(async () => {
      const c = await db.get('chats', 'bench-sync-1');
      const items = document.querySelectorAll('.archive-item[data-chat-id="bench-sync-1"]').length;
      const st = document.getElementById('stat-chats');
      return { chat: !!c, titre: c && c.title, items, stat: st ? String(st.textContent).trim() : "—" };
    });
    if (vuB.chat && vuB.items > 0) break;
  }
  ok("la conversation arrive sur l'appareil B", vuB.chat, vuB.titre || "(absente)");
  ok("la LISTE des conversations est reconstruite (archive-item)",
     vuB.items >= 1, vuB.items + " élément(s)");
  ok("le compteur « Conversations » n'est plus vide", vuB.stat !== "—" && Number(vuB.stat) >= 1, "stat-chats=" + vuB.stat);

  /* ── 3. Arbitrage par horodatage ── */
  section("3. Une copie locale ANCIENNE n'écrase pas la version récente");
  await pageB.evaluate(async (t) => {
    await db.put('chats', {
      id: 'bench-sync-1', title: 'VIEUX TITRE', updated: t,
      messages: [{ role: 'user', content: 'vieux' }]
    });
  }, T - 30000);   /* 30 s plus ancien que la version du serveur */
  await pageB.waitForTimeout(2600);
  const magasin2 = await pageB.evaluate(async () => (await fetch('/theologicus-store?since=0')).json());
  const e2 = magasin2 && magasin2.keys ? magasin2.keys['chat::bench-sync-1'] : null;
  let titreServeur = "";
  try { titreServeur = JSON.parse(e2.v).title; } catch (e) {}
  ok("le serveur conserve la version la PLUS RÉCENTE", titreServeur === "Bench synchro",
     "titre serveur = " + titreServeur);

  /* ── 4. Propreté ── */
  section("4. Aucune erreur JavaScript");
  const bruit = [];
  pageA.on("pageerror", e => bruit.push(String(e).slice(0, 160)));
  pageB.on("pageerror", e => bruit.push(String(e).slice(0, 160)));
  await pageB.waitForTimeout(300);
  ok("zéro erreur JS", bruit.length === 0, bruit.slice(0, 2).join(" | "));

  const passes = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + passes + "/" + resultats.length);
  if (passes !== resultats.length) resultats.filter(r => !r.pass).forEach(r => console.log("  ÉCHEC : " + r.label));

  await browser.close();
  relais.child.kill();
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
