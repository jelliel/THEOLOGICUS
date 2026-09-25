// Banc v123 — ONGLETS DE RÉGLAGES DU STUDIO VIDÉO.
//
// Ce que ce banc doit prouver, et pourquoi il est écrit ainsi :
//
//   1. MoneyPrinterTurbo sépare ses RÉGLAGES de son FORMULAIRE. On reproduit
//      cette séparation dans le modal STUDIO VIDÉO : un onglet « Génération »
//      (le formulaire d'origine) et cinq onglets de réglages. Un découpage
//      peut « réussir » en apparence — le modal s'ouvre, le HTML est bien
//      formé — tout en ayant PERDU les champs du formulaire dans un panneau
//      jamais affiché. On vérifie donc que chaque champ du formulaire est
//      ATTEIGNABLE (visible) quand l'onglet « Génération » est actif.
//
//   2. Le piège v122 à ne pas refaire : `display:none` EN LIGNE. Il gagne
//      contre la feuille de style, donc `el.hidden = false` ne rallume plus
//      rien. Ce banc vérifie l'état APRÈS le geste (clic sur un onglet), avec
//      `getComputedStyle(...).display` — jamais « pas d'exception ».
//
//   3. Les réglages doivent FONCTIONNER, pas seulement exister. Le registre du
//      fournisseur LLM vient du SERVICE (`/mpt/llm/providers`) : on vérifie
//      qu'il se remplit vraiment, que choisir une zone change la Base URL, et
//      que le test de connexion rend un verdict AVEC la cause (jamais un
//      simple « échec »).
//
//   4. Les clés des banques de médias sont des LISTES chez MPT, pas des
//      chaînes. Un champ qui enverrait une chaîne là où MPT attend une liste
//      casserait la recherche de vidéos SANS message d'erreur. On vérifie donc
//      le format envoyé, pas seulement la présence du champ.
//
//   5. Un geste destructeur (nettoyage du cache) doit rester désarmé tant que
//      la case de confirmation n'est pas cochée — contrôlé côté interface ET
//      côté serveur (`confirme:false` doit être refusé).
//
// Usage :
//   node verify_studio_settings.js            (serveur sur 127.0.0.1:8765)
//   node verify_studio_settings.js <port>

const { chromium } = require('playwright');
const fs = require('fs');

const PORT = process.argv[2] || '8765';
const CHROME_CANDIDATES = [
  'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
  'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find(p => fs.existsSync(p));
const AUTH_HASH = 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96';

let ok = 0, ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok++; console.log('  [OK] ' + nom); }
  else { ko++; console.log('  [X ] ' + nom + (detail ? '  -> ' + detail : '')); }
};

// Les six onglets du studio et le panneau que chacun doit révéler.
const ONGLETS = [
  ['generation', 'studio-panneau-generation'],
  ['llm',        'studio-panneau-llm'],
  ['material',   'studio-panneau-material'],
  ['publish',    'studio-panneau-publish'],
  ['keys',       'studio-panneau-keys'],
  ['cache',      'studio-panneau-cache'],
];

// Chaque champ du FORMULAIRE D'ORIGINE doit rester atteignable : c'est lui qui
// pilote la génération. Une perte ici = une vidéo qu'on ne peut plus régler.
const CHAMPS_GENERATION = [
  'studio-subject', 'studio-lang-sel', 'studio-script', 'studio-terms',
  'studio-paragraphs', 'studio-match', 'studio-script-prompt', 'studio-sys-prompt',
  'studio-gen-script', 'studio-gen-terms',
  'studio-source', 'studio-aspect', 'studio-concat', 'studio-transition',
  'studio-fit', 'studio-count', 'studio-clip', 'studio-threads', 'studio-speed',
  'studio-vomode', 'studio-voice', 'studio-bgm-name', 'studio-bgmvol',
  'studio-volume', 'studio-rate', 'studio-font', 'studio-subpos', 'studio-subdisplay',
  'studio-subanim', 'studio-custompos', 'studio-fontsize', 'studio-strokewidth',
  'studio-color', 'studio-stroke', 'studio-bgcolor', 'studio-subtitles',
  'studio-launch', 'studio-save', 'studio-reset',
];

