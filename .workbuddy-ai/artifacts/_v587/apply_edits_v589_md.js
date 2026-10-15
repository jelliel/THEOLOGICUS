/* v589 — EXPORT DES AGENTS EN MARKDOWN (.md)
   Demande : « donne moi aussi de pouvoir exporter les Agents en .md ».
   Ajouts :
   - générateurs Markdown (agentMd / agentsMd) exposés par le module v583 ;
   - export .md PAR AGENT (bouton 📄 dans la liste) et TOUT (.MD) ;
   - bouton .md dans le panneau des 20 agents théologiques 🎓 ;
   - les presets passent désormais par l'écriture ROBUSTE (v588) : leur
     téléchargement direct échouait en silence dans la WebView, comme l'export
     d'agent corrigé juste avant ;
   - libellés du modal généralisés (« Copier le contenu », plus « le JSON »),
     puisque le modal sert maintenant les deux formats.
   Méthode : module v583 isolé par TRANCHES, ancres uniques, remplacement par
   FONCTION, module normalisé en LF. */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "..", "..", "THEOLOGICUS.html");
let html = fs.readFileSync(F, "utf8");

const DEB = '<script id="v583-agents-io">';
const start = html.indexOf(DEB);
if (start < 0) { console.error("module v583 introuvable"); process.exit(1); }
const finTag = html.indexOf("</script>", start);
const fin = finTag + "</script>".length;
let mod = html.slice(start, fin).replace(/\r\n/g, "\n");

function rempl(ancre, remplacement, etiquette) {
  const n = mod.split(ancre).length - 1;
  if (n !== 1) { console.error("ANCRE NON UNIQUE (" + n + ") : " + etiquette); process.exit(1); }
  mod = mod.replace(ancre, () => remplacement);
  console.log("  ok  " + etiquette);
}

/* ── 0. en-tête du module ── */
rempl(
  '   télécharge pas les blob URL : chaque export ouvre donc AUSSI une\n' +
  '   fenêtre avec le JSON copiable.',
  '   télécharge pas les blob URL : chaque export ÉCRIT donc côté serveur\n' +
  '   (/save-data → backups/) ET ouvre une fenêtre au contenu copiable.\n' +
  '   Formats : JSON (réimportable) et MARKDOWN (lecture et partage).',
  "en-tete"
);

/* ── 1. libellés du modal : le modal sert aussi le Markdown ── */
rempl(
  '📋 Copier le JSON</button>',
  '📋 Copier le contenu</button>',
  "libelle-copier"
);
rempl(
  'toast(fait ? "📋 JSON copié — collez-le dans un fichier ou une note" : "Copie impossible — sélectionnez le texte manuellement", fait ? "success" : "warn");',
  'toast(fait ? "📋 Contenu copié — collez-le dans un fichier ou une note" : "Copie impossible — sélectionnez le texte manuellement", fait ? "success" : "warn");',
  "toast-copier"
);
rempl(
  '« Ouvrir le dossier » le montre. Sur Android, utilisez « Copier le JSON ».";',
  '« Ouvrir le dossier » le montre. Sur Android, utilisez « Copier le contenu ».";',
  "info-copier"
);

