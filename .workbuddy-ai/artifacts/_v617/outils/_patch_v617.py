# -*- coding: utf-8 -*-
"""v617 — transport : délai + repli élargi + journal + diagnostic réseau.

Applique des remplacements LITTÉRAUX sur THEOLOGICUS.html.
Aucune expression régulière sur les sauts de ligne : le fichier est en CRLF,
on normalise en LF (remplacement littéral), on patche, on remet en CRLF.
"""
import sys

P = "THEOLOGICUS.html"

def lire():
    with open(P, encoding="utf-8", newline="") as f:
        s = f.read()
    return s.replace("\r\n", "\n")

def ecrire(s):
    with open(P, "w", encoding="utf-8", newline="") as f:
        f.write(s.replace("\n", "\r\n"))

def une_fois(s, ancre):
    n = s.count(ancre)
    if n != 1:
        raise SystemExit("ANCRE %r présente %d fois (attendu 1)" % (ancre[:70], n))
    return s.index(ancre)

# ────────────────────────────────────────────────────────────────
# A. constantes + journal (avant « Une réponse native est UTILISABLE »)
# ────────────────────────────────────────────────────────────────
BLOC_A = r'''  /* ═══ v617 — RÉSILIENCE + DIAGNOSTIC ═══
     Deux manques mesurés sur APK :
       1. AUCUN délai sur le chemin direct : un réseau mobile qui ne coupe pas
          la connexion (ou un WAF qui ne répond jamais) laissait l'interface
          tourner indéfiniment — « souci HTTP » sans message ni issue.
       2. Le repli natif ne se déclenchait QUE sur 403 ou échec réseau : un
          502/520/522/524 (edge) ou un 408 laissait l'appel mourir alors
          qu'un autre chemin réseau pouvait aboutir.
     Aucun rejeu sur 401/402/422 : ce sont des verdicts du fournisseur, les
     rejouer ne les change pas et une génération rejouée coûte des jetons. */
  var DELAI_ENTETES_MS = 45000;

  function doitRejouer(status) {
    if (!status) return true;
    if (status === 403 || status === 408 || status === 425) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }

  /* Journal borné : les 12 derniers événements de transport, avec le CORPS
     exact du fournisseur. C'est la pièce qui manquait à chaque diagnostic. */
  var JOURNAL_MAX = 12;
  function journaliser(ev) {
    try {
      var j = window.__theoJournalReseau;
      if (!j) { j = window.__theoJournalReseau = []; }
      ev.ts = Date.now();
      j.push(ev);
      while (j.length > JOURNAL_MAX) j.shift();
      try { sessionStorage.setItem('theo_journal_reseau', JSON.stringify(j.slice(-6))); } catch (e2) {}
    } catch (e) {}
  }
  window.__theoJournalReseauAjout = journaliser;
  try {
    var _j0 = JSON.parse(sessionStorage.getItem('theo_journal_reseau') || '[]');
    if (_j0 && _j0.length) window.__theoJournalReseau = _j0;
  } catch (e) {}

'''

