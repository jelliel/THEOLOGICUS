# -*- coding: utf-8 -*-
"""v617c — theoFetchReseau : délai appliqué AUSSI sans pont natif, et délai
choisi selon le mode (stream -> en-têtes au 1er jeton ; non stream -> corps).
"""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")

DEBUT = "  function theoFetchReseau(url, init) {"
FIN = "  window.theoFetchReseau = theoFetchReseau;"
if s.count(DEBUT) != 1:
    raise SystemExit("ancre début : %d" % s.count(DEBUT))
d = s.index(DEBUT)
f_ = s.index(FIN, d)

NOUVEAU = r'''  function theoFetchReseau(url, init) {
    init = init || {};
    var ponts = estNatif() ? pontsDisponibles() : [];

    /* v617 — délai d'attente des EN-TÊTES, appliqué MÊME sans pont natif :
       mieux vaut une erreur claire qu'une interface qui tourne sans fin.
       · stream:true -> les en-têtes arrivent au PREMIER jeton (45 s suffisent) ;
       · sinon       -> les en-têtes arrivent AVEC le corps : une génération
                        non streamée peut être longue (180 s) ;
       · __theoDelaiMs force la valeur (bancs, appels courts). */
    var delai = DELAI_CORPS_MS;
    try { if (/"stream"\s*:\s*true/.test(String(init.body || ''))) delai = DELAI_ENTETES_MS; } catch (e) {}
    if (Number(init.__theoDelaiMs) > 0) delai = Number(init.__theoDelaiMs);

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
    function abandonAppelant() { return !!(init.signal && init.signal.aborted); }
    function erreurDelai() {
      var e2 = new Error('Aucune réponse après ' + Math.round(delai / 1000) + ' s' +
        (ponts.length ? ' : ni le chemin direct ni le transport natif n\'ont répondu.'
                      : ' — le réseau n\'a rien renvoyé.'));
      e2.delaiExpire = true;
      return e2;
    }

    return _direct.call(window, url, initDirect).then(function (res) {
      finMinuteur();
      if (!ponts.length) return res;
      if (!doitRejouer(res.status)) {
        /* un 2xx n'apprend rien : on ne garde que les échecs, sinon douze
           succès chassent la panne du journal borné. */
        if (res.status >= 400) journaliser({ type: 'direct', url: url, statut: res.status, rejoue: false });
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
      if (abandonAppelant()) throw err;
      var expire = !!(err && err.name === 'AbortError');
      var cause = expire ? 'delai' : 'reseau';
      if (!ponts.length) {
        journaliser({ type: 'echec', url: url, cause: cause, erreur: String((err && err.message) || err) });
        if (expire) throw erreurDelai();
        throw err;
      }
      return rejouerNatif(url, init, ponts, {
        erreurDirect: String((err && err.message) || err),
        delaiExpire: expire ? delai : 0
      }).then(function (res2) {
        if (res2) {
          journaliser({ type: 'rejeu', url: url, cause: cause, statutNatif: res2.status });
          return res2;
        }
        journaliser({ type: 'echec', url: url, cause: cause, erreur: String((err && err.message) || err) });
        if (expire) throw erreurDelai();
        throw err;
      });
    });
  }
'''

s = s[:d] + NOUVEAU + s[f_:]

# constantes : ajouter le délai « réponse non streamée » après DELAI_ENTETES_MS
anc = "  var DELAI_ENTETES_MS = 45000;\n"
if s.count(anc) != 1:
    raise SystemExit("ancre constante : %d" % s.count(anc))
s = s.replace(anc, anc + "  /* réponse NON streamée : les en-têtes n'arrivent qu'avec le corps. */\n  var DELAI_CORPS_MS = 180000;\n")

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK")
