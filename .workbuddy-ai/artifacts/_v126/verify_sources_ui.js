// Banc v126b — les LIENS DE CLÉS et la GÉNÉRATION VIDÉO PAR IA, dans le navigateur.
//
// Deux demandes de l'utilisateur sont mesurées ici, et aucune n'est supposée :
//
//   (a) chaque champ de clé porte un lien CLIQUABLE vers le bon site. Un lien
//       n'est pas un texte : on vérifie que c'est un <a href> réel, qu'il
//       ouvre un nouvel onglet, et qu'il mène au domaine attendu. Un lien vers
//       le mauvais site ne casse rien visiblement — l'utilisateur crée sa clé
//       ailleurs, la colle, et rien ne marche sans qu'il comprenne pourquoi.
//
//   (b) la section « Génération de vidéos par IA » EXISTE et se remplit. Elle
//       est construite par le service (route /mpt/sources), donc un champ qui
//       n'apparaîtrait pas ne serait pas un oubli d'écran : ce serait une
//       fiche que le service n'a pas envoyée.
//
// Le troisième point est le plus facile à rater : un champ créé HORS de
// `#studio-modal` serait ignoré SANS ERREUR par `studioReglagesPayload`, qui
// ne balaie que cette zone. On vérifie donc l'appartenance, et pas seulement
// l'existence.
//
// Le relais est lancé par le banc lui-même : un processus de fond ne survit
// pas d'un appel à l'autre dans cet environnement.
//
// Usage : node verify_sources_ui.js --port 8765

const path = require("path");
const { spawn } = require("child_process");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;

const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";

const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

// Domaines attendus, par fournisseur. C'est la seule chose qu'on ne peut pas
// déduire du DOM : il faut savoir où chacun délivre réellement ses clés.
const DOMAINES = {
  pexels: "pexels.com",
  pixabay: "pixabay.com",
  coverr: "coverr.co",
  metaso_minimax: "metaso.cn",
  ofox: "ofox.ai",
  loomloom: "shengsuanyun.com",
  volcengine_seedance: "volcengine.com",
  wavespeed: "wavespeed.ai",
  muapi: "muapi.ai",
  openai_image: "openai.com",
};

// Les six fiches attendues, et les réglages que chacune doit exposer. Tirés
// des valeurs par défaut du service, pas inventés ici.
const ATTENDUS = {
  metaso_minimax: ["base_url", "resolution"],
  ofox: ["base_url", "text_to_video_model", "resolution", "provider"],
  loomloom: ["base_url"],
  volcengine_seedance: ["base_url", "model", "resolution"],
  wavespeed: [],
  muapi: ["base_url", "video_endpoint", "resolution"],
};

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}
function section(t) { console.log("\n" + t); }

let relais = null;