# ────────────────────────────────────────────────────────────────
# B. theoFetchReseau — délai sur les en-têtes + repli élargi + journal
# ────────────────────────────────────────────────────────────────
NOUVEAU_B = r'''  function theoFetchReseau(url, init) {
    init = init || {};
    var ponts = estNatif() ? pontsDisponibles() : [];
    if (!ponts.length) return _direct.call(window, url, init);

    /* v617 — délai d'attente des EN-TÊTES. Le minuteur est levé dès que la
       réponse arrive : une génération en cours de streaming n'est jamais
       coupée. `__theoDelaiMs` permet aux appels courts d'être plus stricts. */
    var delai = Number(init.__theoDelaiMs) > 0 ? Number(init.__theoDelaiMs) : DELAI_ENTETES_MS;
    var ctrl = null, minuteur = null, initDirect = init;
    try {
      if (typeof AbortController !== 'undefined') {
        ctrl = new AbortController();
        if (init.signal && typeof init.signal.addEventListener === 'function') {
          init.signal.addEventListener('abort', function () { try { ctrl.abort(); } catch (e) {} });
        }
        initDirect = {};
        for (var k in init) { if (Object.prototype.hasOwnProperty.call(init, k)) initDirect[k] = init[k]; }
        initDirect.signal = ctrl.signal;
        minuteur = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, delai);
      }
    } catch (e) { ctrl = null; minuteur = null; initDirect = init; }

    function finMinuteur() { if (minuteur) { clearTimeout(minuteur); minuteur = null; } }
    function abandonneParAppelant() { return !!(init.signal && init.signal.aborted); }

    return _direct.call(window, url, initDirect).then(function (res) {
      finMinuteur();
      if (!doitRejouer(res.status)) {
        journaliser({ type: 'direct', url: url, statut: res.status, rejoue: false });
        return res;
      }
      /* 403 / 408 / 5xx : le CHEMIN peut être en cause -> rejeu natif. */
      var diag = { statut: res.status };
      var apresLecture = function (txt) {
        diag.extrait = String(txt || '').slice(0, 240);
        return rejouerNatif(url, init, ponts, diag).then(function (res2) {
          if (res2) {
            journaliser({ type: 'rejeu', url: url, statutDirect: res.status, statutNatif: res2.status,
                          pont: (window.__dernierTransport || {}).pont });
            return res2;
          }
          journaliser({ type: 'direct', url: url, statut: res.status, rejoue: 'echec' });
          return res;
        });
      };
      return res.clone().text().then(apresLecture, function () {
        return rejouerNatif(url, init, ponts, diag).then(function (res2) { return res2 || res; });
      });
    }, function (err) {
      finMinuteur();
      /* abandon VOLONTAIRE de l'appelant : aucun rejeu, aucune erreur réécrite */
      if (abandonneParAppelant()) throw err;
      var expire = !!(err && err.name === 'AbortError');
      return rejouerNatif(url, init, ponts, {
        erreurDirect: String((err && err.message) || err),
        delaiExpire: expire ? delai : 0
      }).then(function (res2) {
        if (res2) {
          journaliser({ type: 'rejeu', url: url, cause: expire ? 'delai' : 'reseau', statutNatif: res2.status });
          return res2;
        }
        journaliser({ type: 'echec', url: url, cause: expire ? 'delai' : 'reseau',
                      erreur: String((err && err.message) || err) });
        if (expire) {
          var e2 = new Error('Aucune réponse après ' + Math.round(delai / 1000) +
            ' s : ni le chemin direct ni le transport natif n\'ont répondu.');
          e2.delaiExpire = true;
          e2.cause = err;
          throw e2;
        }
        throw err;
      });
    });
  }
'''