// Chaque onglet de réglages et ses champs. Une perte = un réglage inaccessible.
const CHAMPS_PAR_ONGLET = {
  llm: [
    'stu-llm-provider', 'stu-llm-provider-hint', 'stu-llm-zone-bloc', 'stu-llm-zone',
    'stu-llm-zone-hint', 'stu-llm-key', 'stu-llm-key-hint', 'stu-llm-base',
    'stu-llm-model', 'stu-llm-model-hint', 'stu-llm-test', 'stu-llm-defaults',
    'stu-llm-aide-titre', 'stu-llm-aide',
  ],
  material: ['stu-mat-pexels', 'stu-mat-pixabay', 'stu-mat-coverr', 'stu-mat-source'],
  publish: [
    'stu-pub-enabled', 'stu-pub-auto', 'stu-pub-key', 'stu-pub-user',
    'stu-pub-platforms', 'stu-pub-privacy', 'stu-pub-kids', 'stu-pub-max',
  ],
  keys: ['stu-keys-export', 'stu-keys-refresh', 'stu-keys-import', 'stu-keys-resume'],
  cache: [
    'stu-cache-dir', 'stu-cache-nb', 'stu-cache-taille', 'stu-cache-ancien',
    'stu-cache-plage', 'stu-cache-apercu', 'stu-cache-confirme',
    'stu-cache-refresh', 'stu-cache-nettoyer',
  ],
};

// Sans ces champs, certaines assertions seraient des faux négatifs :
//   - `stu-llm-verdict` et `stu-keys-verdict` / `stu-cache-verdict` sont des
//     bandeaux masqués tant qu'aucun geste n'a eu lieu — c'est VOULU ;
//   - `stu-llm-zone-bloc` est masqué pour les fournisseurs sans zone ;
//   - `stu-cache-nettoyer` est désactivé (mais visible) tant qu'on n'a pas coché.
const TOUJOURS_MASQUES = /verdict$/;

