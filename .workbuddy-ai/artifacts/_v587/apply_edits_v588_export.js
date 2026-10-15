/* v588 — EXPORT D'AGENTS : le fichier est réellement ÉCRIT.
   Cause du symptôme « je ne vois rien dans Téléchargements » : la WebView
   (exe/APK) ne télécharge PAS les blob URL — « <a download> » échoue SANS
   lever d'erreur, et le toast annonçait quand même « dossier Téléchargements ».
   Correctif : écrire d'abord côté SERVEUR LOCAL (/save-data → backups/), qui
   renvoie le CHEMIN réel ; repli téléchargement navigateur seulement s'il n'y
   a pas de serveur (page en file:// dans un vrai navigateur) ; sur natif
   (Android) on ne prétend plus rien et on renvoie vers « Copier le JSON ».
   Ajout d'un bouton « 📂 Ouvrir le dossier » (/reveal-exports).
   Méthode : module isolé par TRANCHES, ancres uniques vérifiées, remplacement
   par FONCTION (jamais "$" interprété), module normalisé en LF pour matcher. */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "..", "..", "THEOLOGICUS.html");
let html = fs.readFileSync(F, "utf8");

const DEB = '<script id="v583-agents-io">';
const start = html.indexOf(DEB);
if (start < 0) { console.error("module v583 introuvable"); process.exit(1); }
const finTag = html.indexOf("</script>", start);
if (finTag < 0) { console.error("fermeture introuvable"); process.exit(1); }
const fin = finTag + "</script>".length;
let mod = html.slice(start, fin).replace(/\r\n/g, "\n");

function rempl(ancre, remplacement, etiquette) {
  const n = mod.split(ancre).length - 1;
  if (n !== 1) { console.error("ANCRE NON UNIQUE (" + n + ") : " + etiquette); process.exit(1); }
  mod = mod.replace(ancre, () => remplacement);
  console.log("  ok  " + etiquette);
}

/* ── 1. bouton « Ouvrir le dossier » dans la fenêtre JSON ── */
rempl(
  '+ \'<div class="cts"><button type="button" id="v583-copier">📋 Copier le JSON</button><button type="button" id="v583-telech">💾 Télécharger le fichier</button></div>\'',
  '+ \'<div class="cts"><button type="button" id="v583-copier">📋 Copier le JSON</button><button type="button" id="v583-telech">💾 Enregistrer le fichier</button><button type="button" id="v583-dossier">📂 Ouvrir le dossier</button></div>\'',
  "bouton-dossier"
);

/* ── 2. handler « Enregistrer » : serveur d'abord, chemin réel affiché ── */
rempl(
  '      ioModal.querySelector("#v583-telech").addEventListener("click", function () {\n' +
  '        try {\n' +
  '          const blob = new Blob([ioModal.querySelector("#v583-json").value], { type: "application/json" });\n' +
  '          const u = URL.createObjectURL(blob);\n' +
  '          const a = document.createElement("a");\n' +
  '          a.href = u; a.download = ioModal.getAttribute("data-fich") || "agents.json";\n' +
  '          document.body.appendChild(a); a.click(); a.remove();\n' +
  '          setTimeout(function () { try { URL.revokeObjectURL(u); } catch (e) {} }, 1000);\n' +
  '          toast("💾 Fichier « " + (ioModal.getAttribute("data-fich") || "agents.json") + " » — sur PC : dossier Téléchargements", "success");\n' +
  '        } catch (e) { toast("Téléchargement indisponible ici — utilisez « Copier le JSON »", "warn"); }\n' +
  '      });',
  [
    '      ioModal.querySelector("#v583-telech").addEventListener("click", async function () {',
    '        const nom = ioModal.getAttribute("data-fich") || "agents.json";',
    '        const info = ioModal.querySelector("#v583-info");',
    '        const r = await enregistrer(nom, ioModal.querySelector("#v583-json").value);',
    '        const a = annoncer(r, nom);',
    '        toast(a.m, a.k);',
    '        if (r.ok && r.chemin) info.textContent = "✅ Enregistré : " + r.chemin;',
    '        else if (r.ok) info.textContent = "✅ Fichier envoyé au dossier Téléchargements.";',
    '      });',
    '      ioModal.querySelector("#v583-dossier").addEventListener("click", async function () {',
    '        try {',
    '          const res = await fetch("/reveal-exports", { method: "POST" });',
    '          const j = await res.json().catch(function () { return {}; });',
    '          if (j && j.ok) toast("📂 Dossier ouvert : " + j.dossier, "success");',
    '          else toast("Dossier indisponible" + (j && j.dossier ? " : " + j.dossier : ""), "warn");',
    '        } catch (e) { toast("Ouverture du dossier indisponible dans ce contexte", "warn"); }',
    '      });'
  ].join("\n"),
  "handler-enregistrer"
);

/* ── 3. texte d'information honnête ── */
rempl(
  '    ioModal.querySelector("#v583-info").textContent = "Fichier : " + (nomFich || "agents.json") + " — sur PC il arrive dans le dossier Téléchargements ; sur Android, utilisez « Copier le JSON » et collez-le dans un fichier ou une note.";',
  '    ioModal.querySelector("#v583-info").textContent = "Fichier : " + (nomFich || "agents.json") + " — sur PC, « Enregistrer le fichier » l’écrit dans le dossier « backups » de THEOLOGICUS (le chemin exact s’affiche ici) ; « Ouvrir le dossier » le montre. Sur Android, utilisez « Copier le JSON ».";',
  "info-honnete"
);

