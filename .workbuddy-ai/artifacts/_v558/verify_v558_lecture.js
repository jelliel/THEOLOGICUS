/* ═══════════════════════════════════════════════════════════════════════
   Banc v558 — MODE LECTURE v191/v192/v193 (A−/A+, favoris/historique, ✨ IA)

   Vérifie (corpus réel servi par le relais, panneau Coran 2:255 + Bible) :
     1. v191 : contrôles A−/A+/⭐ injectés dans les en-têtes des panneaux
        (injection différée 700 ms — on ATTEND la condition).
     2. Taille de police PERSISTANTE : localStorage theo_panel_font + var
        CSS --panel-fs suivent les clics ; clamp documenté 10..20.
     3. v192 historique : wrapOpen enregistre 'Coran 2:255' (open quran)
        sans doublon consécutif.
     4. v192 favori ⭐ : markKey réel ('v183#2:255') → theo_favorites_v1
        avec label + open ; re-clic → pas de doublon.
     5. Cycle complet : le favori ⭐ s'ouvre depuis l'onglet ⭐ de la
        feuille d'étude (panneau Coran ré-ouvert).
     6. v193 ✨ IA : SANS clé (magasin isolé) → garde, zéro réseau ; AVEC clé
        semée + fetch INTERCEPTÉ → l'appel part vers chat/completions
        (wiring prouvé sans aucune requête réelle), échec → bouton intact.
     7. v193 ✨ IA avec CACHE semé (djb2 recalculé sur le sn réel du DOM) :
        rendu immédiat de la traduction (✨ div) sans fetch.
     8. Bible : contrôles + favori ('Bible Jean 3:16').
   Traduction IA RÉELLE (réseau LLM) hors scope CI — hypothèse explicite.
   ═══════════════════════════════════════════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');

const resultats = [];
function section(t) { console.log('\n■ ' + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

(async () => {
  const port = await H.pickFreePort();
  /* v558-CI — magasin ISOLÉ (comme _v536/_v538) : sans localAppData, le relais
     sert le vrai magasin %LOCALAPPDATA% — sur la machine de dev, la config
     modèle RÉELLE (clé Mistral) fuyait dans le banc et le clic ✨ partait en
     vrai appel authentifié ! En CI le magasin est vide → comportement opposé.
     Un banc doit TOUJOURS isoler le magasin pour être déterministe. */
  const os = require('os'), pathM = require('path'), fsM = require('fs');
  const STORE_DIR = pathM.join(os.tmpdir(), 'theo_v558_store_' + Date.now());
  try { fsM.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const bruit = [];
  page.on('console', m => { if (m.type() === 'error') bruit.push(m.text()); });
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* ── 1. contrôles d'en-tête ── */
  section('1. v191 : contrôles A−/A+/⭐ dans l\'en-tête du panneau Coran');
  await page.evaluate(() => window.__v183Open(2, 255));
  await page.waitForFunction(() => {
    const h = document.getElementById('v183-head');
    return h && h.querySelector('.v191-ctrl button[data-fs="+"]');
  }, { timeout: 15000 });
  const ctrls = await page.evaluate(() => {
    const c = document.querySelector('#v183-head .v191-ctrl');
    return { moins: !!c.querySelector('button[data-fs="-"]'),
             plus: !!c.querySelector('button[data-fs="+"]'),
             fav: !!c.querySelector('.v192-fav') };
  });
  ok('A−, A+ et ⭐ sont injectés (injection différée attendue)', ctrls.moins && ctrls.plus && ctrls.fav);

  /* ── 2. taille de police persistante + clamp ── */
  section('2. Taille de police : persistée + clamp 10..20');
  const fs0 = await page.evaluate(() => ({
    ls: +(localStorage.getItem('theo_panel_font') || 12.5),
    css: getComputedStyle(document.documentElement).getPropertyValue('--panel-fs').trim()
  }));
  await page.click('#v183-head .v191-ctrl button[data-fs="+"]');
  const fs1 = await page.evaluate(() => ({
    ls: +(localStorage.getItem('theo_panel_font') || 12.5),
    css: getComputedStyle(document.documentElement).getPropertyValue('--panel-fs').trim()
  }));
  ok('A+ augmente ET persiste (localStorage + var CSS)', fs1.ls === fs0.ls + 1 && fs1.css === (fs0.ls + 1) + 'px',
     fs0.ls + ' → ' + fs1.ls + ' | css=' + fs1.css);
  await page.click('#v183-head .v191-ctrl button[data-fs="-"]');
  const fs2 = await page.evaluate(() => +(localStorage.getItem('theo_panel_font') || 12.5));
  ok('A− redescend', fs2 === fs0.ls, fs1.ls + ' → ' + fs2);
  const clamp = await page.evaluate(async () => {
    localStorage.setItem('theo_panel_font', '20');
    document.querySelector('#v183-head .v191-ctrl button[data-fs="+"]').click();
    const haut = +(localStorage.getItem('theo_panel_font') || 0);
    localStorage.setItem('theo_panel_font', '10');
    document.querySelector('#v183-head .v191-ctrl button[data-fs="-"]').click();
    const bas = +(localStorage.getItem('theo_panel_font') || 0);
    localStorage.setItem('theo_panel_font', '12.5');
    document.querySelector('#v183-head .v191-ctrl button[data-fs="+"]').click(); // remettre un état propre
    return { haut, bas };
  });
  ok('clamp haut 20 et clamp bas 10 respectés', clamp.haut === 20 && clamp.bas === 10,
     'haut=' + clamp.haut + ' bas=' + clamp.bas);

  /* ── 3. historique ── */
  section('3. v192 : historique d\'ouverture (wrapOpen)');
  const hist1 = await page.evaluate(() => JSON.parse(localStorage.getItem('theo_history_v1') || '[]'));
  ok('l\'ouverture de 2:255 est tracée en tête', hist1.length && hist1[0].label === 'Coran 2:255',
     hist1.length ? hist1[0].label : '(vide)');
  ok('l\'entrée porte les données de réouverture quran',
     hist1.length && hist1[0].open && hist1[0].open.kind === 'quran' && hist1[0].open.s === 2 && hist1[0].open.v1 === 255,
     JSON.stringify(hist1.length ? hist1[0].open : null));
  await page.evaluate(() => window.__v183Open(2, 255));
  await page.waitForTimeout(900);
  const hist2 = await page.evaluate(() => JSON.parse(localStorage.getItem('theo_history_v1') || '[]'));
  const memes = hist2.filter(e => e.label === 'Coran 2:255').length;
  ok('réouverture immédiate du MÊME passage : pas de doublon consécutif', memes === 1, 'entrées 2:255=' + memes);

  /* ── 4. favori ⭐ ── */
  section('4. v192 : favori ⭐ (markKey réel)');
  const mk = await page.evaluate(() => {
    const pat = document.querySelector('#v183-pat');
    return { key: pat && pat.dataset.markKey };
  });
  ok('le panneau porte son markKey', mk.key === 'v183#2:255', mk.key);
  const avant = await page.evaluate(() => JSON.parse(localStorage.getItem('theo_favorites_v1') || '[]')).catch(() => []);
  await page.click('#v183-head .v192-fav');
  const apres = await page.evaluate(() => JSON.parse(localStorage.getItem('theo_favorites_v1') || '[]'));
  ok('⭐ ajoute le favori', apres.length === avant.length + 1, (avant.length) + ' → ' + apres.length);
  const fav = apres[0] || {};
  ok('le favori porte label + réouverture quran',
     fav.label === 'Coran 2:255' && fav.open && fav.open.kind === 'quran' && fav.open.s === 2 && fav.open.v1 === 255,
     JSON.stringify(fav.label) + ' / ' + JSON.stringify(fav.open));
  await page.click('#v183-head .v192-fav');
  const apres2 = await page.evaluate(() => JSON.parse(localStorage.getItem('theo_favorites_v1') || '[]'));
  ok('second ⭐ : pas de doublon (« déjà dans les favoris »)', apres2.length === apres.length, apres.length + ' (stable)');

  /* ── 5. cycle complet : le favori ⭐ s'ouvre depuis la feuille d'étude ── */
  section('5. Le favori ⭐ s\'ouvre depuis l\'onglet ⭐ Favoris (v189)');
  await page.evaluate(() => {
    const p = document.getElementById('v183-pat');
    if (p) p.classList.remove('open');       // fermer le panneau d'abord
  });
  // ouvrir la feuille d'étude par le chemin réel : menu ⋯ → 🧺 ÉTUDE
  // (l'item peut être hors du viewport selon la hauteur de fenêtre —
  //  précondition d'affichage affirmée, puis clic programmatique, le
  //  même geste que l'exécution palette v535).
  await page.click('#v6-right-grp button[title="Plus d actions"]');
  await page.waitForTimeout(250);
  const etudePret = await page.evaluate(() => {
    const b = document.getElementById('open-etude-modal');
    if (!b || b.offsetParent === null) return false;
    b.click();
    return true;
  });
  ok('🧺 ÉTUDE affiché dans le menu ⋯ et cliquable', etudePret);
  await page.waitForFunction(() => document.getElementById('v189-pan') && document.getElementById('v189-pan').classList.contains('open'), { timeout: 8000 });
  // onglet ⭐ Favoris (sélecteur réel : #v189-tabs button[data-v="fav"])
  const ongletOk = await page.evaluate(() => {
    const t = document.querySelector('#v189-tabs button[data-v="fav"]');
    if (!t) return null;
    t.click();
    return t.textContent.trim();
  });
  ok('l\'onglet ⭐ Favoris de la feuille existe', !!ongletOk, ongletOk || 'introuvable');
  const cycle = await page.evaluate(() => {
    const favs = JSON.parse(localStorage.getItem('theo_favorites_v1') || '[]');
    const f = favs.find(x => x.label === 'Coran 2:255');
    if (!f) return { trouve: false };
    const btn = document.querySelector('#v189-body [data-open="' + f.id + '"]');
    if (!btn) return { trouve: true, bouton: false };
    btn.click();
    return { trouve: true, bouton: true };
  });
  await page.waitForFunction(() => {
    const p = document.getElementById('v183-pat');
    return p && p.classList.contains('open');
  }, { timeout: 8000 }).catch(() => {});
  const ouvert = await page.evaluate(() => {
    const p = document.getElementById('v183-pat');
    return { open: p && p.classList.contains('open'), titre: (document.getElementById('v183-title') || {}).textContent || '' };
  });
  ok('le favori ⭐ rouvre le panneau Coran 2:255 (« 📖 Ouvrir » réel)',
     cycle.trouve && cycle.bouton && ouvert.open && /2\s*:\s*255/.test(ouvert.titre),
     'trouvé=' + cycle.trouve + ' bouton=' + cycle.bouton + ' ouvert=' + ouvert.open + ' titre=' + ouvert.titre);
  await page.evaluate(() => { const p = document.getElementById('v189-pan'); if (p) p.classList.remove('open'); });

  /* ── 6. ✨ IA : wiring réseau réel + récupération d'échec ── */
  section('6. v193 : ✨ IA — sans clé (garde) puis avec clé semée (wiring)');
  const ai = await page.evaluate(() => {
    const btns = document.querySelectorAll('#v183-body .v193-ai');
    return { n: btns.length };
  });
  ok('des boutons ✨ IA sont injectés sur les textes longs (≥ 400 car)', ai.n >= 1, 'n=' + ai.n);
  /* a) magasin isolé = AUCUNE clé configurée → garde, zéro réseau */
  const sansCle = await page.evaluate(() => {
    window.__fetchUrls = [];
    const vraiFetch = window.fetch;
    window.fetch = function (u) { window.__fetchUrls.push(String(u)); return vraiFetch.apply(this, arguments); };
    document.querySelector('#v183-body .v193-ai').click();
    return new Promise(res => setTimeout(() => {
      const llm = window.__fetchUrls.filter(u => /chat\/completions|responses/i.test(u));
      res({ llm: llm.length, urls: window.__fetchUrls.slice(),
            boutonIntact: !!document.querySelector('#v183-body .v193-ai') });
    }, 600));
  });
  ok('sans clé (magasin isolé) : AUCUNE requête LLM (garde « non configurée »)',
     sansCle.llm === 0, 'urls=' + JSON.stringify(sansCle.urls.slice(0, 3)));
  ok('le bouton ✨ reste intact (pas de remplacement)', sansCle.boutonIntact);
  /* b) clé factice semée + fetch INTERCEPTÉ (rejet immédiat — zéro réseau) :
     l'appel doit partir vers l'endpoint standard chat/completions. */
  const avecCle = await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    /* forme PRÉFIXÉE exigée par _providerModelId (« provider:model ») — un nom
       nu renvoie null et retombe dans la garde. Clé du fournisseur semée. */
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';
    window.__fetchUrls = [];
    window.fetch = function (u, o) {
      window.__fetchUrls.push(String(u) + '|' + ((o && o.method) || 'GET'));
      return Promise.reject(new Error('banc — réseau volontairement coupé'));
    };
    const btn = Array.from(document.querySelectorAll('#v183-body .v193-ai'))
      .find(x => !x.dataset.busy) || document.querySelector('#v183-body .v193-ai');
    btn.click();
    return new Promise(res => setTimeout(() => {
      const llm = window.__fetchUrls.filter(u => /chat\/completions/.test(u));
      res({ llmUrl: llm[0] || '', boutonIntact: !!document.querySelector('#v183-body .v193-ai') });
    }, 500));
  });
  ok('avec clé semée : l\'appel part vers chat/completions (wiring prouvé, réseau coupé)',
     /chat\/completions/.test(avecCle.llmUrl), avecCle.llmUrl || '(aucun)');
  ok('l\'échec réseau intercepté laisse le bouton ✨ intact', avecCle.boutonIntact);

  /* ── 7. ✨ IA avec cache : rendu immédiat sans réseau ── */
  section('7. v193 : ✨ IA avec cache semé — traduction instantanée sans fetch');
  const cacheOk = await page.evaluate(() => {
    /* le bouton ✨ ne porte PAS dataset.sn : le sn vit sur le bouton source
       .v167-tr[data-sn] juste avant lui (insertAdjacentElement('afterend')).
       On prend un ✨ NON occupé (le clic précédent peut laisser busy si le
       proxy met du temps à répondre). */
    const btn = Array.from(document.querySelectorAll('#v183-body .v193-ai'))
      .find(x => !x.dataset.busy);
    if (!btn) return { ok: false, raison: 'aucun ✨ libre' };
    const src = btn.previousElementSibling;
    const sn = (src && src.dataset && src.dataset.sn) || '';
    if (sn.length < 400) return { ok: false, raison: 'sn source introuvable' };
    let h = 5381;                                   // djb2 — même algo que le module
    for (let i = 0; i < sn.length; i++) h = ((h << 5) + h + sn.charCodeAt(i)) | 0;
    const c = JSON.parse(localStorage.getItem('theo_v193_ai') || '{}');
    c['ai' + h] = 'TRADUCTION DE BANC — texte en français pour le banc v558.';
    localStorage.setItem('theo_v193_ai', JSON.stringify(c));
    window.__fetchUrls = [];
    btn.click();
    return new Promise(res => setTimeout(() => {
      const div = document.querySelector('#v183-body .v193-aidiv');
      const llm = window.__fetchUrls.filter(u => /chat\/completions|responses/i.test(u));
      res({ ok: true, rendu: !!div && div.textContent.indexOf('TRADUCTION DE BANC') !== -1,
            llm: llm.length });
    }, 600));
  });
  ok('le cache rend la traduction immédiatement (✨ div)', cacheOk.ok && cacheOk.rendu,
     cacheOk.raison || '');
  ok('le rendu du cache ne fait AUCUNE requête LLM', cacheOk.llm === 0, 'llm=' + cacheOk.llm);

  /* ── 8. Bible : contrôles + routage du favori (correctif v558) ── */
  section('8. Bible (v167) : contrôles + ⭐ route vers le BON panneau');
  await page.evaluate(() => window.__v167OpenPanel('Jean 3:16'));
  await page.waitForFunction(() => {
    const h = document.getElementById('v167-head');
    return h && h.querySelector('.v191-ctrl');
  }, { timeout: 15000 });
  const garde = await page.evaluate(() => {
    /* En profil isolé CI l'index Pères n'est PAS prêt → le module ne pose
       PAS markKey sur #v167-pat (contrat : épinglage lié à l'indexation).
       Le ⭐ doit alors refuser HONNÊTEMENT sans rien casser. */
    const pat = document.querySelector('#v167-pat');
    const avantN = JSON.parse(localStorage.getItem('theo_favorites_v1') || '[]').length;
    document.querySelector('#v167-head .v192-fav').click();
    const midN = JSON.parse(localStorage.getItem('theo_favorites_v1') || '[]').length;
    /* CORRECTIF v558 vérifié : markKey posé manuellement (état « index prêt »
       que les vrais utilisateurs ont après construction), le ⭐ du PANNEAU
       BIBLE épingle le passage BIBLE — même avec le panneau Coran présent
       dans le DOM (avant, querySelector renvoyait toujours le Coran). */
    pat.dataset.markKey = 'v167#Jean 3:16';
    document.querySelector('#v167-head .v192-fav').click();
    const favs = JSON.parse(localStorage.getItem('theo_favorites_v1') || '[]');
    return { sansIndexOk: midN === avantN, apresN: favs.length, fav: favs[0] || {} };
  });
  ok('sans index Pères : le ⭐ refuse honnêtement (aucun favori parasite)', garde.sansIndexOk);
  ok('le ⭐ du panneau BIBLE épingle le passage BIBLE (correctif v558)',
     garde.apresN >= 1 && /Bible Jean 3:16/.test(garde.fav.label || ''),
     'label=' + (garde.fav.label || ''));

  /* ── 9. propreté ── */
  section('9. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|facebook|tiktok|social/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
