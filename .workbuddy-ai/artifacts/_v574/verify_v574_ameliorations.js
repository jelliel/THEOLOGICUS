/* ═══════════════════════════════════════════════════════════════════════
   Banc v574 — ADEODAT V3i (4 améliorations demandées) :
     1. QR — __v574AdeodatQR : SVG généré, modale #v574-qr-mod (URL +
        fermeture), et la bannière app.py contient bien le bouton « QR ».
     2. SOURCES — __v574Chercher.chercher() sur les VRAIS corpus servis par
        le relais (Bible Segond + Coran) : extraits avec refs b:c:v, bloc
        « SOURCES LOCALES » ; Pères (index v167, absent en profil isolé →
        liste vide sans crash) ; Valtorta (json réel).
     3. RAG — v564.envoyer injecte le bloc SOURCES dans les messages du
        modèle (capturé par le stub fetch) ; la réponse part dans la bulle
        et dans la mémoire theo_adeodat_v1 (2 entrées).
     4. MÉMOIRE — 🧹 « Nouveau sujet » : mémoire vidée, bulle d'accueil,
        compteur du sous-titre à 0.
     5. MOT D'ÉVEIL — défaut OFF : RIEN en arrière-plan après fermeture
        (invariant v570) ; armé (opt-in) : la veille SR démarre panneau
        fermé, « Adeodat » OUVERT le panneau et stoppe la veille ; sans le
        mot, le panneau reste fermé ; basculer(false) coupe tout.
   SR/TTS/fetch DOUBLÉS (fetch : relais pour les corpus), magasin isolé
   (règle v559). ════════════════════════════════════════════════════════ */
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v574_store_' + Date.now());
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

  /* clé semée (règle v559) + TTS immédiat + SR factice + fetch : relais
     pour tout SAUF /chat/completions (réponse SSE fixe) + toasts captés */
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';
    window.__toasts = [];
    if (typeof window.toast === 'function') {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
    if (typeof ttsEmission === 'function') {
      window.ttsEmission = function (texte, lang, onEnd, onErr) {
        if (typeof onEnd === 'function') setTimeout(onEnd, 5);
        return true;
      };
    }
    window.__srInstances = [];
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      window.__srInstances.push(self);
      this.start = function () { self.__demarre = true; };
      this.stop = function () {};
    };
    localStorage.removeItem('theo_adeodat_v1');
    localStorage.removeItem('theo_adeodat_wake');
    window.__llmReq = null;
    const F0 = window.fetch ? window.fetch.bind(window) : null;
    const enc = s2 => new TextEncoder().encode(s2);
    window.fetch = async function (url, opts) {
      const u = String(url);
      if (u.indexOf('/chat/completions') !== -1) {
        window.__llmReq = JSON.parse(opts.body);
        const parts = [];
        ['Réponse de test Adeodat. '].forEach(function (m) {
          parts.push(enc('data: ' + JSON.stringify({ choices: [{ delta: { content: m } }] }) + '\n\n'));
        });
        parts.push(enc('data: [DONE]\n\n'));
        const plat = [];
        parts.forEach(function (c) { c.forEach(function (b) { plat.push(b); }); });
        const tout = new Uint8Array(plat);
        let lu = false;
        return { ok: true, status: 200, body: { getReader: function () { return { read: async function () { return lu ? { done: true } : (lu = true, { done: false, value: tout }); } }; } } };
      }
      if (F0) return F0(url, opts);
      return { ok: false, status: 404, text: async function () { return ''; } };
    };
  });

  /* ── 1. QR : SVG + modale ── */
  section('1. QR : SVG généré + modale #v574-qr-mod');
  const qrSvg = await page.evaluate(() => window.__v574AdeodatQR ? window.__v574AdeodatQR.svg('https://192.168.1.5:8443/THEOLOGICUS.html', 4) : '');
  ok('window.__v574AdeodatQR.svg produit un SVG', qrSvg.indexOf('<svg') !== -1 && qrSvg.length > 200, 'longueur=' + qrSvg.length);
  await page.evaluate(() => window.__v574AdeodatQR.modal('https://192.168.1.5:8443/THEOLOGICUS.html'));
  const mod = await page.evaluate(() => {
    const m = document.getElementById('v574-qr-mod');
    if (!m) return null;
    return {
      svg: !!m.querySelector('svg'),
      url: m.textContent.indexOf('https://192.168.1.5:8443/THEOLOGICUS.html') !== -1
    };
  });
  ok('la modale QR affiche le code et l\u2019URL HTTPS', !!mod && mod.svg && mod.url, JSON.stringify(mod));
  await page.evaluate(() => {
    const bs = document.querySelectorAll('#v574-qr-mod button');
    for (const b of bs) { if (b.textContent === '✕') { b.click(); break; } }
  });
  const modFermee = await page.evaluate(() => !document.getElementById('v574-qr-mod'));
  ok('la modale QR se ferme', modFermee);

  /* ── 2. app.py : bouton QR dans la bannière (vérification statique) ── */
  section('2. Bannière serveur : bouton « QR » présent dans app.py');
  const appPy = fs.readFileSync(path.join(__dirname, '../../../app.py'), 'utf8');
  ok('app.py : la bannière LAN propose le bouton QR branché sur __v574AdeodatQR',
     appPy.indexOf("__v574AdeodatQR.modal(lan)") !== -1 && appPy.indexOf("qrb.textContent = 'QR'") !== -1);

  /* ── 3. SOURCES : recherche directe sur les corpus réels ── */
  section('3. SOURCES : __v574Chercher sur les corpus réels (indexation au premier appel)');
  const resCh = await page.evaluate(async () => {
    const r = await window.__v574Chercher.chercher('aimer ses ennemis et prier pour ceux qui nous persécutent', 6);
    window.__resChercher = r;
    return r ? {
      n: r.extraits.length,
      bible: r.extraits.filter(x => /^\d+:\d+:\d+$/.test(x.ref)).length,
      ennemi: r.extraits.some(x => /ennemi/i.test(x.texte)),
      blocOk: String(r.bloc || '').indexOf('SOURCES LOCALES') !== -1 && String(r.bloc || '').indexOf('Bible (Segond)') !== -1
    } : null;
  });
  ok('chercher() renvoie des extraits du corpus', !!resCh && resCh.n >= 1, JSON.stringify(resCh));
  ok('au moins un extrait BIBLIQUE avec référence b:c:v', !!resCh && resCh.bible >= 1);
  ok('les extraits parlent bien du sujet (mot « ennemi »)', !!resCh && resCh.ennemi);
  ok('le bloc SOURCES LOCALES est prêt pour l\u2019injection', !!resCh && resCh.blocOk);

  /* ── 4. RAG : envoyer injecte les SOURCES dans les messages du modèle ── */
  section('4. RAG : l\u2019envoi à Adeodat embarque le bloc SOURCES');
  await page.evaluate(() => { window.__llmReq = null; });
  await page.evaluate(() => window.__v564Adeodat.envoyer('que dit la Bible sur aimer ses ennemis ?'));
  await page.waitForFunction(() => !!window.__llmReq, null, { timeout: 30000 });
  const rag = await page.evaluate(() => {
    const msgs = window.__llmReq.messages || [];
    return {
      nMsgs: msgs.length,
      persona: String(msgs[0] && msgs[0].content).indexOf('Adeodat') !== -1,
      sources: msgs.some(m => String(m.content).indexOf('SOURCES LOCALES') !== -1),
      userDernier: msgs[msgs.length - 1] && msgs[msgs.length - 1].role === 'user' &&
                   String(msgs[msgs.length - 1].content).indexOf('ennemis') !== -1
    };
  });
  ok('le prompt persona Adeodat est en tête', rag.persona);
  ok('le bloc SOURCES LOCALES est injecté au modèle', rag.sources);
  ok('la question de l\u2019utilisateur reste le DERNIER message', rag.userDernier);
  const hist1 = await page.evaluate(() => JSON.parse(localStorage.getItem('theo_adeodat_v1') || '[]'));
  ok('la mémoire retient l\u2019échange (2 entrées)', hist1.length === 2, 'n=' + hist1.length);
  const bulleOk = await page.evaluate(() => {
    const tx = document.querySelectorAll('#adeodat-msgs .ad-tx');
    return tx.length >= 2 && String(tx[tx.length - 1].textContent).indexOf('Réponse de test') !== -1;
  });
  ok('la réponse du modèle s\u2019affiche dans la bulle', bulleOk);
  const sousTitre = await page.evaluate(() => (document.getElementById('adeodat-sous') || {}).textContent || '');
  ok('le compteur de mémoire affiche 1 échange', sousTitre.indexOf('mémoire : 1') !== -1, sousTitre);

  /* ── 5. MÉMOIRE : 🧹 Nouveau sujet ── */
  section('5. 🧹 Nouveau sujet : mémoire vidée, accueil, compteur à 0');
  await page.evaluate(() => {
    const b = document.getElementById('adeodat-neuf');
    if (b) b.click();
  });
  await page.waitForTimeout(150);
  const neuf = await page.evaluate(() => ({
    hist: JSON.parse(localStorage.getItem('theo_adeodat_v1') || '[]').length,
    accueil: (document.querySelector('#adeodat-msgs .ad-tx') || {}).textContent || '',
    sous: (document.getElementById('adeodat-sous') || {}).textContent || ''
  }));
  ok('la mémoire est vidée', neuf.hist === 0, 'n=' + neuf.hist);
  ok('la bulle d\u2019accueil « Nouveau sujet » s\u2019affiche', neuf.accueil.indexOf('Nouveau sujet') !== -1, neuf.accueil.slice(0, 60));
  ok('le compteur passe à 0', neuf.sous.indexOf('mémoire : 0') !== -1, neuf.sous);

  /* ── 6. MOT D'ÉVEIL : défaut OFF = RIEN en arrière-plan ── */
  section('6. Mot d\u2019éveil OFF (défaut) : aucune veille après fermeture (invariant v570)');
  await page.evaluate(() => window.__v564Adeodat.fermer());
  const srAvant = await page.evaluate(() => window.__srInstances.length);
  await page.waitForTimeout(1400);
  const inv = await page.evaluate(() => ({
    veille: window.__v574Wake.veilleActive(),
    n: window.__srInstances.length
  }));
  ok('aucune veille active (défaut OFF)', inv.veille === false && inv.n === srAvant,
     'veille=' + inv.veille + ' sr=' + inv.n + '(avant ' + srAvant + ')');

  /* ── 7. Mot d'éveil armé : la veille SR démarre panneau fermé ── */
  section('7. Mot d\u2019éveil ARMÉ (opt-in) : veille SR panneau fermé');
  await page.evaluate(() => {
    localStorage.setItem('theo_adeodat_wake', '1');
    window.__v574Wake.panFerme();
  });
  await page.waitForFunction(() => window.__srInstances.length > 0, null, { timeout: 6000 });
  const arme = await page.evaluate(() => ({
    veille: window.__v574Wake.veilleActive(),
    orbe: document.getElementById('adeodat-orbe').classList.contains('veille')
  }));
  ok('la veille SR est active (panneau fermé)', arme.veille === true);
  ok('l\u2019orbe signale la veille (halo pulsé)', arme.orbe === true);

  /* ── 8. « Adeodat » entendu → panneau ouvert + veille stoppée ── */
  section('8. « Adeodat » entendu : le panneau S\u2019OUVRE, veille stoppée');
  await page.evaluate(() => {
    const inst = window.__srInstances[window.__srInstances.length - 1];
    inst.onresult({ results: [{ isFinal: true, 0: { transcript: 'euh… Adeodat' } }] });
  });
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex';
  }, null, { timeout: 6000 });
  const ouvert = await page.evaluate(() => ({
    veille: window.__v574Wake.veilleActive(),
    orbe: document.getElementById('adeodat-orbe').classList.contains('veille')
  }));
  ok('le panneau Adeodat est ouvert par la voix', true);
  ok('la veille s\u2019est arrêtée (le panneau prend le relais)', ouvert.veille === false && ouvert.orbe === false);

  /* ── 9. Sans le mot : panneau fermé, veille poursuit ── */
  section('9. Phrase SANS le mot : panneau reste fermé');
  await page.evaluate(() => {
    window.__v564Adeodat.fermer();
    window.__v574Wake.panFerme();
  });
  await page.waitForFunction(() => window.__srInstances.length >= 2, null, { timeout: 6000 });
  await page.evaluate(() => {
    const inst = window.__srInstances[window.__srInstances.length - 1];
    inst.onresult({ results: [{ isFinal: true, 0: { transcript: 'bonjour tout le monde' } }] });
  });
  await page.waitForTimeout(900);
  const sans = await page.evaluate(() => ({
    ouverte: (document.getElementById('adeodat-pan') || {}).style.display === 'flex',
    veille: window.__v574Wake.veilleActive()
  }));
  ok('le panneau n\u2019s\u2019ouvre PAS sans le mot d\u2019éveil', sans.ouverte === false);
  ok('la veille continue d\u2019écouter', sans.veille === true);

  /* ── 10. Toggle OFF : plus rien en arrière-plan ── */
  section('10. basculer(false) : tout s\u2019arrête');
  await page.evaluate(() => window.__v574Wake.basculer(false));
  await page.waitForTimeout(200);
  const off = await page.evaluate(() => ({
    veille: window.__v574Wake.veilleActive(),
    cle: localStorage.getItem('theo_adeodat_wake'),
    orbe: document.getElementById('adeodat-orbe').classList.contains('veille')
  }));
  ok('la veille est coupée', off.veille === false && off.cle === '0' && off.orbe === false);

  /* ── propreté ── */
  section('11. Propreté');
  ok('aucune erreur JavaScript', bruit.length === 0, bruit.slice(0, 2).join(' | '));

  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}

  const bons = resultats.filter(r => r.pass).length;
  console.log('\n========================================================================');
  console.log('RESULTAT : ' + bons + '/' + resultats.length);
  if (bons !== resultats.length) {
    console.log('Échecs :');
    resultats.filter(r => !r.pass).forEach(r => console.log('  - ' + r.label));
    process.exit(1);
  }
})().catch(e => { console.error('EXCEPTION :', e); process.exit(2); });
