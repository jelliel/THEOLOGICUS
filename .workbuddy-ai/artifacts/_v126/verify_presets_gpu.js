// Banc v129 — PRÉRÉGLAGES DE PERFORMANCE + DIAGNOSTIC GPU.
//
// Ce que ce banc doit établir :
//   1. le bloc est monté dans les DEUX hôtes (menu « Plus » et panneau
//      « Personnaliser l'interface »), et il REMPLACE les interrupteurs bruts
//      de la v35/v39 au lieu de s'ajouter à eux (sinon deux commandes pour un
//      même réglage) ;
//   2. chaque préréglage pose exactement les leviers annoncés ;
//   3. l'image de fond est ÉTEINTE par FLUIDE puis RESTAURÉE par les autres —
//      c'est le seul levier destructeur, il est donc vérifié dans les deux sens ;
//   4. QUALITÉ anime réellement TOUS les messages, ÉQUILIBRÉ seulement le
//      dernier : mesuré par animationName sur un message qui n'est pas le
//      dernier, pas déduit du code ;
//   5. un changement manuel fait retomber l'état sur « personnalise » ;
//   6. l'état survit à un rechargement ;
//   7. la fiche GPU lit un moteur de rendu réel et rend un verdict.
//
// Contrôle négatif : BENCH_ROOT pointé sur la copie d'avant la v129 doit
// échouer sur l'essentiel. Un banc sans contrôle négatif ne prouve rien.
// La copie n'est pas versionnée (1,9 Mo) — la régénérer ainsi :
//   mkdir -p .workbuddy-ai/artifacts/_v126/_presets_bench/avant
//   git show <commit d'avant la v129>:THEOLOGICUS.html \
//     > .workbuddy-ai/artifacts/_v126/_presets_bench/avant/THEOLOGICUS.html
// Mesuré : 45/45 sur le dépôt, 9/43 sur la copie.
//
// Usage : node verify_presets_gpu.js [--port 8830]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8830;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

const CHAT = "bench-presets";

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}
function titre(t) { console.log("\n" + t); }

function messages() {
  const out = [];
  const base = 1790800000000;
  for (let i = 0; i < 3; i++) {
    out.push({ role: "user", content: `Question ${i + 1} sur la justification.`, ts: base + i * 2000 });
    out.push({
      role: "assistant", ts: base + i * 2000 + 900, annotations: [], marks: [],
      content: `### Réponse ${i + 1}\n\nLa justification est **déclarative** et non infuse.\n\n1. Premier point.\n2. Second point.\n`,
    });
  }
  return out;
}

async function etat(page) {
  return page.evaluate(() => ({
    fxKey: localStorage.getItem("theologicus-reduce-fx"),
    fxCls: document.documentElement.classList.contains("v35-reduce-fx"),
    animKey: localStorage.getItem("theologicus-anim-toutes"),
    animCls: document.documentElement.classList.contains("v129-anim-toutes"),
    bgKey: localStorage.getItem("theologicus-bg-enabled"),
    bgAv: localStorage.getItem("theologicus-bg-enabled.avant-preset"),
    bgVisible: !!document.querySelector("#custom-bg-layer.visible"),
    preset: localStorage.getItem("theologicus-preset"),
    courant: window.__V129 ? window.__V129.courant() : null,
  }));
}

