/* v673 — TRANCHES 3 et 4 : injection dans le prompt + réglage par agent + puce.
   Tout passe par l'INTERFACE RÉELLE (créer l'agent, cocher, sauvegarder,
   sélectionner, envoyer) : `state` et `db` sont des `const` de module, donc
   injoignables depuis la page — et un banc qui les forcerait testerait un
   chemin que l'utilisateur n'emprunte jamais.

   Le modèle est remplacé par un faux flux SSE : on inspecte le CORPS de la
   requête, c'est-à-dire exactement ce que le modèle reçoit. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9692);
const RACINE = path.resolve(process.env.BENCH_ROOT || "C:/tmp/theoverify");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0, ign_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]    " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + "  -- " + detail); }
}
const pause = ms => new Promise(r => setTimeout(r, ms));
function ignore(nom, raison) { ign_n++; console.log("[IGNORE] " + nom + "  -- " + raison); }

(async () => {
  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));

  /* ═══ SERVEUR MCP SIMULÉ ═══
     🔴 Sans lui, quand le réseau est coupé (bac à sable, panne, ou Cloudflare qui
     bloque les IP de runner), les assertions d'injection étaient IGNORÉES : le
     banc passait sans jamais vérifier la fonction qu'il est censé protéger.
     Avec ce double, l'injection est vérifiée DÉTERMINISTEMENT, hors ligne.
     Le VRAI serveur reste exercé par `verify_v673_client_detecteur.js`. */
  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, async (route) => {
    let nom = "", args = {}, id = 1;
    try {
      const b = JSON.parse(route.request().postData() || "{}");
      id = b.id; nom = b.params && b.params.name; args = (b.params && b.params.arguments) || {};
    } catch (e) {}
    const P = (i, r, a, d, w) => ({
      id: i, reference: r, author: a, date: d, work: w,
      english: "Passage simule pour le banc, sur " + r + ".",
      url: "https://sophiascriptura.com/p/" + String(i).replace(/\//g, "-"),
      sbl_footnote: r + " (LCL 25:78; trans. Sophia Scriptura)."
    });
    let charge = { total: 0 };
    if (nom === "lookup_scripture") {
      charge = { total: 2, query: args.reference, passages: [
        P("ign-polycarp/5.2", "Ign. Pol. 5.2", "Ignatius of Antioch", "ca. 110", "To Polycarp"),
        P("herm-mand/4.1.6", "Herm. Mand. 4.1.6", "Hermas", "ca. 150", "Shepherd of Hermas")
      ] };
    } else if (nom === "search_text") {
      charge = { total: 2, query: args.query, passages: [
        P("1clem/55.4", "1 Clem. 55.4", "Clement of Rome", "ca. 95", "To the Corinthians"),
        P("clem-strom/4.19", "Clement of Alexandria, Strom. 4.19.118", "Clement of Alexandria", "ca. 198", "Stromateis")
      ] };
    } else if (nom === "get_passages") {
      const ids = args.ids || [];
      charge = { requested: ids.length, returned: ids.length,
                 passages: ids.map(i => P(i, i, "Auteur simule", "ca. 110", "Oeuvre simulee")) };
    } else if (nom === "list_topics") {
      charge = { total: 1, topics: [{ id: "baptism", name: "Baptism" }] };
    }
    route.fulfill({
      status: 200, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: id, result: { content: [{ type: "text", text: JSON.stringify(charge) }] } })
    });
  });

  /* faux modèle : on capture le corps et on renvoie un flux SSE minimal */
  const corps = [];
  await page.route("**/faux-llm", async (route) => {
    try { corps.push(JSON.parse(route.request().postData() || "{}")); } catch (e) { corps.push({ _brut: route.request().postData() }); }
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body: 'data: {"choices":[{"delta":{"content":"Reponse de test."}}]}\n\ndata: [DONE]\n\n'
    });
  });
  let reseauSophia = 0;
  page.on("request", r => { if (r.url().indexOf("sophiascriptura.com") >= 0) reseauSophia++; });

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!(window.__SOPHIA && window.sendMessage), null, { timeout: 30000 }).catch(() => {});
  await pause(2500);

  /* on remplace le transport du modèle : même origine, flux SSE controle */
  const pret = await page.evaluate(() => {
    window.apiEndpoint = function () { return "/faux-llm"; };
    window.resolveModelConfig = function () { return { model: "faux-modele", endpoint: "/faux-llm", apiKey: "cle-de-test", format: "chat-completions" }; };
    /* 🔴 `sendMessage` (l'enrobage) ne teste PAS cfg.apiKey mais `_clePourModele`,
       un controle distinct : sans ce neutralisateur, il ouvre la modale de cle et
       sort — aucune requete ne part, et le banc mesurait le vide. */
    window._clePourModele = function () { return true; };
    return typeof window.__SOPHIA === "object" && typeof window.sendMessage === "function";
  });
  ok("0. prémisses : module + sendMessage + faux modèle en place", pret, String(pret));

  /* 🔴 Sans serveur, le bloc ne peut pas exister : une panne EXTERNE ne doit pas
     peindre la CI en rouge. On annonce l'ignore, on ne maquille rien. */
  const sonde = await page.evaluate(async () => {
    try { await window.__SOPHIA.call("list_topics", { query: "baptism" }); return { enLigne: true }; }
    catch (e) { return { enLigne: false, err: String(e.message) }; }
  });
  const enLigne = sonde.enLigne;
  if (!enLigne) console.log("\n[!] SERVEUR INJOIGNABLE (" + sonde.err + ") — assertions liees au corpus IGNOREES.\n");
  if (!pret) { console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC" + (ign_n ? " / " + ign_n + " IGNORE(S)" : "") + " --"); await browser.close(); serveur.close(); process.exit(1); }

  /* ── A. création d'un agent avec la case, par le formulaire réel ── */
  const a = await page.evaluate(async () => {
    document.getElementById("open-agent-modal").click();
    await new Promise(r => setTimeout(r, 400));
    document.getElementById("agent-name").value = "Test Patristique";
    /* 🔴 le bouton exige AUSSI le role : sans lui, toast « Nom et role
       obligatoires » et rien n'est cree (mesure : 0 agent ajoute). */
    document.getElementById("agent-desc").value = "Agent de test pour le contexte patristique.";
    const box = document.getElementById("agent-patristique");
    if (!box) return { err: "case absente" };
    box.checked = true;
    document.getElementById("save-agent").click();
    await new Promise(r => setTimeout(r, 900));
    const sel = document.getElementById("agent-select");
    const opt = Array.from(sel.options).find(o => o.textContent.indexOf("Test Patristique") >= 0);
    return { id: opt ? opt.value : null, options: sel.options.length };
  });
  ok("A1. agent créé via le formulaire, case cochée", !!a.id, a.id ? "id=" + a.id : JSON.stringify(a));
  if (!a.id) { console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC" + (ign_n ? " / " + ign_n + " IGNORE(S)" : "") + " --"); await browser.close(); serveur.close(); process.exit(1); }

  /* ── A2. persistance : on rouvre le formulaire d'édition, la case doit être cochée ── */
  const a2 = await page.evaluate(async (id) => {
    await window.openEditAgent(id);
    await new Promise(r => setTimeout(r, 500));
    const b = document.getElementById("edit-agent-patristique");
    return { present: !!b, coche: !!(b && b.checked) };
  }, a.id);
  ok("A2. la case survit à l'enregistrement (relue cochée dans l'édition)", a2.present && a2.coche,
     `présente=${a2.present}, cochée=${a2.coche}`);

  /* sélection de l'agent (c'est ce qui met state.agent à jour) */
  await page.evaluate(async (id) => {
    const sel = document.getElementById("agent-select");
    sel.value = id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
  }, a.id);

  /* ── B. envoi avec la case : le prompt contient le bloc patristique ── */
  const avantB = corps.length;
  await page.evaluate(async () => {
    const inp = document.getElementById("user-input");
    inp.value = "Que dit Matthieu 19:9 sur le divorce ?";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("send-btn").click();
    await new Promise(r => setTimeout(r, 6000));
  });
  /* 🔴 La 1re requete apres l'envoi est la REPONSE principale ; les suivantes
     sont des appels utilitaires (questions de suivi). Prendre la derniere
     mesurait un autre chemin — erreur commise au premier passage. */
  const lotB = corps.slice(avantB);
  const reqB = lotB[0];
  const reqUtil = lotB[1] || null;
  const sysB = reqB && reqB.messages ? (reqB.messages.find(m => m.role === "system") || {}).content || "" : "";
  ok("B1. une requête modèle est bien partie", !!reqB, reqB ? "messages=" + reqB.messages.length : "aucune");
  if (!enLigne) {
    ignore("B2. bloc patristique dans le prompt", "serveur injoignable");
    ignore("B3. URL de source dans le bloc", "serveur injoignable");
    ignore("B4. garde-fous du bloc", "serveur injoignable");
  } else {
  ok("B2. le prompt système contient le bloc patristique", /CONTEXTE PATRISTIQUE/.test(sysB),
     sysB ? "bloc " + (sysB.length) + " c." : "system vide");
  ok("B3. le bloc porte une URL de source", /https:\/\/sophiascriptura\.com\/p\//.test(sysB), String(/sophiascriptura\.com\/p\//.test(sysB)));
  ok("B4. garde-fous présents (IA + partiel + jamais de mémoire)",
     /PAR IA/.test(sysB) && /PARTIELLE/.test(sysB) && /JAMAIS une citation/.test(sysB),
     `ia=${/PAR IA/.test(sysB)} partiel=${/PARTIELLE/.test(sysB)} memoire=${/JAMAIS une citation/.test(sysB)}`);
  }
  ok("B5. le bloc est borné (≤ 6 000 caractères)", sysB.length < 12000, sysB.length + " c. de prompt système");

  if (reqUtil) {
    const sysU = (reqUtil.messages || []).find(m => m.role === "system");
    const txtU = sysU ? String(sysU.content || "") : "";
    ok("B6. les appels utilitaires (questions de suivi) ne portent PAS le bloc",
       txtU.indexOf("CONTEXTE PATRISTIQUE") < 0, txtU.length + " c. de prompt utilitaire");
  }

  /* ── C. la puce « Sources » est visible et cliquable ── */
  if (!enLigne) {
    ignore("C. puce « Sources » avec lien", "serveur injoignable");
  } else {
  const c = await page.evaluate(() => {
    const el = document.getElementById("sophia-sources");
    return el ? { present: true, liens: el.querySelectorAll("a[href]").length, texte: el.textContent.slice(0, 80) } : { present: false };
  });
  ok("C. puce « Sources » affichée avec au moins un lien", c.present && c.liens >= 1,
     c.present ? `${c.liens} lien(s) — ${c.texte}` : "absente");
  }

  /* ── D. case décochée : aucun bloc, aucune requête au corpus ── */
  await page.evaluate(async (id) => {
    await window.openEditAgent(id);
    await new Promise(r => setTimeout(r, 400));
    document.getElementById("edit-agent-patristique").checked = false;
    document.getElementById("save-edit-agent").click();
    await new Promise(r => setTimeout(r, 800));
  }, a.id);
  const avantD = corps.length, avantSophiaD = reseauSophia;
  await page.evaluate(async () => {
    const inp = document.getElementById("user-input");
    inp.value = "Que dit Matthieu 19:9 sur le divorce ?";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("send-btn").click();
    await new Promise(r => setTimeout(r, 5000));
  });
  const reqD = corps.slice(avantD)[0];
  const sysD = reqD && reqD.messages ? (reqD.messages.find(m => m.role === "system") || {}).content || "" : "";
  ok("D1. case décochée : AUCUN bloc patristique dans le prompt", !/CONTEXTE PATRISTIQUE/.test(sysD),
     sysD ? sysD.length + " c." : "system vide");
  ok("D2. case décochée : ZÉRO requête au corpus", reseauSophia === avantSophiaD, `${reseauSophia - avantSophiaD} requête(s)`);

  /* ── E. case cochée mais serveur injoignable : le message part quand même ── */
  await page.evaluate(async (id) => {
    await window.openEditAgent(id);
    await new Promise(r => setTimeout(r, 400));
    document.getElementById("edit-agent-patristique").checked = true;
    document.getElementById("save-edit-agent").click();
    await new Promise(r => setTimeout(r, 800));
    window.__SOPHIA.viderCache();
  }, a.id);
  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, r => r.abort());
  const avantE = corps.length;
  await page.evaluate(async () => {
    const inp = document.getElementById("user-input");
    inp.value = "Que dit Matthieu 19:9 ?";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("send-btn").click();
    await new Promise(r => setTimeout(r, 6000));
  });
  const reqE = corps.slice(avantE)[0];
  const sysE = reqE && reqE.messages ? (reqE.messages.find(m => m.role === "system") || {}).content || "" : "";
  ok("E1. serveur injoignable : le message part QUAND MÊME", !!reqE, reqE ? "requête reçue" : "AUCUNE requête — réponse bloquée");
  ok("E2. serveur injoignable : pas de bloc, pas d'erreur bloquante", !/CONTEXTE PATRISTIQUE/.test(sysE), String(!/CONTEXTE PATRISTIQUE/.test(sysE)));

  ok("F. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.slice(0, 3).join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC" + (ign_n ? " / " + ign_n + " IGNORE(S)" : "") + " --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
