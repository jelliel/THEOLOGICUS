
/* ═══════════════════════════════════════════════════════════════════
   v583 — AGENTS : export/import ROBUSTES. La WebView (exe/APK) ne
   télécharge pas les blob URL : chaque export ouvre donc AUSSI une
   fenêtre avec le JSON copiable. L’import accepte un agent seul OU un
   tableau (export « tout »). Magasin : IndexedDB « agents ». ═══════ */
(function () {
  "use strict";
  if (window.__v583AgentsIo) return;
  function toast(m, k) { try { if (typeof window.toast === "function") window.toast(m, k || "info"); } catch (e) {} }
  function newId() { return "ag_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function nomFichier() { const d = new Date(); return "agents-theologicus-" + d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + ".json"; }

  /* ── fenêtre de secours : JSON visible et copiable (APK/WebView) ── */
  let ioModal = null;
  function fenetreJson(titre, texte, nomFich) {
    if (!ioModal) {
      ioModal = document.createElement("div");
      ioModal.id = "v583-io-modal";
      ioModal.innerHTML = '<style>#v583-io-modal{position:fixed;inset:0;z-index:141500;display:none;align-items:flex-start;justify-content:center;background:rgba(2,6,12,.74);backdrop-filter:blur(4px)}#v583-io-modal.open{display:flex}#v583-io-modal .b{width:min(720px,94vw);max-height:88vh;margin-top:5vh;display:flex;flex-direction:column;background:var(--ui-panel,#0d1626);border:1px solid var(--ui-border,#2a2a3a);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden}#v583-io-modal .hd{display:flex;align-items:center;gap:.5rem;padding:.7rem .9rem;border-bottom:1px solid var(--ui-border,#2a2a3a)}#v583-io-modal .hd h3{margin:0;font-size:.9rem;color:var(--ui-accent,#e5c15a);flex:1}#v583-io-modal textarea{flex:1;min-height:260px;margin:.6rem .9rem;background:var(--ui-bg,#0a0a12);color:var(--ui-ink,#e8e6e0);border:1px solid var(--ui-border,#2a2a3a);border-radius:8px;padding:.6rem;font:11px/1.5 Consolas,monospace;resize:vertical}#v583-io-modal .cts{display:flex;gap:.4rem;flex-wrap:wrap;padding:0 .9rem .7rem}#v583-io-modal .cts button{background:rgba(79,142,247,.14);color:#cfe0ff;border:1px solid rgba(79,142,247,.35);border-radius:8px;padding:.35rem .7rem;cursor:pointer;font-size:.78rem}#v583-io-modal .info{font-size:.64rem;color:var(--ui-dim,#8a8896);padding:0 .9rem .6rem}</style>'
        + '<div class="b"><div class="hd"><h3 id="v583-titre"></h3><button type="button" id="v583-x" style="background:none;border:none;color:inherit;font-size:16px;cursor:pointer">✕</button></div>'
        + '<textarea id="v583-json" readonly spellcheck="false"></textarea>'
        + '<div class="cts"><button type="button" id="v583-copier">📋 Copier le JSON</button><button type="button" id="v583-telech">💾 Enregistrer le fichier</button><button type="button" id="v583-dossier">📂 Ouvrir le dossier</button></div>'
        + '<div class="info" id="v583-info"></div></div>';
      document.body.appendChild(ioModal);
      ioModal.addEventListener("click", function (e) { if (e.target === ioModal) ioModal.classList.remove("open"); });
      ioModal.querySelector("#v583-x").addEventListener("click", function () { ioModal.classList.remove("open"); });
      ioModal.querySelector("#v583-copier").addEventListener("click", function () {
        const ta = ioModal.querySelector("#v583-json");
        ta.focus(); ta.select();
        let fait = false;
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(ta.value); fait = true; } } catch (e1) {}
        if (!fait) { try { document.execCommand("copy"); fait = true; } catch (e2) {} }
        toast(fait ? "📋 JSON copié — collez-le dans un fichier ou une note" : "Copie impossible — sélectionnez le texte manuellement", fait ? "success" : "warn");
      });
      ioModal.querySelector("#v583-telech").addEventListener("click", async function () {
        const nom = ioModal.getAttribute("data-fich") || "agents.json";
        const info = ioModal.querySelector("#v583-info");
        const r = await enregistrer(nom, ioModal.querySelector("#v583-json").value);
        const a = annoncer(r, nom);
        toast(a.m, a.k);
        if (r.ok && r.chemin) info.textContent = "✅ Enregistré : " + r.chemin;
        else if (r.ok) info.textContent = "✅ Fichier envoyé au dossier Téléchargements.";
      });
      ioModal.querySelector("#v583-dossier").addEventListener("click", async function () {
        try {
          const res = await fetch("/reveal-exports", { method: "POST" });
          const j = await res.json().catch(function () { return {}; });
          if (j && j.ok) toast("📂 Dossier ouvert : " + j.dossier, "success");
          else toast("Dossier indisponible" + (j && j.dossier ? " : " + j.dossier : ""), "warn");
        } catch (e) { toast("Ouverture du dossier indisponible dans ce contexte", "warn"); }
      });
    }
    ioModal.querySelector("#v583-titre").textContent = titre;
    ioModal.querySelector("#v583-json").value = texte;
    ioModal.setAttribute("data-fich", nomFich || "agents.json");
    ioModal.querySelector("#v583-info").textContent = "Fichier : " + (nomFich || "agents.json") + " — sur PC, « Enregistrer le fichier » l’écrit dans le dossier « backups » de THEOLOGICUS (le chemin exact s’affiche ici) ; « Ouvrir le dossier » le montre. Sur Android, utilisez « Copier le JSON ».";
    ioModal.classList.add("open");
  }
  /* ── écriture ROBUSTE du fichier ──────────────────────────────────
     La WebView (exe/APK) ne télécharge PAS les blob URL : « <a download> »
     ne produit RIEN, sans lever d’erreur — d’où le « je ne vois rien dans
     Téléchargements ». On écrit donc d’abord côté SERVEUR LOCAL, qui renvoie
     le CHEMIN réel (dossier de l’app, sous-dossier backups/). Le repli
     navigateur ne sert qu’à une page ouverte en file:// dans un vrai
     navigateur. Sur natif (Android) on ne prétend plus rien. */
  function b64utf8(s) {
    try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return null; }
  }
  function estNatif() {
    try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
  }
  async function enregistrer(nomFich, texte) {
    /* 1) téléchargement navigateur — tenté TOUJOURS (vrai navigateur, et bancs
          Playwright qui capturent l’événement « download ») */
    let nav = false;
    try {
      const blob = new Blob([texte], { type: "application/json" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = nomFich;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(u); } catch (e) {} }, 1000);
      nav = true;
    } catch (e) { nav = false; }
    /* 2) écriture SERVEUR — c’est ELLE qui compte dans la WebView, laquelle ne
          télécharge RIEN (sans lever d’erreur) ; le chemin renvoyé est RÉEL */
    try {
      const d64 = b64utf8(texte);
      if (d64) {
        const res = await fetch("/save-data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: nomFich, data64: d64 })
        });
        if (res.ok) {
          const j = await res.json().catch(function () { return {}; });
          if (j && j.path) return { ok: true, mode: "serveur", chemin: j.path, nav: nav };
        }
      }
    } catch (e) {}
    if (nav) return { ok: true, mode: "navigateur" };
    return { ok: false, mode: "aucun" };
  }
  function annoncer(r, nomFich) {
    if (r.mode === "serveur") return { k: "success", m: "💾 Enregistré : " + r.chemin };
    if (r.mode === "navigateur" && !estNatif()) return { k: "success", m: "💾 Fichier « " + nomFich + " » envoyé au dossier Téléchargements" };
    return { k: "warn", m: "Téléchargement indisponible ici — utilisez « Copier le JSON »" };
  }

  /* ── export TOUT ── */
  async function exportTout() {
    try {
      const all = (await db.getAll("agents")) || [];
      if (!all.length) { toast("Aucun agent utilisateur à exporter (les 20 agents théologiques 🎓 ont leur propre bouton d’export).", "warn"); return; }
      all.sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || "")); });
      const texte = JSON.stringify(all, null, 2);
      const fich = nomFichier();
      const r = await enregistrer(fich, texte);
      fenetreJson("📤 Export JSON — " + all.length + " agents", texte, fich);
      const a = annoncer(r, fich);
      toast(r.ok ? a.m + " (" + all.length + " agents)" : a.m, a.k);
    } catch (e) { toast("Export impossible : " + String(e && e.message || e), "error"); }
  }

  /* ── export individuel (robuste, remplace la version fragile) ── */
  window.exportAgent = async function (id) {
    try {
      const ag = await db.get("agents", id);
      if (!ag) { toast("Agent introuvable", "warn"); return; }
      const texte = JSON.stringify(ag, null, 2);
      const fich = "agent-" + String(ag.name || "agent").replace(/\s+/g, "-") + ".json";
      const r = await enregistrer(fich, texte);
      fenetreJson("📤 Export — " + ag.name, texte, fich);
      const a = annoncer(r, fich);
      toast(r.ok ? a.m : "Agent « " + ag.name + " » prêt — " + a.m, a.k);
    } catch (e) { toast("Erreur export agent : " + String(e && e.message || e), "error"); }
  };

  /* ── import : agent seul OU tableau (export « tout ») ── */
  function rebindImport() {
    const inp = document.getElementById("import-agent-input");
    if (!inp || (inp.onchange && inp.onchange.__v583)) return;
    const h583 = async function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const items = Array.isArray(data) ? data : [data];
        let n = 0;
        for (const ag of items) {
          if (!ag || !ag.name || !ag.desc) continue;
          const copie = Object.assign({}, ag);
          copie.id = newId(); copie.created = new Date().toISOString();
          await db.put("agents", copie);
          n++;
        }
        if (!n) throw new Error("aucun agent valide (name + desc requis)");
        if (typeof loadAgents === "function") try { await loadAgents(); } catch (eL) {}
        toast(n + " agent(s) importé(s) depuis « " + file.name + " »", "success");
      } catch (err) { toast("Erreur import : " + String(err && err.message || err), "error"); }
      inp.value = "";
    };
    h583.__v583 = true;
    inp.onchange = h583;
  }

  /* ── bouton EXPORTER TOUT dans le panneau des agents ── */
  function installerBouton() {
    const ancre = document.getElementById("import-agent-btn");
    if (!ancre || document.getElementById("export-all-agents-btn")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = ancre.className || "btn-ghost";
    b.id = "export-all-agents-btn";
    b.style.cssText = "font-size:10px;padding:5px 10px";
    b.textContent = "⬇⬇ EXPORTER TOUT (JSON)";
    b.title = "Exporter TOUS vos agents en un seul fichier JSON (ou copiable)";
    b.addEventListener("click", exportTout);
    ancre.parentNode.insertBefore(b, ancre.nextSibling);
    rebindImport();
  }
  function init() { installerBouton(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  /* l’app peut re-binder onchange après coup (init différée) : on ré-affirme */
  const ivM = setInterval(function () { installerBouton(); rebindImport(); }, 600);
  try {
    const obs = new MutationObserver(function () { installerBouton(); });
    obs.observe(document.body, { childList: true });
  } catch (e) {}
  window.__v583AgentsIo = { exportTout: exportTout };
})();

