<script id="v604-backup-fermeture">
/* ═══ v604 — BACKUP DES CONVERSATIONS À CHAQUE FERMETURE ═══
   Demande utilisateur : qu'à chaque fermeture de THEOLOGICUS un backup des
   conversations soit fait.

   La fermeture est peu fiable pour l'asynchrone (la page peut mourir avant
   la fin d'une écriture) : trois déclencheurs COMPLÉMENTAIRES —
     1. visibilitychange -> caché  (le principal : il précède la destruction,
        throttle 60 s) ;
     2. pagehide + beforeunload    (best effort : IDB rapide + fetch keepalive) ;
     3. filet toutes les 5 min     (une panne ne coûte que 5 minutes).

   Destinations :
     - IndexedDB store « auto_backups » (TOUTES plateformes, y compris l'APK
       sans serveur) — ce store existait déjà dans le schéma, l'export et la
       restauration le gèrent, mais RIEN ne l'alimentait. Garder les 7.
     - backups/ du serveur (exe + relais, uniquement en http) — fichier daté
       THEOLOGICUS-conversations-*.json ; le serveur purge au-delà de 30.

   Format IDENTIQUE à l'export manuel (v442) -> un backup de fermeture est
   restaurable par la restauration existante (PARAMÈTRES > Restaurer). */
(function(){
  'use strict';
  var GARDER_IDB = 7;
  var THROTTLE_MS = 60000;
  var _dernierTs = 0;
  var _enCours = false;

  function servirEnHttp() {
    try { return location.protocol === 'http:' || location.protocol === 'https:'; }
    catch (e) { return false; }
  }

  function horodatageCompact() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
           '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  /* Tous les chats : par le helper global si présent, sinon IndexedDB direct
     (le const db de portée script est visible par nom dans les autres scripts,
     mais PAS comme window.db — leçon v25/v51252). */
  function collecterChats() {
    return new Promise(function (resoudre) {
      var viaDb = null;
      try { if (typeof db !== 'undefined' && db && db.getAll) viaDb = db.getAll('chats'); } catch (e) {}
      if (viaDb && typeof viaDb.then === 'function') {
        viaDb.then(function (c) { resoudre(c || []); }).catch(function () { resoudre([]); });
        return;
      }
      try {
        var rq = indexedDB.open('THEOLOGICUS_AI_DB');
        rq.onerror = function () { resoudre([]); };
        rq.onsuccess = function () {
          var connexion = rq.result;
          try {
            var tx = connexion.transaction('chats', 'readonly');
            var demande = tx.objectStore('chats').getAll();
            demande.onsuccess = function () { resoudre(demande.result || []); connexion.close(); };
            demande.onerror = function () { resoudre([]); connexion.close(); };
          } catch (e) { try { connexion.close(); } catch (e2) {} resoudre([]); }
        };
      } catch (e) { resoudre([]); }
    });
  }

  function ecrireAutoBackup(entree) {
    return new Promise(function (resoudre) {
      try {
        var rq = indexedDB.open('THEOLOGICUS_AI_DB');
        rq.onerror = function () { resoudre(); };
        rq.onsuccess = function () {
          var connexion = rq.result;
          try {
            var tx = connexion.transaction('auto_backups', 'readwrite');
            var demande = tx.objectStore('auto_backups').put(entree);
            demande.onsuccess = function () { connexion.close(); resoudre(); };
            demande.onerror = function () { connexion.close(); resoudre(); };
          } catch (e) { try { connexion.close(); } catch (e2) {} resoudre(); }
        };
      } catch (e) { resoudre(); }
    });
  }

  function listerAutoBackups() {
    return new Promise(function (resoudre) {
      try {
        var rq = indexedDB.open('THEOLOGICUS_AI_DB');
        rq.onerror = function () { resoudre([]); };
        rq.onsuccess = function () {
          var connexion = rq.result;
          try {
            var tx = connexion.transaction('auto_backups', 'readonly');
            var demande = tx.objectStore('auto_backups').getAll();
            demande.onsuccess = function () { resoudre(demande.result || []); connexion.close(); };
            demande.onerror = function () { resoudre([]); connexion.close(); };
          } catch (e) { try { connexion.close(); } catch (e2) {} resoudre([]); }
        };
      } catch (e) { resoudre([]); }
    });
  }

  function supprimerAutoBackups(ids) {
    return new Promise(function (resoudre) {
      if (!ids.length) { resoudre(); return; }
      try {
        var rq = indexedDB.open('THEOLOGICUS_AI_DB');
        rq.onerror = function () { resoudre(); };
        rq.onsuccess = function () {
          var connexion = rq.result;
          try {
            var tx = connexion.transaction('auto_backups', 'readwrite');
            var store = tx.objectStore('auto_backups');
            ids.forEach(function (id) { store.delete(id); });
            tx.oncomplete = function () { connexion.close(); resoudre(); };
            tx.onerror = function () { connexion.close(); resoudre(); };
          } catch (e) { try { connexion.close(); } catch (e2) {} resoudre(); }
        };
      } catch (e) { resoudre(); }
    });
  }

  function purgerAutoBackups(garder) {
    return listerAutoBackups().then(function (liste) {
      var tries = liste.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      var aSupprimer = tries.slice(garder).map(function (e) { return e.id; });
      return supprimerAutoBackups(aSupprimer);
    });
  }

  function sauvegardeFermeture(force) {
    if (_enCours) return Promise.resolve();
    var t = Date.now();
    if (!force && t - _dernierTs < THROTTLE_MS) return Promise.resolve();
    _enCours = true;
    var fait = collecterChats().then(function (chats) {
      if (!chats.length) return;
      var payload = {
        exported: new Date().toISOString(),
        source: 'THEOLOGICUS',
        type: 'auto-fermeture',
        data: { chats: chats }
      };
      var json = JSON.stringify(payload);
      /* 1) auto_backups (toutes plateformes) puis purge garder=7. */
      return ecrireAutoBackup({ id: 'conv-' + horodatageCompact(), ts: Date.now(),
                                type: 'conversations', json: json })
        .then(function () { return purgerAutoBackups(GARDER_IDB); })
        .then(function () {
          /* 2) backups/ du serveur (exe + relais) — keepalive : le navigateur
             termine la requête même pendant le déchargement (dans la limite
             de 64 Ko ; au-delà, l'instantané IndexedDB reste la référence). */
          if (!servirEnHttp()) return;
          try {
            fetch('/save-data', {
              method: 'POST', keepalive: true,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: 'THEOLOGICUS-conversations-' + horodatageCompact() + '.json',
                data64: btoa(unescape(encodeURIComponent(json)))
              })
            }).catch(function () {});
          } catch (e) {}
          _dernierTs = t;
        });
    }).catch(function () {}).then(function () { _enCours = false; });
    return fait;
  }

  /* Exposés pour les bancs. */
  window.sauvegardeFermeture = sauvegardeFermeture;
  window.purgerAutoBackups = purgerAutoBackups;
  window.listerAutoBackups = listerAutoBackups;

  /* ── Déclencheurs ── */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) sauvegardeFermeture(false);
  });
  window.addEventListener('pagehide', function () { sauvegardeFermeture(true); });
  window.addEventListener('beforeunload', function () { sauvegardeFermeture(true); });
  setInterval(function () { sauvegardeFermeture(false); }, 5 * 60 * 1000);
})();
</script>