/* ── 2. générateurs Markdown + nom de fichier assaini ── */
rempl(
  '  /* ── export TOUT ── */',
  [
    '  /* ── nom de fichier sûr (les noms d’agents peuvent contenir : * ? etc.) ── */',
    '  function nomAgentFichier(nom, ext) {',
    '    const s = String(nom || "agent").replace(/[\\\\/:*?"<>|\\s]+/g, "-").replace(/^-+|-+$/g, "");',
    '    return "agent-" + (s || "agent") + "." + ext;',
    '  }',
    '',
    '  /* ── export MARKDOWN : document de LECTURE et de PARTAGE ────────────',
    '     Le .md n’est pas réimportable (l’import attend du JSON) — c’est dit',
    '     dans le document lui-même, pour ne pas créer d’attente fausse. */',
    '  function mdNet(s) { return String(s == null ? "" : s).replace(/\\r\\n/g, "\\n").trim(); }',
    '  function mdLigne(s) { return mdNet(s).replace(/\\s*\\n+\\s*/g, " "); }',
    '  function agentMd(ag, niv, source) {',
    '    const H = new Array(Math.max(1, niv || 1) + 1).join("#");',
    '    const h = new Array(Math.max(2, (niv || 1) + 1) + 1).join("#");',
    '    const l = [];',
    '    l.push(H + " " + mdLigne(ag.name || "Agent"));',
    '    l.push("");',
    '    if (mdLigne(ag.desc)) l.push("> " + mdLigne(ag.desc));',
    '    l.push("");',
    '    const meta = [];',
    '    meta.push(["Source", source || ag.source || "agent personnel"]);',
    '    if (ag.modelPref) meta.push(["Modèle préféré", ag.modelPref]);',
    '    if (ag.temperature != null) meta.push(["Température", ag.temperature]);',
    '    if (ag.maxTokens != null) meta.push(["Tokens max", ag.maxTokens]);',
    '    if (mdLigne(ag.style)) meta.push(["Style", mdLigne(ag.style)]);',
    '    if (ag.memPrio != null) meta.push(["Priorité mémoire", ag.memPrio]);',
    '    if (ag.tags && ag.tags.length) meta.push(["Étiquettes", ag.tags.join(", ")]);',
    '    meta.forEach(function (kv) { l.push("- **" + kv[0] + "** : " + kv[1]); });',
    '    l.push("");',
    '    if (mdNet(ag.instructions)) { l.push(h + " Instructions"); l.push(""); l.push(mdNet(ag.instructions)); l.push(""); }',
    '    if (mdNet(ag.primer)) { l.push(h + " Amorces"); l.push(""); l.push(mdNet(ag.primer)); l.push(""); }',
    '    if (mdNet(ag.forbidden)) { l.push(h + " Termes interdits"); l.push(""); l.push(mdNet(ag.forbidden)); l.push(""); }',
    '    return l.join("\\n");',
    '  }',
    '  function agentsMd(liste, titre) {',
    '    const l = [];',
    '    l.push("# " + (titre || "Agents THEOLOGICUS"));',
    '    l.push("");',
    '    l.push("- **Agents** : " + liste.length);',
    '    l.push("- **Exporté le** : " + new Date().toLocaleString("fr-FR"));',
    '    l.push("- **Format** : Markdown — document de LECTURE. Pour réimporter dans THEOLOGICUS, utilisez l’export JSON.");',
    '    l.push("");',
    '    l.push("## Sommaire");',
    '    l.push("");',
    '    liste.forEach(function (a, i) { l.push((i + 1) + ". " + mdLigne(a.name || "Agent")); });',
    '    l.push("");',
    '    liste.forEach(function (a) { l.push("---"); l.push(""); l.push(agentMd(a, 2)); });',
    '    return l.join("\\n") + "\\n";',
    '  }',
    '',
    '  /* ── export TOUT ── */'
  ].join("\n"),
  "generateurs-md"
);

/* ── 3. nom de fichier du JSON via le même assainisseur ── */
rempl(
  '      const fich = "agent-" + String(ag.name || "agent").replace(/\\s+/g, "-") + ".json";',
  '      const fich = nomAgentFichier(ag.name, "json");',
  "nom-fichier-json"
);

/* ── 4. export Markdown : agent seul + tout ── */
rempl(
  '  /* ── import : agent seul OU tableau (export « tout ») ── */',
  [
    '  /* ── export MARKDOWN individuel ── */',
    '  async function exportAgentMd(id) {',
    '    try {',
    '      const ag = await db.get("agents", id);',
    '      if (!ag) { toast("Agent introuvable", "warn"); return; }',
    '      const texte = agentMd(ag, 1);',
    '      const fich = nomAgentFichier(ag.name, "md");',
    '      const r = await enregistrer(fich, texte);',
    '      fenetreJson("📄 Export Markdown — " + ag.name, texte, fich);',
    '      const a = annoncer(r, fich);',
    '      toast(r.ok ? a.m : "Agent « " + ag.name + " » prêt — " + a.m, a.k);',
    '    } catch (e) { toast("Erreur export Markdown : " + String(e && e.message || e), "error"); }',
    '  }',
    '  window.exportAgentMd = exportAgentMd;',
    '',
    '  /* ── export MARKDOWN de TOUS les agents (un seul document) ── */',
    '  async function exportToutMd() {',
    '    try {',
    '      const all = (await db.getAll("agents")) || [];',
    '      if (!all.length) { toast("Aucun agent utilisateur à exporter (les 20 agents théologiques 🎓 ont leur propre bouton d’export).", "warn"); return; }',
    '      all.sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || "")); });',
    '      const texte = agentsMd(all, "Mes agents THEOLOGICUS (" + all.length + ")");',
    '      const d = new Date();',
    '      const fich = "agents-theologicus-" + d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + ".md";',
    '      const r = await enregistrer(fich, texte);',
    '      fenetreJson("📄 Export Markdown — " + all.length + " agents", texte, fich);',
    '      const a = annoncer(r, fich);',
    '      toast(r.ok ? a.m + " (" + all.length + " agents)" : a.m, a.k);',
    '    } catch (e) { toast("Export Markdown impossible : " + String(e && e.message || e), "error"); }',
    '  }',
    '',
    '  /* ── import : agent seul OU tableau (export « tout ») ── */'
  ].join("\n"),
  "export-md"
);