async function relaisVit() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`,
      { signal: AbortSignal.timeout(3000) });
    return r.status === 200;
  } catch (e) { return false; }
}

async function assurerRelais() {
  if (await relaisVit()) return true;
  console.log("  … le relais ne répond pas : lancement de proxy_server.py");
  relais = spawn(PY, ["-u", "proxy_server.py"],
    { cwd: RACINE, stdio: "ignore", windowsHide: true });
  // Attente par CONDITION : le démarrage dépend de la machine, un délai fixe
  // marcherait ici et échouerait ailleurs.
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await relaisVit()) return true;
    if (relais.exitCode !== null) {
      console.log(`  [ECHEC] le relais s'est arrêté (code ${relais.exitCode})`);
      return false;
    }
  }
  return false;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v126b — LIENS DE CLÉS ET SOURCES DE VIDÉOS (navigateur)");
  console.log(BASE);
  console.log("=".repeat(72));

  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // `version.txt` est une SONDE : le code demande le fichier et se rabat sur
  // « dev » s'il n'est pas la (statut != 200). Le 404 est donc le
  // fonctionnement normal en développement, pas une erreur. Le laisser dans
  // le banc le ferait échouer en permanence — et un banc qui crie au loup
  // pour rien finit par être désactivé. On ne filtre QUE cette sonde.
  const BRUIT = /version\.txt/;
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => {
    if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text());
  });

  // ── 0. Ouverture ────────────────────────────────────────────────────
  section("0. Préparation");
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((h) => {
    const enc = new TextEncoder().encode("remember:" + h);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("theologicus_remember", JSON.stringify({
        v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok,
      }));
    });
  }, AUTH_HASH);
  // L'assistant de premier lancement se superpose au studio et intercepte les
  // clics : sur un profil neuf il est affiché par défaut. On pose le drapeau
  // que l'application consulte elle-même, au lieu de forcer le DOM — sinon le
  // banc mesurerait un écran qu'aucun utilisateur ne voit.
  await page.evaluate(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const w = document.getElementById("setup-wizard-overlay");
    if (w && w.classList.contains("active")) w.classList.remove("active");
  });
  const ouvre = await page.evaluate(() => typeof window.__studioOpen === "function");
  ok("le STUDIO VIDEO est ouvrable", ouvre);
  if (!ouvre) { await browser.close(); if (relais) relais.kill(); process.exit(2); }
  await page.evaluate(() => window.__studioOpen());

  // L'onglet « Sources de médias » est le seul qui nous intéresse.
  await page.click('#studio-tabs .settings-tab[data-onglet="material"]');
  ok("l'onglet « Sources de médias » répond au clic",
    (await page.evaluate(() => window.__studioOnglet)) === "material",
    await page.evaluate(() => window.__studioOnglet));

  // La liste des sources vient du service : on attend une CONDITION mesurable.
  await page.waitForFunction(
    () => document.querySelectorAll("#stu-ia-liste .fournisseur-ia").length === 6
      && document.getElementById("stu-mat-source").options.length === 11,
    { timeout: 45000 });

  // ── 1. La section IA existe (demande b) ─────────────────────────────
  section("1. La section « Génération de vidéos par IA » est présente");
  const titres = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#studio-panneau-material .section-title"))
      .map(e => e.textContent.trim()));
  ok("le panneau porte les trois sections attendues", titres.length === 3, titres.join(" | "));
  ok("la section IA est titrée et visible",
    titres.some(t => /GÉNÉRATION DE VIDÉOS PAR IA/i.test(t)),
    titres.find(t => /IA/i.test(t)) || "(aucune)");
  const nbCartes = await page.evaluate(() =>
    document.querySelectorAll("#stu-ia-liste .fournisseur-ia").length);
  ok("six fournisseurs IA sont construits", nbCartes === 6, nbCartes);
  const avertissement = await page.evaluate(() => {
    const b = document.querySelector("#studio-panneau-material .info-block");
    return b ? b.textContent : "";
  });
  ok("le panneau dit que ces sources sont PAYANTES",
    /payantes?/i.test(avertissement), avertissement.slice(0, 60));

  // ── 2. Les fiches IA : clé, lien, réglages ──────────────────────────
  section("2. Chaque fournisseur IA : sa clé, son lien, ses réglages");
  for (const [id, champs] of Object.entries(ATTENDUS)) {
    const carte = await page.evaluate((i) => {
      const c = document.getElementById("stu-ia-" + i);
      if (!c) return null;
      const a = c.querySelector("a.cle-lien");
      const inp = c.querySelector('input[type="password"]');
      return {
        id: c.id,
        lien: a ? a.getAttribute("href") : null,
        cible: a ? a.getAttribute("target") : null,
        rel: a ? a.getAttribute("rel") : null,
        texteLien: a ? a.textContent.trim() : null,
        cle: inp ? inp.getAttribute("data-cle") : null,
        typeCle: inp ? inp.type : null,
        // L'appartenance à #studio-modal : hors de cette zone, la valeur ne
        // serait JAMAIS enregistrée, sans la moindre erreur.
        dansModal: !!(c.closest("#studio-modal")),
        dataCles: Array.from(c.querySelectorAll("[data-cle]")).map(e => e.getAttribute("data-cle")),
      };
    }, id);

    ok(`${id} : la fiche existe`, !!carte, carte ? carte.id : "(absente)");
    if (!carte) continue;
    ok(`${id} : un lien d'obtention est affiché`,
      !!carte.lien && /^https?:\/\//.test(carte.lien), carte.lien || "(aucun)");
    const dom = Object.prototype.hasOwnProperty.call(DOMAINES, id) ? DOMAINES[id] : null;
    ok(`${id} : le lien mène au bon site (${dom})`,
      !!carte.lien && !!dom && carte.lien.includes(dom), carte.lien);
    ok(`${id} : le lien ouvre un nouvel onglet`, carte.cible === "_blank", carte.cible);
    ok(`${id} : le lien ne transmet pas de référent`,
      /noopener/.test(carte.rel || "") && /noreferrer/.test(carte.rel || ""), carte.rel);
    ok(`${id} : le lien est libellé (pas une URL brute)`,
      !!carte.texteLien && !/^https?:/.test(carte.texteLien), carte.texteLien);
    ok(`${id} : une clé est saisissable`, !!carte.cle, carte.cle || "(aucune)");
    ok(`${id} : la clé est masquée à la saisie`, carte.typeCle === "password", carte.typeCle);
    // LE point qui casse en silence : un champ hors du modal n'est pas envoyé.
    ok(`${id} : la fiche vit DANS #studio-modal (sinon jamais enregistrée)`,
      carte.dansModal);

    for (const c of champs) {
      const attendu = `${id}_${c}`;
      ok(`${id}.${c} : le réglage « ${attendu} » est présent`,
        carte.dataCles.includes(attendu), carte.dataCles.join(", "));
    }
    const supplementaires = carte.dataCles.filter(
      k => k !== carte.cle && !champs.some(c => k === `${id}_${c}`));
    ok(`${id} : aucun réglage parasite`, supplementaires.length === 0,
      supplementaires.join(", "));
  }

  // ── 3. Les banques gratuites : liens et pastilles ───────────────────
  section("3. Banques de vidéos : liens et pastilles (demande a)");
  const stock = await page.evaluate(() => {
    const p = document.getElementById("studio-panneau-material");
    return Array.from(p.querySelectorAll(".field-group")).slice(0, 3).map(g => {
      const a = g.querySelector("a.cle-lien");
      const pastilles = Array.from(g.querySelectorAll(".cle-pastille")).map(s => s.textContent.trim());
      const inp = g.querySelector("input");
      return {
        lien: a ? a.getAttribute("href") : null,
        cible: a ? a.getAttribute("target") : null,
        rel: a ? a.getAttribute("rel") : null,
        texte: a ? a.textContent.trim() : null,
        pastilles,
        cle: inp ? inp.getAttribute("data-cle") : null,
      };
    });
  });
  const nomsStock = ["pexels", "pixabay", "coverr"];
  ok("trois banques sont affichées", stock.length === 3, stock.length);
  stock.forEach((s, i) => {
    const id = nomsStock[i] || "?";
    ok(`${id} : un lien « Get API Key » est présent`,
      s.texte === "Get API Key", s.texte || "(aucun)");
    ok(`${id} : le lien mène au bon site (${DOMAINES[id]})`,
      !!s.lien && s.lien.includes(DOMAINES[id]), s.lien);
    ok(`${id} : le lien ouvre un nouvel onglet`, s.cible === "_blank", s.cible);
    ok(`${id} : le lien ne transmet pas de référent`,
      /noopener/.test(s.rel || "") && /noreferrer/.test(s.rel || ""), s.rel);
    ok(`${id} : une clé est saisissable`, !!s.cle, s.cle);
  });
  ok("Pexels est marquée « gratuite » et « recommandée »",
    /Free/i.test(stock[0].pastilles.join(" ")) && /Recommand/i.test(stock[0].pastilles.join(" ")),
    stock[0].pastilles.join(" · "));
  ok("Pixabay est marquée comme solution de repli",
    /repli/i.test(stock[1].pastilles.join(" ")), stock[1].pastilles.join(" · "));

  // ── 4. Le menu des sources ──────────────────────────────────────────
  section("4. Le menu « Source de vidéos » groupe les sources");
  const menu = await page.evaluate(() => {
    const s = document.getElementById("stu-mat-source");
    return {
      total: s.options.length,
      groupes: Array.from(s.querySelectorAll("optgroup")).map(g => ({
        label: g.label,
        ids: Array.from(g.querySelectorAll("option")).map(o => o.value),
      })),
      valeur: s.value,
    };
  });
  ok("les 11 sources sont dans le menu", menu.total === 11, menu.total);
  ok("quatre groupes séparent gratuit et payant",
    menu.groupes.length === 4, menu.groupes.map(g => g.label).join(" | "));
  const gStock = (menu.groupes[0] || {}).ids || [];
  ok("les banques gratuites ouvrent le menu",
    gStock.join(",") === "pexels,pixabay,coverr", gStock.join(","));
  ok("la sélection par défaut reste une source gratuite",
    menu.valeur === "pexels" || menu.valeur === "pixabay" || menu.valeur === "coverr",
    menu.valeur);

  // LE POINT QUI RENDAIT LA FONCTION INUTILISABLE : les deux menus partagent
  // la clé `video_source`. S'ils ne proposent pas la MÊME liste, une source
  // réglée ici est introuvable au moment de générer, et la valeur retombe sur
  // Pexels SANS RIEN DIRE — on croit générer chez Metaso, on génère ailleurs.
  const menuGen = await page.evaluate(() => {
    const s = document.getElementById("studio-source");
    if (!s) return null;
    return {
      total: s.options.length,
      ids: Array.from(s.options).map(o => o.value),
    };
  });
  ok("le menu de GÉNÉRATION existe", !!menuGen);
  ok("le menu de GÉNÉRATION propose les 11 sources (pas seulement 3)",
    menuGen && menuGen.total === 11, menuGen ? menuGen.total : "(absent)");
  ok("les deux menus proposent exactement la même liste",
    menuGen && menuGen.ids.join(",") === menu.groupes.flatMap(g => g.ids).join(","),
    menuGen ? menuGen.ids.join(",") : "(absent)");
  // Une valeur enregistrée doit pouvoir « se poser » : si l'option n'existe
  // pas, l'affectation échoue en silence.
  const pose = await page.evaluate(() => {
    const s = document.getElementById("studio-source");
    s.value = "metaso_minimax";
    return s.value;
  });
  ok("une source IA peut être sélectionnée au moment de générer",
    pose === "metaso_minimax", pose);
  // On remet par `evaluate` et non par `selectOption` : le panneau
  // « Génération » est masqué (on est sur l'onglet « Sources »), et un
  // élément masqué n'est pas sélectionnable par Playwright.
  await page.evaluate(() => { document.getElementById("studio-source").value = "pexels"; });

  // La note doit prévenir quand la source choisie facture.
  await page.selectOption("#stu-mat-source", "metaso_minimax");
  const note = await page.evaluate(() => {
    const n = document.getElementById("stu-mat-source-note");
    return { hidden: n.hidden, texte: n.textContent };
  });
  // `studioRemplirSources` écrit la note au moment du remplissage ; le changement
  // de sélection doit donc la raviver via le gestionnaire du menu.
  await page.dispatchEvent("#stu-mat-source", "change");
  const note2 = await page.evaluate(() => {
    const n = document.getElementById("stu-mat-source-note");
    return { hidden: n.hidden, texte: n.textContent };
  });
  ok("choisir une source payante affiche un avertissement",
    !note2.hidden && /factur/i.test(note2.texte),
    note2.hidden ? "(cachée)" : note2.texte.slice(0, 60));

  // ── 5. La valeur saisie part bien dans la charge utile ──────────────
  section("5. Ce qui est saisi est bien collecté");
  const SONDE = "cle-sonde-v126";
  await page.fill("#stu-ia-metaso_minimax-cle", SONDE);
  await page.fill("#stu-ia-ofox-cle", "cle-ofox-sonde");
  await page.selectOption("#stu-mat-source", "pexels");

  // On rejoue EXACTEMENT le balayage de `studioReglagesPayload` : les champs
  // doivent être atteints par ce sélecteur, sinon la valeur est perdue sans
  // message. La fonction elle-même n'est pas exposée ; son sélecteur l'est
  // par le DOM, et c'est ce qui décide réellement de ce qui est envoyé.
  const collecte = await page.evaluate(() => {
    const vals = {};
    document.querySelectorAll("#studio-modal [data-cle]").forEach(el => {
      vals[el.getAttribute("data-cle")] = el.type === "checkbox" ? el.checked : el.value;
    });
    return vals;
  });
  ok("la clé Metaso saisie est collectée",
    collecte.metaso_minimax_api_key === SONDE, collecte.metaso_minimax_api_key);
  ok("la clé OFox saisie est collectée",
    collecte.ofox_api_key === "cle-ofox-sonde", collecte.ofox_api_key);
  ok("le réglage de résolution Metaso est collecté",
    "metaso_minimax_resolution" in collecte, collecte.metaso_minimax_resolution);
  ok("la source choisie est collectée",
    collecte.video_source === "pexels", collecte.video_source);
  ok("la case de correspondance est collectée en booléen",
    typeof collecte.match_materials_to_script === "boolean",
    collecte.match_materials_to_script);
  const nbCles = Object.keys(collecte).length;
  ok("tous les réglages sont collectés (pas seulement une partie)", nbCles >= 15, nbCles);

  // ── 6. La dépense est confirmée avant l'envoi ───────────────────────
  section("6. Confirmation de dépense (source payante)");
  // On intercepte l'envoi : ce banc ne doit JAMAIS déclencher une vraie
  // génération, qui serait facturée pour de bon. Sans cette coupure, le test
  // coûterait de l'argent à chaque exécution.
  await page.route("**/mpt/submit*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { task_id: "banc-v126-fausse-tache" } }),
  }));
  await page.route("**/mpt/poll*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { state: 1, progress: 0, videos: [] } }),
  }));

  await page.click('#studio-tabs .settings-tab[data-onglet="generation"]');
  await page.waitForTimeout(400);
  await page.fill("#studio-subject", "sujet de banc");
  await page.selectOption("#studio-source", "metaso_minimax");

  await page.click("#studio-launch");
  // Condition, pas délai : la confirmation n'apparaît qu'après le contrôle du
  // service, qui est un aller-retour réseau.
  let confirmation = true;
  try {
    await page.waitForFunction(
      () => { const z = document.getElementById("studio-depense"); return z && !z.hidden; },
      { timeout: 20000 });
  } catch (e) { confirmation = false; }
  ok("une source payante arrête le lancement et demande confirmation", confirmation);

  const depense = await page.evaluate(() => {
    const z = document.getElementById("studio-depense");
    return {
      visible: z ? !z.hidden : false,
      resume: (document.getElementById("studio-depense-resume") || {}).textContent || "",
      bouton: (document.getElementById("studio-depense-oui") || {}).textContent || "",
    };
  });
  ok("la confirmation nomme le fournisseur",
    /Metaso/i.test(depense.resume), depense.resume.slice(0, 80));
  ok("la confirmation chiffre les secondes qui seront facturées",
    /Secondes facturées\s*:\s*\d+/.test(depense.resume), depense.resume.slice(0, 140));
  // Le calcul doit être VISIBLE : un total sans formule ne se vérifie pas, et
  // l'app ne peut pas afficher un prix qu'aucun des deux services ne connaît.
  ok("le calcul est montré, pas seulement son résultat",
    /\d+\s*×\s*\d+\s*×\s*\d+\s*=\s*\d+/.test(depense.resume), depense.resume.slice(0, 140));
  ok("le bouton d'acceptation porte le volume facturé",
    /\d+\s*s\s*FACTURÉES/.test(depense.bouton), depense.bouton);

  // ANNULER doit rendre la main, sans rien envoyer.
  await page.click("#studio-depense-non");
  const apresAnnulation = await page.evaluate(() => {
    const z = document.getElementById("studio-depense");
    const f = document.getElementById("studio-form");
    return { depenseCachee: z ? z.hidden : true, formulaireVisible: f ? f.style.display !== "none" : false };
  });
  ok("ANNULER referme la confirmation", apresAnnulation.depenseCachee);
  ok("ANNULER rend le formulaire", apresAnnulation.formulaireVisible);

  // Une source GRATUITE ne doit rien demander : confirmer là où il n'y a rien
  // à payer rendrait la confirmation moins lue le jour où elle compte.
  await page.selectOption("#studio-source", "pexels");
  await page.click("#studio-launch");
  await page.waitForTimeout(2500);
  const gratuit = await page.evaluate(() => {
    const z = document.getElementById("studio-depense");
    return { visible: z ? !z.hidden : false };
  });
  ok("une source gratuite ne demande AUCUNE confirmation", !gratuit.visible);

  // ── 7. Aucune erreur JavaScript ─────────────────────────────────────
  section("7. Propreté");
  ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  if (relais) relais.kill();

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) {
    console.log("\nÉchecs :");
    resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`));
  }
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => {
  console.error("\n[EXCEPTION] " + (e && e.stack || e));
  if (relais) relais.kill();
  process.exit(3);
});