# ────────────────────────────────────────────────────────────────
# C. diagnostic réseau (rapport + panneau copiable)
# ────────────────────────────────────────────────────────────────
BLOC_C = r'''  /* ═══ v617 — DIAGNOSTIC RÉSEAU ═══
     Rapport lisible et copiable : version, plateforme, ponts disponibles,
     endpoint RÉELLEMENT appelé, modèle, dernier statut, corps exact du
     fournisseur et journal des tentatives. AUCUNE clé n'y figure. */
  function _diagVersion() {
    try { if (window.THEO_VERSION) return String(window.THEO_VERSION); } catch (e) {}
    try { if (window.__APK_VERSION__) return String(window.__APK_VERSION__); } catch (e) {}
    return '(inconnue)';
  }

  function _diagPlateforme() {
    var p = 'web';
    try {
      if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function') p = window.Capacitor.getPlatform();
    } catch (e) {}
    return p + (estNatif() ? ' (coque native)' : ' (navigateur)');
  }

  function _diagCible() {
    var out = { modele: '', endpoint: '', relais: 'non' };
    try { out.modele = (typeof state !== 'undefined' && state && state.model) || ''; } catch (e) {}
    try {
      var cfg = resolveModelConfig(out.modele);
      out.endpoint = cfg && cfg.endpoint ? String(cfg.endpoint) : '';
      out.relais = (apiEndpoint(out.endpoint) !== out.endpoint) ? 'oui' : 'non';
    } catch (e) {}
    return out;
  }

  function diagReseau() {
    var L = [];
    var cible = _diagCible();
    var ponts = estNatif()
      ? (pontsDisponibles().map(function (p) { return p.nom; }).join(', ') || 'aucun')
      : 'aucun (pas de coque native)';
    L.push('THEOLOGICUS — DIAGNOSTIC RÉSEAU');
    L.push('version      : ' + _diagVersion());
    L.push('plateforme   : ' + _diagPlateforme());
    L.push('navigateur   : ' + String((typeof navigator !== 'undefined' && navigator.userAgent) || ''));
    L.push('transport    : ' + ponts);
    L.push('modele       : ' + (cible.modele || '(aucun)'));
    L.push('endpoint     : ' + (cible.endpoint || '(aucun)'));
    L.push('relais local : ' + cible.relais);
    L.push('delai repli  : ' + Math.round(DELAI_ENTETES_MS / 1000) + ' s');
    L.push('');
    L.push('DERNIER TRANSPORT : ' + (window.__dernierTransport ? JSON.stringify(window.__dernierTransport) : '(aucun)'));
    var j = window.__theoJournalReseau || [];
    L.push('');
    L.push('JOURNAL (' + j.length + ' événement(s), le plus récent en dernier) :');
    if (!j.length) L.push('  (vide)');
    j.forEach(function (ev) {
      var d = new Date(ev.ts || 0);
      var hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
      var copie = {};
      Object.keys(ev).forEach(function (k) { if (k !== 'ts') copie[k] = ev[k]; });
      L.push('  ' + hh + ' ' + JSON.stringify(copie));
    });
    return L.join('\n');
  }
  window.__theoDiagReseau = diagReseau;

  function afficherDiagReseau() {
    try {
      var vieux = document.getElementById('theo-diag-reseau');
      if (vieux && vieux.parentNode) vieux.parentNode.removeChild(vieux);
      var txt = diagReseau();
      var ech = function (s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      };
      var ov = document.createElement('div');
      ov.id = 'theo-diag-reseau';
      ov.className = 'modal-overlay';
      ov.style.zIndex = '9999';
      ov.innerHTML =
        '<div class="modal-box" style="max-width:780px">' +
          '<div class="modal-header">' +
            '<div class="modal-title">🧪 DIAGNOSTIC RÉSEAU</div>' +
            '<button class="modal-close" data-fermer>✕</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<pre id="theo-diag-texte" style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:11px;line-height:1.55;max-height:52vh;overflow:auto;user-select:text;-webkit-user-select:text;background:rgba(127,127,127,0.10);padding:12px;border-radius:8px">' + ech(txt) + '</pre>' +
            '<div class="btn-row">' +
              '<button class="btn-ghost" data-fermer>FERMER</button>' +
              '<button class="btn-primary" data-copier>📋 COPIER</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      var fermer = function () { try { if (ov.parentNode) ov.parentNode.removeChild(ov); } catch (e) {} };
      Array.prototype.forEach.call(ov.querySelectorAll('[data-fermer]'), function (b) { b.onclick = fermer; });
      ov.addEventListener('click', function (e) { if (e.target === ov) fermer(); });
      var btn = ov.querySelector('[data-copier]');
      if (btn) btn.onclick = function () {
        var fini = function (ok) {
          btn.textContent = ok ? '✅ COPIÉ' : '⚠️ SÉLECTIONNE ET COPIE';
          setTimeout(function () { btn.textContent = '📋 COPIER'; }, 1800);
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(function () { fini(true); }, function () { fini(false); });
            return;
          }
        } catch (e) {}
        try {
          var pre = document.getElementById('theo-diag-texte');
          var r = document.createRange(); r.selectNodeContents(pre);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          fini(document.execCommand('copy'));
        } catch (e) { fini(false); }
      };
    } catch (e) {
      try { if (typeof toast === 'function') toast('Diagnostic impossible : ' + e.message, 'error'); } catch (e2) {}
    }
  }
  window.__theoDiagAfficher = afficherDiagReseau;

'''

# ────────────────────────────────────────────────────────────────
# D. throwApiError — transport sur TOUTES les erreurs + branches 408/429/5xx
# ────────────────────────────────────────────────────────────────
LIGNE_JOURNAL = r'''  /* v617 — le diagnostic doit contenir l'erreur MÊME quand elle n'a pas
     transité par un rejeu (401, 402, 429, 5xx rendus par le chemin direct). */
  try {
    if (window.__theoJournalReseauAjout) window.__theoJournalReseauAjout({
      type: 'api', statut: status, modele: model || '', transport: viaTransport,
      edge: edgeServer || '', extrait: String(serverMsg || '').slice(0, 200)
    });
  } catch (e) {}

'''

BRANCHE_RESEAU = r'''  } else if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    /* v617 — ces codes dépendent du CHEMIN (edge surchargé, réseau mobile) et
       non de la clé : le message doit le dire et proposer le diagnostic. */
    err.reseauInstable = true;
    var dNet = String(serverMsg || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    var quoi = (status === 408) ? 'délai dépassé'
             : (status === 429) ? 'trop de requêtes (limitation de débit)'
             : 'erreur du serveur ou de l\'edge';
    err.message = 'Le fournisseur n\'a pas pu traiter la requête — HTTP ' + status + ' (' + quoi + ')' + viaTxt +
      (dNet ? '. Détail : ' + dNet : '') +
      (status === 429
        ? '. Attends quelques secondes, puis réessaie (quota de la clé).'
        : '. Réessaie dans un instant ; si ça se répète, change de réseau (Wi-Fi ↔ données mobiles).') +
      ' 🧪 Diagnostic : PARAMÈTRES ⚙ > Modèle > 🧪 DIAGNOSTIC.';
'''