/* ── 5. bouton EXPORTER TOUT (.MD) — création INDÉPENDANTE du bouton JSON ── */
rempl(
  '  function installerBouton() {\n' +
  '    const ancre = document.getElementById("import-agent-btn");\n' +
  '    if (!ancre || document.getElementById("export-all-agents-btn")) return;\n' +
  '    const b = document.createElement("button");\n' +
  '    b.type = "button";\n' +
  '    b.className = ancre.className || "btn-ghost";\n' +
  '    b.id = "export-all-agents-btn";\n' +
  '    b.style.cssText = "font-size:10px;padding:5px 10px";\n' +
  '    b.textContent = "⬇⬇ EXPORTER TOUT (JSON)";\n' +
  '    b.title = "Exporter TOUS vos agents en un seul fichier JSON (ou copiable)";\n' +
  '    b.addEventListener("click", exportTout);\n' +
  '    ancre.parentNode.insertBefore(b, ancre.nextSibling);\n' +
  '    rebindImport();\n' +
  '  }',
  [
    '  function installerBouton() {',
    '    const ancre = document.getElementById("import-agent-btn");',
    '    if (!ancre) return;',
    '    /* les deux boutons sont créés INDÉPENDAMMENT : une version antérieure',
    '       n’ayant que le JSON ne doit pas empêcher l’apparition du .md */',
    '    let b = document.getElementById("export-all-agents-btn");',
    '    if (!b) {',
    '      b = document.createElement("button");',
    '      b.type = "button";',
    '      b.className = ancre.className || "btn-ghost";',
    '      b.id = "export-all-agents-btn";',
    '      b.style.cssText = "font-size:10px;padding:5px 10px";',
    '      b.textContent = "⬇⬇ EXPORTER TOUT (JSON)";',
    '      b.title = "Exporter TOUS vos agents en un seul fichier JSON (ou copiable)";',
    '      b.addEventListener("click", exportTout);',
    '      ancre.parentNode.insertBefore(b, ancre.nextSibling);',
    '    }',
    '    let b2 = document.getElementById("export-all-agents-md-btn");',
    '    if (!b2) {',
    '      b2 = document.createElement("button");',
    '      b2.type = "button";',
    '      b2.className = ancre.className || "btn-ghost";',
    '      b2.id = "export-all-agents-md-btn";',
    '      b2.style.cssText = "font-size:10px;padding:5px 10px";',
    '      b2.textContent = "⬇⬇ EXPORTER TOUT (.MD)";',
    '      b2.title = "Exporter TOUS vos agents en un document Markdown lisible (lecture et partage)";',
    '      b2.addEventListener("click", exportToutMd);',
    '      b.parentNode.insertBefore(b2, b.nextSibling);',
    '    }',
    '    rebindImport();',
    '  }'
  ].join("\n"),
  "bouton-md"
);

/* ── 6. API publique élargie (le panneau des presets s'en sert) ── */
rempl(
  '  window.__v583AgentsIo = { exportTout: exportTout };',
  '  window.__v583AgentsIo = { exportTout: exportTout, exportToutMd: exportToutMd, exportAgentMd: exportAgentMd,\n' +
  '    agentMd: agentMd, agentsMd: agentsMd, enregistrer: enregistrer, annoncer: annoncer, nomAgentFichier: nomAgentFichier };',
  "api"
);

/* ── reinjection par TRANCHES + CRLF ── */
const nouveau = html.slice(0, start) + mod + html.slice(fin);
if (nouveau.indexOf("</body>") < 0) { console.error("</body> disparu"); process.exit(1); }
const crlf = nouveau.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
fs.writeFileSync(F, crlf, "utf8");
const i2 = crlf.indexOf(DEB), f2 = crlf.indexOf("</script>", i2);
fs.writeFileSync(path.join(__dirname, "module_v583_v589.js"), crlf.slice(i2 + DEB.length, f2), "utf8");
console.log("\nmodule v583 (v589) reinjecte");