/* ── 4. helpers d'écriture robuste (remplacent le téléchargement aveugle) ── */
rempl(
  '  function telecharger(nomFich, texte) {\n' +
  '    try {\n' +
  '      const blob = new Blob([texte], { type: "application/json" });\n' +
  '      const u = URL.createObjectURL(blob);\n' +
  '      const a = document.createElement("a");\n' +
  '      a.href = u; a.download = nomFich;\n' +
  '      document.body.appendChild(a); a.click(); a.remove();\n' +
  '      setTimeout(function () { try { URL.revokeObjectURL(u); } catch (e) {} }, 1000);\n' +
  '      return true;\n' +
  '    } catch (e) { return false; }\n' +
  '  }',
  [
    '  /* ── écriture ROBUSTE du fichier ──────────────────────────────────',
    '     La WebView (exe/APK) ne télécharge PAS les blob URL : « <a download> »',
    '     ne produit RIEN, sans lever d’erreur — d’où le « je ne vois rien dans',
    '     Téléchargements ». On écrit donc d’abord côté SERVEUR LOCAL, qui renvoie',
    '     le CHEMIN réel (dossier de l’app, sous-dossier backups/). Le repli',
    '     navigateur ne sert qu’à une page ouverte en file:// dans un vrai',
    '     navigateur. Sur natif (Android) on ne prétend plus rien. */',
    '  function b64utf8(s) {',
    '    try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return null; }',
    '  }',
    '  function estNatif() {',
    '    try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }',
    '  }',
    '  async function enregistrer(nomFich, texte) {',
    '    try {',
    '      const d64 = b64utf8(texte);',
    '      if (d64) {',
    '        const res = await fetch("/save-data", {',
    '          method: "POST", headers: { "Content-Type": "application/json" },',
    '          body: JSON.stringify({ filename: nomFich, data64: d64 })',
    '        });',
    '        if (res.ok) {',
    '          const j = await res.json().catch(function () { return {}; });',
    '          if (j && j.path) return { ok: true, mode: "serveur", chemin: j.path };',
    '        }',
    '      }',
    '    } catch (e) {}',
    '    /* repli navigateur : ne fonctionne que dans un VRAI navigateur */',
    '    try {',
    '      const blob = new Blob([texte], { type: "application/json" });',
    '      const u = URL.createObjectURL(blob);',
    '      const a = document.createElement("a");',
    '      a.href = u; a.download = nomFich;',
    '      document.body.appendChild(a); a.click(); a.remove();',
    '      setTimeout(function () { try { URL.revokeObjectURL(u); } catch (e) {} }, 1000);',
    '      return { ok: true, mode: "navigateur" };',
    '    } catch (e) { return { ok: false, mode: "aucun" }; }',
    '  }',
    '  function annoncer(r, nomFich) {',
    '    if (r.mode === "serveur") return { k: "success", m: "💾 Enregistré : " + r.chemin };',
    '    if (r.mode === "navigateur" && !estNatif()) return { k: "success", m: "💾 Fichier « " + nomFich + " » envoyé au dossier Téléchargements" };',
    '    return { k: "warn", m: "Téléchargement indisponible ici — utilisez « Copier le JSON »" };',
    '  }'
  ].join("\n"),
  "helpers-ecriture"
);

/* ── 5. export TOUT : attendre le résultat et annoncer le vrai chemin ── */
rempl(
  '      const texte = JSON.stringify(all, null, 2);\n' +
  '      const fich = nomFichier();\n' +
  '      telecharger(fich, texte);\n' +
  '      fenetreJson("📤 Export JSON — " + all.length + " agents", texte, fich);\n' +
  '      toast("⬇ " + all.length + " agents exportés — fichier « " + fich + " »", "success");',
  '      const texte = JSON.stringify(all, null, 2);\n' +
  '      const fich = nomFichier();\n' +
  '      const r = await enregistrer(fich, texte);\n' +
  '      fenetreJson("📤 Export JSON — " + all.length + " agents", texte, fich);\n' +
  '      const a = annoncer(r, fich);\n' +
  '      toast(r.ok ? a.m + " (" + all.length + " agents)" : a.m, a.k);',
  "exportTout"
);

/* ── 6. export individuel : idem ── */
rempl(
  '      const texte = JSON.stringify(ag, null, 2);\n' +
  '      const fich = "agent-" + String(ag.name || "agent").replace(/\\s+/g, "-") + ".json";\n' +
  '      telecharger(fich, texte);\n' +
  '      fenetreJson("📤 Export — " + ag.name, texte, fich);\n' +
  '      toast("⬇ Agent « " + ag.name + " » exporté", "success");',
  '      const texte = JSON.stringify(ag, null, 2);\n' +
  '      const fich = "agent-" + String(ag.name || "agent").replace(/\\s+/g, "-") + ".json";\n' +
  '      const r = await enregistrer(fich, texte);\n' +
  '      fenetreJson("📤 Export — " + ag.name, texte, fich);\n' +
  '      const a = annoncer(r, fich);\n' +
  '      toast(r.ok ? a.m : "Agent « " + ag.name + " » prêt — " + a.m, a.k);',
  "exportAgent"
);

/* ── reinjection par TRANCHES + CRLF ── */
const nouveau = html.slice(0, start) + mod + html.slice(fin);
if (nouveau.indexOf("</body>") < 0) { console.error("</body> disparu"); process.exit(1); }
const crlf = nouveau.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
fs.writeFileSync(F, crlf, "utf8");

const i2 = crlf.indexOf(DEB), f2 = crlf.indexOf("</script>", i2);
fs.writeFileSync(path.join(__dirname, "module_v583_apres.js"), crlf.slice(i2 + DEB.length, f2), "utf8");
console.log("\nmodule v583 reinjecte");