# ────────────────────────────────────────────────────────────────
# E. formateurs : message dédié au délai dépassé
# ────────────────────────────────────────────────────────────────
LIGNE_FORMATEUR = r'''  if (e && e.delaiExpire) return 'Réseau muet : aucune réponse dans le délai (ni direct, ni natif). Change de réseau (Wi-Fi ↔ données mobiles) puis réessaie. 🧪 Diagnostic : PARAMÈTRES ⚙ > Modèle > 🧪 DIAGNOSTIC.';
'''

# ────────────────────────────────────────────────────────────────
# F. bouton dans la modale de clé
# ────────────────────────────────────────────────────────────────
BOUTON = r'''        <button class="btn-ghost" id="diag-reseau" onclick="window.__theoDiagAfficher && window.__theoDiagAfficher()" title="Rapport copiable : version, plateforme, transport, endpoint, modèle, dernier statut HTTP et corps exact du fournisseur — aucune clé n'y figure">🧪 DIAGNOSTIC</button>
'''


def main():
    s = lire()
    n0 = len(s)

    # A — avant le commentaire de utilisable()
    a = une_fois(s, "  /* Une réponse native n'est UTILISABLE que si elle porte quelque chose.")
    s = s[:a] + BLOC_A + s[a:]

    # B — remplacer le corps de theoFetchReseau
    d = une_fois(s, "  function theoFetchReseau(url, init) {")
    fin = s.index("  window.theoFetchReseau = theoFetchReseau;", d)
    s = s[:d] + NOUVEAU_B + s[fin:]

    # C — juste avant le bloc AUTONOMIE (début de LIGNE : l'emoji 🔴 ne se
    #     compare pas de façon fiable dans le shell, on ancre sur le texte)
    idx = une_fois(s, "AUTONOMIE : le wrapper de fetch de l'app n'existe que si le plugin")
    c = s.rindex("\n", 0, idx) + 1
    s = s[:c] + BLOC_C + s[c:]

    # D0 — forme courte « [via …] » réutilisée par les nouvelles branches
    ancre_via = "    : (_tr403 && _tr403.erreurNatif ? 'direct (natif en échec)' : 'direct');"
    d0 = une_fois(s, ancre_via)
    s = s[:d0] + ancre_via + "\n  var viaTxt = ' [via ' + viaTransport + ']';   /* v617 */" + s[d0 + len(ancre_via):]

    # D1 — transport mémorisé sur l'erreur (ancre longue : la ligne courte
    #      « err.model = model || ''; » existe DEUX fois dans le fichier)
    ancre_d1 = "  err.apiMessage = serverMsg ? String(serverMsg).slice(0, 400) : '';\n  err.model = model || '';"
    d1 = une_fois(s, ancre_d1)
    s = s[:d1] + ancre_d1 + "\n  err.transport = viaTransport;   /* v617 — nommé dans le diagnostic */" + s[d1 + len(ancre_d1):]

    # D2 — journal avant le commentaire v610
    d2 = une_fois(s, "  // v610 — 401 ≠ 403 : un 401 est une CLÉ invalide")
    s = s[:d2] + LIGNE_JOURNAL + s[d2:]

    # D3 — branche 408/429/5xx avant la branche 403
    d3 = une_fois(s, "  } else if (status === 403) {")
    s = s[:d3] + BRANCHE_RESEAU + s[d3:]

    # E — formateurs (les deux occurrences identiques)
    ancre_f = "  if (e && (e.cleRefusee || e.accesRefuse || e.parametresRefuses || e.modeleIndisponible || e.creditEpuise)) return e.message; // v603/v610/v611b/v613/v614"
    if s.count(ancre_f) != 2:
        raise SystemExit("ANCRE formateur : %d occurrence(s) (attendu 2)" % s.count(ancre_f))
    s = s.replace(ancre_f, ancre_f + "\n" + LIGNE_FORMATEUR.rstrip("\n"))

    # F — bouton diagnostic
    d4 = une_fois(s, '        <button class="btn-ghost" id="test-api-key"')
    fin_btn = s.index("\n", d4) + 1
    s = s[:fin_btn] + BOUTON + s[fin_btn:]

    ecrire(s)
    print("OK — %d -> %d caractères" % (n0, len(s)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
