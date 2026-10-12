/* ═══════════════════════════════════════════════════════════════════════
   Banc v566 — ADEODAT MAINS LIBRES (V3c) : streaming, écoute continue,
   repli hors-ligne Ollama.

   Vérifie (fetch + TTS + SpeechRecognition DOUBLÉS, zéro réseau réel,
   magasin isolé — règle v559) :
     1. STREAMING réel via callLLMStream : doublure avec body.getReader()
        produisant des chunks SSE (« data: {...delta...} », « data: [DONE] »)
        → la bulle se remplit au fil de l'eau et le texte FINAL est complet ;
        une ACTION dans le flux est EXÉCUTÉE (panneau Coran ouvert) puis
        NETTOYÉE de la bulle (calque v566 = v565 sur le flux).
     2. REPLI HORS-LIGNE : toggle 📶 actif ; le fetch du modèle actif répond
        500 → le module retente via OLLAMA (URL 127.0.0.1:11434 — doublée)
        → la réponse s'affiche marquée « (📶 hors-ligne — Ollama) ».
     3. ÉCOUTE CONTINUE : toggle 🔁 + classe SpeechRecognition FAUSSE →
        démarrage (instance créée, TTS tué = barre-in), onresult → envoyer
        (bulle + historique), onend → REDÉMARRAGE automatique (2e instance),
        toggle off → arrêt propre.
   ═══════════════════════════════════════════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

const resultats = [];
function section(t) { console.log('\n■ ' + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v566_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* semer le modèle actif + TTS doublé (règle v559) */
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';
    window.__ttsRecu = [];
    if (typeof ttsEmission === 'function') {
      window.ttsEmission = function (texte) { window.__ttsRecu.push(String(texte).slice(0, 60)); return true; };
    }
    window.__cancels = 0;
    if (window.speechSynthesis) window.speechSynthesis.cancel = function () { window.__cancels++; };
    localStorage.removeItem('theo_adeodat_v1');
  });

  /* ── 1. streaming ── */
  section('1. Streaming callLLMStream : bulle au fil de l\'eau + ACTION exécutée');
  const stream = await page.evaluate(async () => {
    window.__v564Adeodat.ouvrir();
    const enc = s => new TextEncoder().encode(s);
    const morceaux = ['Je suis Adeodat. ', 'Voici le verset demandé.\n', 'ACTION: {"outil":"ouvrir_coran","params":{"sourate":2,"v1":255}}'];
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/chat/completions') !== -1) {
        const parts = [];
        morceaux.forEach(function (m) {
          parts.push(enc('data: ' + JSON.stringify({ choices: [{ delta: { content: m } }] }) + '\n\n'));

        });
        const plat = [];
        parts.forEach(function (c) { c.forEach(function (b) { plat.push(b); }); });
        const tout = new Uint8Array(plat);
        let lu = false;
        return { ok: true, status: 200, body: { getReader: function () { return { read: async function () { return lu ? { done: true } : (lu = true, { done: false, value: tout }); } }; } } };
      }
      return { ok: false, status: 404, text: async function () { return ''; } };
    };
    window.__v564Adeodat.envoyer('Montre-moi le verset');
    return new Promise(function (res) { setTimeout(function () {
      const tx = document.querySelector('#adeodat-msgs .ad-assistant:last-of-type .ad-tx');
      const p = document.getElementById('v183-pat');
      res({
        texte: tx ? tx.textContent : '',
        panneauCoran: p ? p.classList.contains('open') : false,
        titre: (document.getElementById('v183-title') || {}).textContent || ''
      });
    }, 1500); });
  });
  ok('la réponse STREAMÉE est complète dans la bulle',
     stream.texte.indexOf('Je suis Adeodat.') !== -1 && stream.texte.indexOf('Voici le verset demandé.') !== -1,
     stream.texte.slice(0, 50));
  ok('la ligne ACTION du flux est NETTOYÉE du texte final',
     stream.texte.indexOf('ACTION:') === -1, stream.texte.slice(-40));
  ok('l\'ACTION du flux a OUVERT le panneau Coran 2:255',
     stream.panneauCoran && /2\s*:\s*255/.test(stream.titre), stream.titre);
  await page.evaluate(() => { const p = document.getElementById('v183-pat'); if (p) p.classList.remove('open'); });

  /* ── 2. repli hors-ligne Ollama ── */
  section('2. Repli hors-ligne : modèle actif 500 → Ollama (11434) répond');
  const oll = await page.evaluate(async () => {
    try { localStorage.setItem('theo_adeodat_ollama', '1'); localStorage.setItem('theo_adeodat_ollama_model', 'qwen2.5'); } catch (e) {}
    localStorage.removeItem('theo_adeodat_v1');
    window.__v564Adeodat.ouvrir();
    const urls = [];
    const enc = s => new TextEncoder().encode(s);
    window.fetch = async function (url, opts) {
      const u = String(url);
      urls.push(u.slice(0, 90));
      if (u.indexOf('11434') !== -1) {
        const tout = enc('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Réponse hors-ligne du banc.' } }] }) + '\n\n' + enc('data: [DONE]\n\n'));
        let lu = false;
        return { ok: true, status: 200, body: { getReader: function () { return { read: async function () { return lu ? { done: true } : (lu = true, { done: false, value: tout }); } }; } } };
      }
      return { ok: false, status: 500, text: async function () { return 'service down'; } };
    };
    window.__v564Adeodat.envoyer('Qui es-tu hors-ligne ?');
    return new Promise(function (res) { setTimeout(function () {
      const tx = document.querySelector('#adeodat-msgs .ad-assistant:last-of-type .ad-tx');
      res({ texte: tx ? tx.textContent : '', urls: urls });
    }, 1800); });
  });
  ok('le repli est parti vers OLLAMA (127.0.0.1:11434)',
     oll.urls.some(u => u.indexOf('11434') !== -1), JSON.stringify(oll.urls));
  ok('la réponse hors-ligne est rendue + marquée « (📶 hors-ligne — Ollama) »',
     oll.texte.indexOf('Réponse hors-ligne du banc.') !== -1 && oll.texte.indexOf('hors-ligne — Ollama') !== -1,
     oll.texte.slice(0, 70));

  /* ── 3. écoute continue ── */
  section('3. Écoute continue : barre-in, envoi, redémarrage auto');
  /* v569 — depuis V3e, ouvrir() démarre la session micro AUTOMATIQUEMENT :
     la session (tenue par le SR polyfillé/CI) occupe recC → le faux SR ne
     peut pas démarrer. On COUPPE la session avant d'installer le faux. */
  await page.evaluate(() => { window.__v566Libre.continuSet(false); });
  await page.waitForTimeout(400);   /* laisse le onend/arrêt se produire */

  const cont = await page.evaluate(async () => {
    /* classe SR FAUSSE : instances enregistrées, pilotables */
    window.__srInstances = [];
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      this.__demarre = false;
      window.__srInstances.push(this);
      this.start = function () { self.__demarre = true; };
      this.stop = function () { self.__demarre = false; if (self.onend) self.onend(); };
      this.abort = function () {};
    };
    window.speechSynthesis.cancel = function () { window.__cancels++; };   /* barre-in compteur */
    window.__v566Libre.continuSet(true);   /* toggle + démarrage */
    await new Promise(r2 => setTimeout(r2, 400));
    const inst1 = window.__srInstances[window.__srInstances.length - 1];
    const demarre1 = inst1 && inst1.__demarre;
    const cancelsAvant = window.__cancels;
    /* le locuteur parle : onresult → envoyer */
    inst1.onresult({ results: [[{ transcript: 'Jean 3:16' }]] });
    await new Promise(r2 => setTimeout(r2, 1400));
    const users = document.querySelectorAll('#adeodat-msgs .ad-user');
    const derniereU = users[users.length - 1];
    const bulle = derniereU ? derniereU.querySelector('.ad-tx') : null;
    const bulleTxt = bulle ? bulle.textContent : '';
    /* la phrase finie : onend → REDÉMARRAGE automatique */
    if (inst1.onend) inst1.onend();
    await new Promise(r2 => setTimeout(r2, 700));
    const nbInstances = window.__srInstances.length;
    /* toggle off → arrêt */
    window.__v566Libre.continuSet(false);
    await new Promise(r2 => setTimeout(r2, 300));
    const derniere = window.__srInstances[window.__srInstances.length - 1];
    return {
      demarre1: demarre1, cancels: window.__cancels - cancelsAvant,
      bulleUser: bulleTxt, nbInstances,
      arrete: derniere ? derniere.__demarre === false : true
    };
  });
  ok('le démarrage continue crée une instance SR + BARRE-IN (TTS tué)', cont.demarre1 && cont.cancels >= 1,
     'instances=1 cancel=' + cont.cancels);
  ok('la phrase reconnue part à ADEODAT (bulle user)', cont.bulleUser === 'Jean 3:16', JSON.stringify(cont.bulleUser));
  ok('après onend : REDÉMARRAGE automatique (2e instance)', cont.nbInstances >= 2, 'instances=' + cont.nbInstances);
  ok('toggle off : l\'écoute s\'arrête proprement', cont.arrete);

  /* ── 4. propreté ── */
  section('4. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|chat\/completions|11434/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
