/* ═══════════════════════════════════════════════════════════════════════
   Banc v556 — 📱 PUBLIER (Facebook / TikTok) : texte + vidéo, e2e.

   Vérifie :
     1. API __v556Publier + publierMsg présentes ; shareToFacebook recadré
        (ouvre le dialogue ; l'ancien sharer « quote= » mort est parti).
     2. Chemin message réel : state.messages + renderMessages() → le bouton
        📱 PUBLIER existe dans .msg-actions → clic → dialogue rempli avec
        le texte du message.
     3. Onglets Facebook/TikTok : reformat (TikTok = 2 phrases ≤ 150 + tags),
        compteur avec limites réelles (63 206 / 2 200), édition conservée
        d'un onglet à l'autre, alerte rouge au dépassement.
     4. 📋 Copier → presse-papiers (permissions accordées, lecture vérifiée).
     5. 🌐 Ouvrir Facebook → https://www.facebook.com/ (composeur ; le
        sharer quote= est mort) ; 🌐 Ouvrir TikTok → tiktok.com (texte)
        ou /upload (vidéo) — window.open DOUBLÉ (enregistreur).
     6. Mode vidéo : ⬇ appelle downloadVideoEntry(videoId) du studio
        (srcWin) ; dialogue rempli depuis une vidéo.
     7. Échap ferme + focus restitué.
     8. E2E iframe : galerie du studio servie par le relais, semée d'une
        entrée de test → clic sur le 📱 Publier de la CARTE → le dialogue
        du PARENT s'ouvre en mode vidéo avec l'id → ⬇ du parent → le
        downloadVideoEntry du STUDIO (doublé) reçoit l'id.

   Aucune requête réseau vers Facebook/TikTok (window.open doublé).
   ═══════════════════════════════════════════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');

const MODALES = ['v556-pub-fermer', 'v556-pub-txt', 'v556-pub-copy', 'v556-pub-fb', 'v556-pub-tt', 'v556-pub-dl'];

const resultats = [];
function section(t) { console.log('\n■ ' + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + port });
  const page = await ctx.newPage();
  const bruit = [];
  page.on('console', msg => { if (msg.type() === 'error') bruit.push(msg.text()); });
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* ── 1. API ── */
  section('1. API du dialogue PUBLIER');
  ok('__v556Publier exposé (open/fermer/format)',
     await page.evaluate(() => {
       const p = window.__v556Publier;
       return !!p && typeof p.open === 'function' && typeof p.fermer === 'function' && typeof p.format === 'function';
     }));
  ok('publierMsg exposé (chemin conversation)',
     await page.evaluate(() => typeof window.publierMsg === 'function'));
  ok('l\'ancien sharer « quote= » (mort) a disparu du partage Facebook',
     await page.evaluate(() => String(window.shareToFacebook).indexOf('sharer.php') === -1));

  /* ── 2. chemin message réel ── */
  section('2. Depuis une conversation : bouton 📱 PUBLIER');
  const injecte = await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.messages = [{ ts: 1, role: 'assistant', content: 'Coran 2:255 — Ayat al-Kursi. Dieu, nulle divinité que Lui, le Vivant, l\'Existant.' }];
    renderMessages();
    const rang = document.querySelector('.msg-actions');
    return { bouton: rang ? (rang.innerHTML.indexOf('publierMsg(1)') !== -1) : false };
  });
  ok('la rangée d\'actions du message porte le bouton PUBLIER (publierMsg)', injecte.bouton);
  await page.evaluate(() => document.querySelector('.msg-actions [onclick*="publierMsg(1)"]').click());
  await page.waitForFunction(() => {
    const m = document.getElementById('v556-publier-modal');
    return m && m.style.display === 'flex';
  }, { timeout: 8000 });
  const rempli = await page.evaluate(() => ({
    titre: document.getElementById('v556-pub-titre').textContent,
    texte: document.getElementById('v556-pub-txt').value
  }));
  ok('le clic sur PUBLIER ouvre le dialogue', rempli.titre.indexOf('Publier') !== -1, rempli.titre);
  ok('le texte du MESSAGE est dans la zone (prérempli)', rempli.texte.indexOf('Ayat al-Kursi') !== -1,
     '« ' + rempli.texte.slice(0, 50) + '… »');

  /* ── 3. onglets + compteurs ── */
  section('3. Onglets Facebook / TikTok : format + limites réelles');
  const etatFb = await page.evaluate(() => ({
    cnt: document.getElementById('v556-pub-cnt').textContent,
    tags: document.getElementById('v556-pub-txt').value.indexOf('#THEOLOGICUS') !== -1,
    source: document.getElementById('v556-pub-txt').value.indexOf('— Source : THEOLOGICUS AI ⛪') !== -1
  }));
  ok('onglet Facebook actif par défaut : compteur sur 63 206', etatFb.cnt.indexOf('63206') !== -1, etatFb.cnt);
  ok('format Facebook : signature + hashtags du partage', etatFb.source && etatFb.tags);
  await page.click('#v556-pub-tab-tt');
  const etatTt = await page.evaluate(() => ({
    cnt: document.getElementById('v556-pub-cnt').textContent,
    longueur: document.getElementById('v556-pub-txt').value.length,
    texte: document.getElementById('v556-pub-txt').value
  }));
  ok('onglet TikTok : compteur sur 2 200', etatTt.cnt.indexOf('2200') !== -1, etatTt.cnt);
  ok('format TikTok : texte COURT (≤ ~170 car) + hashtags', etatTt.longueur <= 170 && etatTt.texte.indexOf('#THEOLOGICUS') !== -1,
     'longueur=' + etatTt.longueur);
  ok('le format TikTok garde le cœur du message (Ayat al-Kursi)', etatTt.texte.indexOf('Ayat al-Kursi') !== -1);

  /* ── 4. édition conservée + dépassement rouge ── */
  section('4. Édition conservée + alerte de dépassement');
  await page.evaluate(() => {
    const t = document.getElementById('v556-pub-txt');
    t.value = 'Ma légende personnalisée pour TikTok';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#v556-pub-tab-fb');
  await page.click('#v556-pub-tab-tt');
  const garde = await page.evaluate(() => document.getElementById('v556-pub-txt').value);
  ok('l\'édition TikTok survive aux allers-retours d\'onglets', garde === 'Ma légende personnalisée pour TikTok', garde.slice(0, 30));
  await page.evaluate(() => {
    const t = document.getElementById('v556-pub-txt');
    t.value = 'x'.repeat(2400);
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const depasse = await page.evaluate(() => ({
    couleur: document.getElementById('v556-pub-cnt').style.color,
    texte: document.getElementById('v556-pub-cnt').textContent
  }));
  ok('dépassement 2 400 > 2 200 signalé en ROUGE', depasse.couleur.indexOf('255, 82, 82') !== -1, depasse.texte);

  /* ── 5. copier ── */
  section('5. 📋 Copier le texte');
  await page.click('#v556-pub-copy');
  await page.waitForTimeout(400);
  const presse = await page.evaluate(() => navigator.clipboard.readText());
  ok('le presse-papiers contient le texte de la zone', presse === 'x'.repeat(2400), 'longueur=' + presse.length);

  /* ── 6. ouverture des plateformes (window.open doublé) ── */
  section('6. 🌐 Ouverture des pages de publication (window.open doublé)');
  const ouverts = await page.evaluate(() => {
    window.__ouverts = [];
    window.open = (u) => { window.__ouverts.push(u); return null; };
    document.getElementById('v556-pub-fb').click();
    document.getElementById('v556-pub-tt').click();
    return window.__ouverts.slice();
  });
  ok('Facebook → composeur facebook.com (plus le sharer mort)',
     ouverts[0] === 'https://www.facebook.com/', ouverts[0]);
  ok('TikTok (texte) → tiktok.com', ouverts[1] === 'https://www.tiktok.com/', ouverts[1]);

  /* ── 7. mode vidéo : ⬇ → downloadVideoEntry du studio ── */
  section('7. Mode vidéo : dialogue alimenté par une vidéo');
  await page.evaluate(() => {
    window.downloadVideoEntry = (id) => { window.__dlRecu = id; };   // doublure
    window.__v556Publier.open({
      mode: 'video', plateforme: 'tiktok', titre: 'Publier la vidéo — Essai',
      texte: 'Une vidéo de test', videoId: 'vidTEST', videoLabel: 'Essai', srcWin: window
    });
  });
  await page.waitForFunction(() => document.getElementById('v556-publier-modal').style.display === 'flex', { timeout: 5000 });
  const videoUi = await page.evaluate(() => ({
    dlVisible: document.getElementById('v556-pub-dl').style.display !== 'none',
    titre: document.getElementById('v556-pub-titre').textContent
  }));
  ok('⬇ Télécharger la vidéo est AFFICHÉ en mode vidéo', videoUi.dlVisible, videoUi.titre);
  await page.click('#v556-pub-dl');
  const dlRecu = await page.evaluate(() => window.__dlRecu);
  ok('⬇ appelle downloadVideoEntry(videoId) du studio', dlRecu === 'vidTEST', 'reçu=' + dlRecu);
  await page.click('#v556-pub-tt');
  const ttVideo = await page.evaluate(() => window.__ouverts[window.__ouverts.length - 1]);
  ok('TikTok (vidéo) → page de MISE EN LIGNE /upload', ttVideo === 'https://www.tiktok.com/upload', ttVideo);

  /* ── 8. Échap + focus ── */
  section('8. Fermeture Échap + restitution du focus');
  const escOk = await page.evaluate(() => {
    const btn = document.getElementById('open-presets') || document.querySelector('.hud-btn');
    btn.focus();
    const avant = document.activeElement;
    document.getElementById('v556-publier-modal').style.display = 'none'; // simule l'état avant test propre
    window.__v556Publier.open({ titre: 'Esc', texte: 'essai', mode: 'texte' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return {
      ferme: document.getElementById('v556-publier-modal').style.display === 'none',
      focusRendu: document.activeElement === avant
    };
  });
  ok('Échap ferme le dialogue', escOk.ferme);
  ok('le focus est RESTITUÉ à l\'élément d\'origine', escOk.focusRendu);

  /* ── 9. E2E iframe : carte du studio → dialogue du parent ── */
  section('9. E2E AI VIDEO (iframe) : carte 📱 Publier → dialogue du parent');
  const cadre = await (async () => {
    const el = await page.$('#aivideo-frame');
    const fr = await el.contentFrame();
    if (!fr) return null;
    await fr.waitForFunction(() => /AI VIDEO/i.test(document.title), { timeout: 20000 }).catch(() => {});
    return fr;
  })();
  if (!cadre) {
    ok('l\'iframe AI VIDEO est chargée', false, 'frame introuvable');
  } else {
    const semee = await cadre.evaluate(() => {
      try {
        /* v556 note : la galerie est servie par un MIROIR IndexedDB qui
           écrase loadGallery/saveGallery — l'amorçage localStorage brut est
           mort. On passe par l'API du studio elle-même. */
        saveGallery([{
          id: 'vidXYZ', label: 'Banc publier', url: '', timestamp: Date.now(),
          size: 1234, durationSec: 5, model: 'banc', prompt: 'Légende de test pour le banc v556'
        }]);
        renderGallery();
        return { cartes: document.querySelectorAll('[data-vc-publish]').length };
      } catch (e) { return { erreur: String(e) }; }
    });
    ok('la galerie semée rend un bouton 📱 Publier par carte', semee.cartes >= 1, 'cartes=' + semee.cartes);
    await cadre.evaluate(() => {
      window.downloadVideoEntry = (id) => { window.__dlRecu = id; };   // doublure dans le studio
      document.querySelector('[data-vc-publish]').click();
    });
    await page.waitForFunction(() => {
      const m = document.getElementById('v556-publier-modal');
      return m && m.style.display === 'flex';
    }, { timeout: 8000 });
    const pubUi = await page.evaluate(() => ({
      titre: document.getElementById('v556-pub-titre').textContent,
      dlVisible: document.getElementById('v556-pub-dl').style.display !== 'none',
      texte: document.getElementById('v556-pub-txt').value
    }));
    ok('le clic CARTE ouvre le dialogue du PARENT en mode vidéo', pubUi.dlVisible && pubUi.titre.indexOf('Banc publier') !== -1, pubUi.titre);
    ok('la légende de la vidéo (prompt) préremplit le texte', pubUi.texte.indexOf('Légende de test') !== -1, pubUi.texte.slice(0, 40));
    await page.click('#v556-pub-dl');
    const dlStudio = await cadre.evaluate(() => window.__dlRecu);
    ok('⬇ du parent déclenche le downloadVideoEntry du STUDIO', dlStudio === 'vidXYZ', 'reçu=' + dlStudio);
    await page.evaluate(() => { const m = document.getElementById('v556-publier-modal'); if (m) m.style.display = 'none'; });
  }

  /* ── 10. propreté ── */
  section('10. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|social|facebook|tiktok/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