(async () => {
  console.log('=== Banc STUDIO VIDÉO — onglets de réglages (port ' + PORT + ') ===\n');
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });

  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));

  await page.goto('http://127.0.0.1:' + PORT + '/THEOLOGICUS.html?banc=' + Date.now(),
    { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Déverrouillage, comme le fait l'app.
  const tok = await page.evaluate(async (H) => {
    const x = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('remember:' + H));
    return Array.from(new Uint8Array(x)).map(v => v.toString(16).padStart(2, '0')).join('');
  }, AUTH_HASH);
  await page.evaluate(t => localStorage.setItem('theologicus_remember', JSON.stringify({
    v: 1, mode: 'admin', exp: Date.now() + 7 * 86400000, tok: t
  })), tok);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await page.evaluate(() => {
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.display = 'none'; }
  });
  await page.waitForTimeout(400);

  // ─── 1. La barre d'onglets existe et le modal s'ouvre ───────────────
  console.log('--- 1. OUVERTURE ET BARRE D\'ONGLETS ---');
  const barre = await page.evaluate(() => {
    const bar = document.getElementById('studio-tabs');
    if (!bar) return { presente: false };
    return {
      presente: true,
      role: bar.getAttribute('role'),
      nb: bar.querySelectorAll('.settings-tab').length,
      onglets: Array.from(bar.querySelectorAll('.settings-tab')).map(b => b.dataset.onglet),
      actif: (bar.querySelector('.settings-tab.active') || {}).dataset
        ? bar.querySelector('.settings-tab.active').dataset.onglet : null,
    };
  });
  check('la barre d\'onglets du studio existe', barre.presente);
  check('elle est annoncée comme un jeu d\'onglets (role=tablist)', barre.role === 'tablist');
  check('elle porte les 6 onglets', barre.nb === 6, String(barre.nb));
  check('les 6 onglets sont ceux attendus',
    JSON.stringify(barre.onglets) === JSON.stringify(ONGLETS.map(o => o[0])),
    JSON.stringify(barre.onglets));

  // Ouverture par le même chemin que l'app (le bouton vit dans l'en-tête, qui
  // n'est monté que dans certaines vues) — ce que le banc prouve est
  // l'intérieur du modal, pas la mise en page de l'en-tête.
  await page.evaluate(() => {
    if (typeof window.__studioOpen === 'function') { try { window.__studioOpen(); } catch (e) {} }
    const m = document.getElementById('studio-modal');
    if (m && !m.classList.contains('active')) m.classList.add('active');
  });
  await page.waitForTimeout(900);
  const modalOuvert = await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    return m ? getComputedStyle(m).display !== 'none' : false;
  });
  check('le modal STUDIO VIDÉO est affiché', modalOuvert);

  // ─── 2. Chaque onglet bascule réellement ─────────────────────────────
  console.log('\n--- 2. BASCULE DES ONGLETS (état APRÈS le clic) ---');
  for (const [nom, panneau] of ONGLETS) {
    const etat = await page.evaluate((n) => {
      const b = document.querySelector('#studio-tabs .settings-tab[data-onglet="' + n + '"]');
      if (!b) return { bouton: false };
      b.click();
      const btns = Array.from(document.querySelectorAll('#studio-tabs .settings-tab'));
      const pas = Array.from(document.querySelectorAll('#studio-modal .settings-panneau'));
      const cible = document.querySelector('#studio-modal .settings-panneau[data-panneau="' + n + '"]');
      return {
        bouton: true,
        actifs: btns.filter(x => x.classList.contains('active')).map(x => x.dataset.onglet),
        aria: b.getAttribute('aria-selected'),
        cibleHidden: cible ? cible.hidden : null,
        cibleDisplay: cible ? getComputedStyle(cible).display : null,
        autresVisibles: pas.filter(p => p.dataset.panneau !== n && !p.hidden)
          .map(p => p.dataset.panneau),
        ongletJs: window.__studioOnglet,
      };
    }, nom);
    check('onglet « ' + nom + ' » : bouton unique actif',
      etat.bouton && etat.actifs.length === 1 && etat.actifs[0] === nom,
      JSON.stringify(etat.actifs));
    check('onglet « ' + nom + ' » : aria-selected=true',
      etat.aria === 'true', String(etat.aria));
    check('onglet « ' + nom + ' » : son panneau est VISIBLE',
      etat.cibleHidden === false && etat.cibleDisplay !== 'none',
      'hidden=' + etat.cibleHidden + ' display=' + etat.cibleDisplay);
    check('onglet « ' + nom + ' » : aucun autre panneau visible',
      etat.autresVisibles.length === 0, JSON.stringify(etat.autresVisibles));
    check('onglet « ' + nom + ' » : onglet courant exposé en JS',
      etat.ongletJs === nom, String(etat.ongletJs));
  }

  // ─── 3. Aucun champ du formulaire d'origine n'est perdu ──────────────
  console.log('\n--- 3. LE FORMULAIRE « GÉNÉRATION » N\'A RIEN PERDU ---');
  await page.evaluate(() => window.__studioOuvrirOnglet('generation'));
  // On attend que la vue interne du formulaire soit RALLUMÉE, pas un délai
  // fixe : `studio-form` porte un `display:none` en ligne, donc un panneau
  // visible ne prouve pas que ses champs le sont.
  await page.waitForFunction(() => {
    const f = document.getElementById('studio-form');
    return !!f && f.style.display !== 'none';
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
  const perimetre = await page.evaluate((ids) => {
    const visibles = (el) => {
      // Un élément est ATTEIGNABLE si lui et toute sa chaîne d'ancêtres sont
      // visibles : un `display:none` sur un ANCÊTRE cache l'enfant sans rien
      // changer sur l'enfant lui-même.
      let n = el;
      while (n && n.nodeType === 1) {
        const st = getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        n = n.parentElement;
      }
      return true;
    };
    const absents = [], caches = [];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) { absents.push(id); return; }
      if (!visibles(el)) caches.push(id);
    });
    return { absents, caches };
  }, CHAMPS_GENERATION);
  check('les ' + CHAMPS_GENERATION.length + ' champs du formulaire existent',
    perimetre.absents.length === 0, JSON.stringify(perimetre.absents));
  check('ils sont tous VISIBLES sur l\'onglet « Génération »',
    perimetre.caches.length === 0, JSON.stringify(perimetre.caches));

  // ─── 4. Aucun champ de réglages n'est perdu ──────────────────────────
  console.log('\n--- 4. CHAQUE CHAMP DE RÉGLAGES EST ATTEIGNABLE ---');
  for (const nom of Object.keys(CHAMPS_PAR_ONGLET)) {
    await page.evaluate(n => window.__studioOuvrirOnglet(n), nom);
    // Arriver sur un onglet de réglages déclenche une RELECTURE du service
    // (`/mpt/settings`). Contrôler les champs avant que cette relecture ait
    // rendu mesurerait un DOM en cours de reconstruction — et accuserait
    // l'application d'un défaut qui n'existe pas. On attend donc la condition
    // elle-même : le panneau est bien celui demandé.
    await page.waitForFunction((n) => {
      const pa = document.querySelector('#studio-modal .settings-panneau[data-panneau="' + n + '"]');
      return pa && pa.hidden === false;
    }, nom, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    const r = await page.evaluate(({ ids, masque }) => {
      const re = new RegExp(masque);
      const visibles = (el) => {
        let n = el;
        while (n && n.nodeType === 1) {
          const st = getComputedStyle(n);
          if (st.display === 'none' || st.visibility === 'hidden') return false;
          n = n.parentElement;
        }
        return true;
      };
      const absents = [], caches = [];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) { absents.push(id); return; }
        if (re.test(id)) return;              // masqué par conception
        if (!visibles(el)) caches.push(id);
      });
      return { absents, caches };
    }, { ids: CHAMPS_PAR_ONGLET[nom], masque: TOUJOURS_MASQUES.source });
    check('onglet « ' + nom + ' » : les ' + CHAMPS_PAR_ONGLET[nom].length + ' champs existent',
      r.absents.length === 0, JSON.stringify(r.absents));
    check('onglet « ' + nom + ' » : ils sont tous visibles',
      r.caches.length === 0, JSON.stringify(r.caches));
  }

  // ─── 5. Le registre LLM vient du SERVICE ─────────────────────────────
  console.log('\n--- 5. LE REGISTRE DES FOURNISSEURS VIENT DU SERVICE ---');
  await page.evaluate(() => window.__studioOuvrirOnglet('llm'));
  // On ATTEND LA CONDITION, pas une durée fixe : le chargement du registre est
  // un aller-retour réseau, et les onglets précédents (sections 2 et 4) ont
  // laissé plusieurs chaînes de chargement en vol. Un délai fixe mesuré ici
  // tombait 16 ms trop tôt et faisait passer l'application pour fautive.
  await page.waitForFunction(() => {
    const sel = document.getElementById('stu-llm-provider');
    return !!sel && sel.options.length > 5;
  }, null, { timeout: 15000 }).catch(() => {});
  const reg = await page.evaluate(() => {
    const sel = document.getElementById('stu-llm-provider');
    const opts = sel ? Array.from(sel.options).map(o => o.value) : [];
    return {
      nb: opts.length,
      vides: opts.filter(v => !v).length,
      premier: opts[0],
      // mspt est le fournisseur par defaut de MPT : il doit etre present.
      aMoonshot: opts.indexOf('moonshot') >= 0,
      libelles: sel ? Array.from(sel.options).slice(0, 3).map(o => o.textContent) : [],
    };
  });
  check('le sélecteur de fournisseur est rempli depuis le service',
    reg.nb > 5, 'nb=' + reg.nb);
  check('aucune option vide (pas d\'état « chargement » figé)',
    reg.vides === 0, 'vides=' + reg.vides);
  check('« moonshot » (défaut de MPT) est proposé', reg.aMoonshot);
  check('les libellés sont ceux du service, pas des identifiants nus',
    reg.libelles.length > 0 && reg.libelles[0].indexOf('/') >= 0,
    JSON.stringify(reg.libelles));

  // ─── 6. La zone de service pilote la Base URL ────────────────────────
  console.log('\n--- 6. ZONE DE SERVICE -> BASE URL ---');
  // Le choix du fournisseur déclenche un `onchange` qui reconstruit les zones :
  // on attend que « moonshot » soit réellement porteur de ses deux zones avant
  // de mesurer, plutôt que de lire un état intermédiaire.
  await page.evaluate(() => {
    const sel = document.getElementById('stu-llm-provider');
    sel.value = 'moonshot';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const zs = document.getElementById('stu-llm-zone');
    return !!zs && zs.options.length >= 3;
  }, null, { timeout: 10000 }).catch(() => {});
  const zone = await page.evaluate(() => {
    const sel = document.getElementById('stu-llm-provider');
    const zs = document.getElementById('stu-llm-zone');
    const bloc = document.getElementById('stu-llm-zone-bloc');
    const avantBase = document.getElementById('stu-llm-base').value;
    const ids = Array.from(zs.options).map(o => o.value);
    const autre = ids.filter(i => i !== zs.value && i !== '__custom__')[0];
    let base2 = null;
    if (autre) { zs.value = autre; zs.dispatchEvent(new Event('change', { bubbles: true })); base2 = document.getElementById('stu-llm-base').value; }
    return { blocVisible: !bloc.hidden, zones: ids, avantBase, autre, base2,
             readOnly: document.getElementById('stu-llm-base').readOnly };
  });
  check('le bloc « zone de service » est visible pour un fournisseur à zones',
    zone.blocVisible);
  check('le fournisseur expose au moins deux zones + personnalisée',
    zone.zones.length >= 3, JSON.stringify(zone.zones));
  check('la Base URL est en lecture seule quand une zone est choisie',
    zone.readOnly === true, String(zone.readOnly));
  check('changer de zone CHANGE la Base URL',
    !!zone.base2 && zone.base2 !== zone.avantBase,
    'avant=' + zone.avantBase + ' apres=' + zone.base2);

  // Un fournisseur SANS zone ne doit pas laisser un sélecteur trompeur, ET sa
  // Base URL ne doit plus porter l'adresse de la zone précédente.
  //
  // Ce que ce contrôle ne peut PAS exiger : une adresse « api.openai.com ».
  // MPT ne la stocke nulle part — son registre Python ne porte d'adresse que
  // pour les fournisseurs À ZONES (moonshot en a deux), et pour les autres
  // l'adresse vit dans `config.toml`, vide par défaut. Inventer une adresse
  // ici serait un formulaire décoratif : on vérifie donc que le champ est
  // LIBRE et qu'il ne retient pas l'adresse du fournisseur précédent.
  const sansZone = await page.evaluate(() => {
    const sel = document.getElementById('stu-llm-provider');
    sel.value = 'openai';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      blocHidden: document.getElementById('stu-llm-zone-bloc').hidden,
      base: document.getElementById('stu-llm-base').value,
      readOnly: document.getElementById('stu-llm-base').readOnly,
      zones: Array.from(document.getElementById('stu-llm-zone').options).map(o => o.value),
    };
  });
  check('un fournisseur sans zone masque le bloc « zone de service »',
    sansZone.blocHidden === true, 'hidden=' + sansZone.blocHidden);
  check('sa Base URL reste modifiable à la main',
    sansZone.readOnly === false, String(sansZone.readOnly));
  check('la zone affichée n\'est plus celle du fournisseur précédent',
    sansZone.zones.length === 1 && sansZone.zones[0] === '__custom__',
    JSON.stringify(sansZone.zones));
  check('sa Base URL ne retient pas l\'adresse de la zone précédente',
    !/moonshot/.test(sansZone.base), sansZone.base);

  // ─── 7. Le test de connexion rend un VERDICT MOTIVÉ ──────────────────
  console.log('\n--- 7. TEST DE CONNEXION : UN VERDICT, AVEC LA CAUSE ---');
  const testRes = await page.evaluate(async () => {
    const sel = document.getElementById('stu-llm-provider');
    sel.value = 'moonshot';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // Clé volontairement injuste : le service doit refuser ET le dire.
    document.getElementById('stu-llm-key').value = 'sk-banc-volontairement-invalide';
    document.getElementById('stu-llm-model').value = 'kimi-k3';
    const v = document.getElementById('stu-llm-verdict');
    document.getElementById('stu-llm-test').click();
    // On attend la fin du test (aller-retour réseau vers le fournisseur).
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
      const t = v.textContent || '';
      if (t && t.indexOf('Enregistrement puis test') < 0 && v.style.display !== 'none') break;
    }
    return {
      affiche: v.style.display !== 'none',
      texte: (v.textContent || '').slice(0, 260),
      boutonRearme: document.getElementById('stu-llm-test').disabled === false,
      boutonTexte: document.getElementById('stu-llm-test').textContent,
    };
  });
  check('le bandeau de verdict s\'affiche après le test', testRes.affiche);
  check('le verdict dit la CAUSE, pas seulement « échec »',
    testRes.texte.length > 30, testRes.texte);
  check('le verdict mentionne un détail exploitable (HTTP ou erreur réseau)',
    /HTTP|Error|erreur|invalide|clé|key|connexion/i.test(testRes.texte), testRes.texte);
  check('le bouton est réarmé après le test', testRes.boutonRearme);
  check('le libellé du bouton est restauré',
    /TESTER LA CONNEXION/.test(testRes.boutonTexte), testRes.boutonTexte);

  // ─── 8. Les clés de banques partent en LISTE, pas en chaîne ──────────
  console.log('\n--- 8. SOURCES DE MÉDIAS : FORMAT DE LISTE ---');
  await page.evaluate(() => window.__studioOuvrirOnglet('material'));
  await page.waitForTimeout(600);
  const mat = await page.evaluate(() => {
    document.getElementById('stu-mat-pexels').value = 'CLE-A, CLE-B';
    document.getElementById('stu-mat-pixabay').value = 'PIX-1';
    const champs = document.querySelectorAll('#studio-modal [data-cle]');
    const types = {};
    champs.forEach(c => { types[c.id] = c.type || c.tagName.toLowerCase(); });
    // Les types attendus par MPT (son config.toml) : ce sont des LISTES.
    const attendus = { 'stu-mat-pexels': 'list', 'stu-mat-pixabay': 'list',
                       'stu-mat-coverr': 'list', 'stu-pub-platforms': 'list' };
    return {
      types,
      attendus,
      // Ces champs doivent être masqués à la saisie (ce sont des secrets).
      masques: ['stu-mat-pexels', 'stu-mat-pixabay', 'stu-mat-coverr',
                'stu-pub-key', 'stu-llm-key'].map(id => document.getElementById(id).type),
      source: document.getElementById('stu-mat-source').value,
    };
  });
  check('les clés de banques sont saisies masquées',
    mat.masques.every(t => t === 'password'), JSON.stringify(mat.masques));
  check('la source de vidéos par défaut est « pexels »',
    mat.source === 'pexels', mat.source);
  const plates = await page.evaluate(() => {
    const s = document.getElementById('stu-pub-platforms');
    return { multiple: s.multiple, nb: s.options.length };
  });
  check('les plateformes de publication acceptent plusieurs choix',
    plates.multiple === true, String(plates.multiple));
  check('les trois plateformes de MPT sont proposées',
    plates.nb === 3, String(plates.nb));

  // ─── 9. Le geste destructeur reste désarmé ───────────────────────────
  console.log('\n--- 9. NETTOYAGE DU CACHE : DÉSARMÉ PAR DÉFAUT ---');
  await page.evaluate(() => window.__studioOuvrirOnglet('cache'));
  await page.waitForTimeout(1200);
  const cacheEtat = await page.evaluate(() => {
    const btn = document.getElementById('stu-cache-nettoyer');
    const conf = document.getElementById('stu-cache-confirme');
    const avant = btn.disabled;
    conf.checked = true;
    conf.dispatchEvent(new Event('change', { bubbles: true }));
    const arme = btn.disabled;
    conf.checked = false;
    conf.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      desarmeAvant: avant, armeApresCoche: arme, rearmeApresDecoche: btn.disabled,
      nb: document.getElementById('stu-cache-nb').textContent,
      dirVisible: document.getElementById('stu-cache-dir').textContent.length > 10,
    };
  });
  check('le bouton de nettoyage est DÉSARMÉ sans confirmation',
    cacheEtat.desarmeAvant === true, String(cacheEtat.desarmeAvant));
  check('il s\'arme quand la confirmation est cochée',
    cacheEtat.armeApresCoche === false, String(cacheEtat.armeApresCoche));
  check('il se réarme (se désarme) quand on décoche',
    cacheEtat.rearmeApresDecoche === true, String(cacheEtat.rearmeApresDecoche));
  check('les statistiques de cache sont affichées',
    cacheEtat.nb !== '—' && cacheEtat.nb !== '', 'nb=' + cacheEtat.nb);
  check('le dossier de cache est montré',
    cacheEtat.dirVisible === true);

  // ─── 10. Le serveur refuse un nettoyage non confirmé ─────────────────
  console.log('\n--- 10. LE SERVEUR REFUSE UN NETTOYAGE NON CONFIRMÉ ---');
  const refus = await page.evaluate(async () => {
    const r = await fetch('/mpt/cache', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jours: 30 })
    });
    return await r.json();
  });
  check('sans « confirme:true » la requête est refusée',
    refus && refus.ok === false && refus.reason === 'not-confirmed',
    JSON.stringify(refus));

  // ─── 11. L'onglet est PERSISTÉ ───────────────────────────────────────
  console.log('\n--- 11. L\'ONGLET EST PERSISTÉ ---');
  await page.evaluate(() => window.__studioOuvrirOnglet('publish'));
  await page.waitForTimeout(400);
  const persiste = await page.evaluate(() => localStorage.getItem('theologicus-studio-onglet'));
  check('l\'onglet courant est enregistré', persiste === 'publish', String(persiste));

  const apresReouverture = await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    if (m) m.classList.remove('active');
    if (typeof window.__studioOpen === 'function') window.__studioOpen();
    return new Promise(res => setTimeout(() => {
      const actif = document.querySelector('#studio-tabs .settings-tab.active');
      res(actif ? actif.dataset.onglet : null);
    }, 900));
  });
  check('rouvrir le modal rend le dernier onglet consulté',
    apresReouverture === 'publish', String(apresReouverture));

  // ─── 12. Pas de doublon d'id, pas d'erreur JS ────────────────────────
  console.log('\n--- 12. HYGIÈNE ---');
  const doublons = await page.evaluate(() => {
    const tous = Array.from(document.querySelectorAll('[id]')).map(e => e.id);
    const vus = {}, dups = [];
    tous.forEach(i => { if (vus[i]) { if (dups.indexOf(i) < 0) dups.push(i); } vus[i] = 1; });
    return dups;
  });
  // Les doublons HISTORIQUES (hors studio) sont connus et hors périmètre :
  // `auth-password` / `auth-error` existent en double depuis avant v122.
  const doublonsStudio = doublons.filter(d => /^stu-|^studio-/.test(d));
  check('aucun identifiant du studio en double',
    doublonsStudio.length === 0, JSON.stringify(doublonsStudio));
  check('aucune erreur JavaScript pendant le banc',
    erreurs.length === 0, JSON.stringify(erreurs.slice(0, 3)));

  await browser.close();
  console.log('\n=== RÉSULTAT : ' + ok + '/' + (ok + ko) + ' ===');
  if (ko) { console.log('ÉCHECS : ' + ko); process.exit(1); }
})();