async function cliquer(page, id) {
  return page.evaluate((id) => {
    const b = document.querySelector('.v129-preset[data-preset="' + id + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, id);
}

// Animation du PREMIER message (donc pas celui qui vient d'être ajouté).
async function animPremier(page) {
  return page.evaluate(() => {
    const ms = document.querySelectorAll("#chat-container .message");
    if (ms.length < 2) return { n: ms.length, nom: null };
    return { n: ms.length, nom: getComputedStyle(ms[0]).animationName };
  });
}

async function main() {
  console.log("=".repeat(74));
  console.log("BANC v129 — PRÉRÉGLAGES DE PERFORMANCE ET DIAGNOSTIC GPU");
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

  // ATTENTION À LA FORME. La conversation stockée n'est pas un tableau de
  // messages mais un OBJET {id, model, messages, title, updated, fav}. Semer un
  // tableau nu ne lève rien et ne dessine rien : 0 message, sans erreur.
  const env = {
    chat: JSON.stringify({
      id: CHAT, model: "mistral", messages: messages(),
      title: "Banc v129", updated: 1, fav: false,
    }),
  };
  await ctx.addInitScript((e) => {
    try { document.cookie = "key_mistral=sk-test-presets; path=/"; } catch (x) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (x) {}
    try {
      if (!localStorage.getItem("__bench_presets_seeded")) {
        localStorage.setItem("theologicus_chat_" + "bench-presets", e.chat);
        localStorage.setItem("theologicus_currentChatId", "bench-presets");
        localStorage.setItem("__bench_presets_seeded", "1");
      }
    } catch (x) {}
  }, env);

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
      { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    });
    await page.addStyleTag({ content: "#setup-wizard-overlay{display:none !important}" });
    // Le semis localStorage ne suffit pas : la conversation ne se dessine qu'en
    // passant par loadArchiveChat (vérifié : loadChat seul laisse 0 message).
    await page.evaluate((id) => { window.loadArchiveChat(id, -1); }, CHAT);
    await page.waitForFunction(() => document.querySelectorAll("#chat-container .message").length >= 2,
      null, { timeout: 60000 });
    // Non fatal : sur la copie d'avant la v129, __V129 n'existe pas. On veut
    // que le controle negatif produise une LISTE d'echecs lisible, pas une
    // exception qui interrompt le banc.
    try {
      await page.waitForFunction(() => window.__V129 && window.__V129.courant, null, { timeout: 30000 });
    } catch (e) {
      console.log("  [!] window.__V129 absent — copie sans la v129 ?");
    }
    await page.waitForTimeout(1500);

    // ── 1. Montage ────────────────────────────────────────────────────
    titre("1. MONTAGE");
    const montage = await page.evaluate(() => {
      const menu = document.getElementById("v6-more-menu");
      const panneau = document.getElementById("v129-panneau");
      const boutons = (n) => n ? n.querySelectorAll(".v129-preset").length : 0;
      const labels = menu ? Array.from(menu.querySelectorAll(".mm-label")).map(l => l.textContent) : [];
      return {
        menuPresets: boutons(menu),
        panneauPresent: !!panneau,
        panneauPresets: boutons(panneau),
        carteMenu: !!(menu && menu.querySelector(".v129-gpu")),
        cartePanneau: !!(panneau && panneau.querySelector(".v129-gpu")),
        v39: !!document.getElementById("v39-fx-toggle"),
        v35: !!document.getElementById("v35-reduce-fx-toggle"),
        labels: labels,
        nbPerformance: labels.filter(t => /performance/i.test(t)).length,
        dansMenuPlus: !!(menu && panneau && panneau.parentNode && panneau.parentNode.contains(menu)),
      };
    });
    ok("le menu « Plus » porte les 4 préréglages", montage.menuPresets === 4, montage.menuPresets);
    ok("le panneau « Personnaliser » est monté", montage.panneauPresent);
    ok("le panneau porte les 4 préréglages", montage.panneauPresets === 4, montage.panneauPresets);
    ok("fiche GPU dans le menu", montage.carteMenu);
    ok("fiche GPU dans le panneau", montage.cartePanneau);
    ok("l'interrupteur brut v39 a été retiré", !montage.v39);
    ok("la case brute v35 a été retirée", !montage.v35);
    ok("une seule étiquette « Performance »", montage.nbPerformance === 1, montage.labels.join(" | "));

    // ── 2. FLUIDE ─────────────────────────────────────────────────────
    titre("2. PRÉRÉGLAGE FLUIDE");
    // On part d'un fond explicitement ACTIVÉ pour vérifier qu'il est bien coupé
    // puis restauré.
    await page.evaluate(() => { localStorage.setItem("theologicus-bg-enabled", "1"); });
    ok("clic sur FLUIDE", await cliquer(page, "fluide"));
    await page.waitForTimeout(400);
    let e = await etat(page);
    ok("mode performances actif (clé)", e.fxKey === "1", e.fxKey);
    ok("mode performances actif (classe html)", e.fxCls);
    ok("animations désactivées", e.animKey !== "1" && !e.animCls);
    ok("image de fond coupée", e.bgKey === "0", e.bgKey);
    ok("ancienne valeur du fond mémorisée", e.bgAv === "1", e.bgAv);
    ok("calque de fond masqué", !e.bgVisible);
    ok("préréglage retenu = fluide", e.courant === "fluide", e.courant);

    // ── 3. QUALITÉ ────────────────────────────────────────────────────
    titre("3. PRÉRÉGLAGE QUALITÉ");
    ok("clic sur QUALITE", await cliquer(page, "qualite"));
    await page.waitForTimeout(500);
    e = await etat(page);
    ok("mode performances inactif", e.fxKey === "0" && !e.fxCls, e.fxKey);
    ok("animations de tous les messages actives", e.animKey === "1" && e.animCls);
    ok("image de fond restaurée", e.bgKey === "1", e.bgKey);
    ok("valeur de fond mémorisée effacée", e.bgAv === null, e.bgAv);
    ok("calque de fond rétabli", e.bgVisible);
    ok("préréglage retenu = qualite", e.courant === "qualite", e.courant);
    const aq = await animPremier(page);
    ok("un message NON dernier est animé", aq.nom && aq.nom !== "none", `${aq.n} messages, animationName=${aq.nom}`);

    // ── 4. ÉQUILIBRÉ ──────────────────────────────────────────────────
    titre("4. PRÉRÉGLAGE ÉQUILIBRÉ");
    ok("clic sur EQUILIBRE", await cliquer(page, "equilibre"));
    await page.waitForTimeout(500);
    e = await etat(page);
    ok("mode performances inactif", e.fxKey === "0" && !e.fxCls, e.fxKey);
    ok("animations de tous les messages coupées", e.animKey !== "1" && !e.animCls);
    ok("image de fond toujours restaurée", e.bgKey === "1", e.bgKey);
    ok("préréglage retenu = equilibre", e.courant === "equilibre", e.courant);
    const ae = await animPremier(page);
    ok("un message NON dernier n'est plus animé", ae.nom === "none", `animationName=${ae.nom}`);

    // ── 5. AUTO ───────────────────────────────────────────────────────
    titre("5. PRÉRÉGLAGE AUTO");
    ok("clic sur AUTO", await cliquer(page, "auto"));
    await page.waitForTimeout(600);
    e = await etat(page);
    ok("AUTO résolu (état cohérent avec la mesure)", e.courant === "auto", e.courant);
    ok("AUTO a bien posé un mode de rendu", e.fxKey === "0" || e.fxKey === "1", e.fxKey);

    // ── 6. Fiche GPU ──────────────────────────────────────────────────
    titre("6. FICHE GPU");
    const gpu = await page.evaluate(() => {
      const t = (s) => { const n = document.querySelector(s); return n ? n.textContent.trim() : null; };
      return {
        moteur: t(".v129-gpu-moteur"),
        rendu: t(".v129-gpu-rendu"),
        webgl: t(".v129-gpu-webgl"),
        webview: t(".v129-gpu-webview"),
        drapeaux: t(".v129-gpu-drapeaux"),
      };
    });
    ok("moteur de rendu lu", gpu.moteur && gpu.moteur !== "…" && gpu.moteur.length > 3, gpu.moteur);
    ok("verdict de rendu rendu",
      /MATERIEL|LOGICIEL|indetermine/.test(gpu.rendu || ""), gpu.rendu);
    ok("version WebGL annoncée", /WebGL/.test(gpu.webgl || ""), gpu.webgl);
    ok("hors application Windows : dit clairement",
      /hors application/.test(gpu.webview || ""), gpu.webview);
    ok("drapeaux annoncés (absents hors application)", gpu.drapeaux === "—", gpu.drapeaux);

    // Exe antérieur à la v129 : le pont existe mais renderer_info() n'existe
    // pas. Annoncer « aucun drapeau » serait faux (on ne SAIT pas), annoncer
    // « hors application » serait faux aussi. On simule ce cas.
    const gpuVieuxExe = await page.evaluate(async () => {
      const vrai = window.pywebview;
      window.pywebview = { api: {} };
      window.__V129.mesurer();
      await new Promise(r => setTimeout(r, 900));
      const t = (s) => { const n = document.querySelector(s); return n ? n.textContent.trim() : null; };
      const out = { webview: t(".v129-gpu-webview"), drapeaux: t(".v129-gpu-drapeaux") };
      window.pywebview = vrai;
      return out;
    });
    ok("exe antérieur : annoncé comme tel",
      /mettre a jour/.test(gpuVieuxExe.webview || ""), gpuVieuxExe.webview);
    ok("exe antérieur : drapeaux inconnus, pas « aucun »",
      gpuVieuxExe.drapeaux === "—", gpuVieuxExe.drapeaux);
    await page.evaluate(() => { window.__V129.mesurer(); });
    await page.waitForTimeout(600);

    // ── 7. Changement manuel ──────────────────────────────────────────
    titre("7. CHANGEMENT MANUEL");
    await page.evaluate(() => { if (window.__V35 && window.__V35.set) window.__V35.set(true); });
    await page.waitForTimeout(300);
    e = await etat(page);
    ok("état retombe sur « personnalise »", e.courant === "personnalise", e.courant);

    // ── 8. Persistance ────────────────────────────────────────────────
    titre("8. PERSISTANCE APRÈS RECHARGEMENT");
    await cliquer(page, "fluide");
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    try {
      await page.waitForFunction(() => window.__V129 && window.__V129.courant, null, { timeout: 30000 });
    } catch (e) {
      console.log("  [!] window.__V129 absent apres rechargement");
    }
    await page.waitForTimeout(1200);
    e = await etat(page);
    ok("préréglage conservé", e.preset === "fluide", e.preset);
    ok("leviers conservés", e.fxKey === "1" && e.bgKey === "0", `fx=${e.fxKey} bg=${e.bgKey}`);
    ok("état toujours reconnu", e.courant === "fluide", e.courant);

    // ── 9. Aucune erreur de page ──────────────────────────────────────
    titre("9. ERREURS DE PAGE");
    ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  } finally {
    await browser.close();
    await new Promise(r => serveur.close(r));
  }

  const echecs = resultats.filter(r => !r[0]);
  console.log("\n" + "=".repeat(74));
  console.log(`RÉSULTAT : ${resultats.length - echecs.length}/${resultats.length}`);
  if (echecs.length) {
    console.log("ÉCHECS :");
    echecs.forEach(r => console.log("  - " + r[1] + (r[2] ? "  -- " + r[2] : "")));
  }
  console.log("=".repeat(74));
  process.exit(echecs.length ? 1 : 0);
}

main().catch(e => { console.error("BANC EN ERREUR :", e); process.exit(2); });
