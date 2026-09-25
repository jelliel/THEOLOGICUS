// Banc v122 — ONGLETS DES PARAMÈTRES et onglet « Modèle IA ».
//
// Ce que ce banc doit prouver, et pourquoi il est écrit ainsi :
//
//   1. Le modal PARAMÈTRES portait un défilement unique ; il est désormais
//      découpé en cinq onglets. Un découpage peut « réussir » en apparence
//      (le modal s'ouvre, le HTML est bien formé) tout en ayant PERDU les
//      champs d'origine dans un panneau jamais affiché. On vérifie donc que
//      chaque champ d'origine est atteignable, et qu'il est VISIBLE quand son
//      onglet est actif — pas seulement présent dans le DOM.
//
//   2. Le piège mesuré ici est le `display:none` EN LIGNE : il gagne contre la
//      feuille. Si un panneau était caché en ligne, `classList` ne le rallumerait
//      jamais. On vérifie donc l'état APRÈS le geste (clic sur l'onglet), jamais
//      « pas d'exception ».
//
//   3. L'onglet « Modèle IA » doit FONCTIONNER : le sélecteur de fournisseur se
//      remplit depuis le registre, les champs se synchronisent, « Appliquer et
//      activer » change réellement `state.model`, et « Tester la connexion » fait
//      une vraie requête et écrit un vrai verdict.
//
//   4. La sélection d'onglet doit être PERSISTÉE : rouvrir le modal doit rendre
//      l'onglet qu'on avait laissé.
//
// Usage :
//   node verify_settings.js            (serveur sur 127.0.0.1:8765)
//   node verify_settings.js <port>

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

// Les cinq onglets et le panneau qu'ils doivent révéler.
const ONGLETS = [
  ['model',     'settings-panneau-model'],
  ['providers', 'settings-panneau-providers'],
  ['tts',       'settings-panneau-tts'],
  ['keys',      'settings-panneau-keys'],
  ['cache',     'settings-panneau-cache'],
];

// Chaque champ d'origine doit rester ATTEIGNABLE et VISIBLE dans son onglet.
// Une perte ici = une fonctionnalité muette (le TTS, les clés, la vérification
// des références, les profils sociaux).
const CHAMPS_PAR_ONGLET = {
  tts: [
    'tts-engine-select', 'read-lang-select', 'tts-narration',
    'tts-el-block', 'tts-st-block',
    'tts-el-key', 'tts-el-check', 'tts-st-url', 'tts-st-check',
  ],
  keys: [
    'remember-state', 'forget-remember-btn',
    'verify-mode-select', 'custom-models-list',
    'cm-name', 'cm-model', 'cm-baseurl', 'cm-apikey', 'cm-format', 'cm-save',
    'fb-profile-url', 'tiktok-profile-url', 'save-social-profiles',
  ],
  cache: [
    'lt-ctrl', 'lt-dot', 'lt-state', 'lt-toggle',
  ],
  providers: [
    'providers-list', 'settings-tab-providers-custom',
  ],
  model: [
    'set-llm-provider', 'set-llm-provider-hint',
    'set-llm-endpoint-bloc', 'set-llm-endpoint',
    'set-llm-key', 'set-llm-key-hint',
    'set-llm-base', 'set-llm-model', 'set-llm-model-list', 'set-llm-model-hint',
    'set-llm-reset', 'set-llm-test', 'set-llm-apply', 'set-llm-verdict',
    'set-llm-aide-titre', 'set-llm-aide',
  ],
};

(async () => {
  console.log('=== Banc PARAMÈTRES — onglets + Modèle IA (port ' + PORT + ') ===\n');
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

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
    const bar = document.getElementById('settings-tabs');
    if (!bar) return { presente: false };
    return {
      presente: true,
      role: bar.getAttribute('role'),
      nb: bar.querySelectorAll('.settings-tab').length,
      ids: Array.from(bar.querySelectorAll('.settings-tab')).map(b => b.id),
      onglets: Array.from(bar.querySelectorAll('.settings-tab')).map(b => b.dataset.onglet),
    };
  });
  check('la barre d\'onglets existe', barre.presente);
  check('elle est annoncée comme un jeu d\'onglets (role=tablist)', barre.role === 'tablist');
  check('elle porte les 5 onglets', barre.nb === 5, String(barre.nb));

  // Le bouton ⚙ PARAMÈTRES vit dans l'en-tête, qui n'est monté que dans
  // certaines vues. On ouvre donc le modal PAR LE MÊME CHEMIN que le menu
  // (setView puis clic), avec un repli sur l'activation directe de la classe :
  // ce que le banc doit prouver, c'est l'intérieur du modal, pas la mise en
  // page de l'en-tête.
  await page.evaluate(() => {
    if (typeof setView === 'function') { try { setView('chat'); } catch(e) {} }
  });
  await page.waitForTimeout(600);
  const ouvertParClic = await page.evaluate(() => {
    const b = document.getElementById('open-settings-modal');
    if (b && b.offsetParent !== null) { b.click(); return true; }
    return false;
  });
  if (!ouvertParClic) {
    await page.evaluate(() => {
      const m = document.getElementById('settings-modal');
      m.classList.add('active');
      const b = document.getElementById('open-settings-modal');
      if (b && b.onclick) b.onclick();
    });
  }
  await page.waitForTimeout(900);
  const ouverture = await page.evaluate(() => {
    const m = document.getElementById('settings-modal');
    return { actif: m.classList.contains('active'), visible: getComputedStyle(m).display === 'flex' };
  });
  check('le modal PARAMÈTRES s\'ouvre', ouverture.actif && ouverture.visible);

  // ─── 2. Chaque onglet révèle SON panneau, et un seul ────────────────
  console.log('\n--- 2. BASCULE DES ONGLETS ---');
  for (const [nom, panneau] of ONGLETS) {
    await page.evaluate(n => {
      const b = document.getElementById('settings-tab-' + n);
      if (b) b.click();
    }, nom);
    await page.waitForTimeout(220);
    const etat = await page.evaluate((args) => {
      const [nom, panneau] = args;
      const btn = document.getElementById('settings-tab-' + nom);
      const pa = document.getElementById(panneau);
      const autres = Array.from(document.querySelectorAll('#settings-modal .settings-panneau'))
        .filter(x => x.id !== panneau);
      return {
        actifBtn: btn ? btn.classList.contains('active') : false,
        ariaSel: btn ? btn.getAttribute('aria-selected') : null,
        panneauExiste: !!pa,
        panneauVisible: pa ? !pa.hidden && getComputedStyle(pa).display !== 'none' : false,
        autresCaches: autres.every(x => x.hidden),
        courant: window.__settingsOnglet,
      };
    }, [nom, panneau]);
    check('onglet « ' + nom + ' » : bouton marqué actif', etat.actifBtn && etat.ariaSel === 'true');
    check('onglet « ' + nom + ' » : son panneau devient visible', etat.panneauVisible);
    check('onglet « ' + nom + ' » : les autres panneaux sont cachés', etat.autresCaches);
    check('onglet « ' + nom + ' » : l\'état global suit', etat.courant === nom, String(etat.courant));
  }

  // ─── 3. Aucun champ n'a été perdu au découpage ──────────────────────
  console.log('\n--- 3. AUCUN CHAMP PERDU (le vrai risque du découpage) ---');
  for (const [nom, ids] of Object.entries(CHAMPS_PAR_ONGLET)) {
    await page.evaluate(n => {
      const b = document.getElementById('settings-tab-' + n);
      if (b) b.click();
    }, nom);
    await page.waitForTimeout(200);
    const res = await page.evaluate((ids) => {
      const manquants = ids.filter(i => !document.getElementById(i));
      // Un champ présent mais INVISIBLE dans son propre onglet est perdu pour
      // l'utilisateur : c'est exactement ce que produit un `display:none` en
      // ligne oublié sur un ANCÊTRE. Trois exceptions LÉGITIMES, chacune
      // vérifiée séparément ailleurs :
      //   - les panneaux de moteur TTS (tts-el-block / tts-st-block) ne
      //     s'affichent que pour le moteur choisi — et leurs champs INTERNES
      //     (tts-el-key, tts-el-check, tts-st-url…) sont donc cachés avec eux ;
      //   - <datalist> et ses options ne sont JAMAIS rendues (c'est une liste
      //     de suggestions, pas un élément de mise en page) ;
      //   - les blocs d'état masqués par conception (verdict, zone de service
      //     quand le fournisseur n'en a pas).
      // Le moteur TTS courant est vérifié PLUS BAS, explicitement : c'est ce
      // qui prouve que le bloc conditionnel suit bien le choix.
      const DANS_BLOC_CONDITIONNEL = ['tts-el-key', 'tts-el-check', 'tts-el-test', 'tts-el-voices',
                                      'tts-st-url', 'tts-st-check', 'tts-st-start', 'tts-st-test',
                                      'tts-st-cmd', 'tts-st-log', 'tts-st-voice', 'tts-st-speed'];
      const LEGITIMES = /^(tts-(el|st)-block|set-llm-model-list|set-llm-verdict|set-llm-endpoint(-bloc)?)$/;
      const invisibles = ids.filter(i => {
        if (LEGITIMES.test(i)) return false;
        if (DANS_BLOC_CONDITIONNEL.indexOf(i) >= 0) return false;
        const el = document.getElementById(i);
        if (!el) return false;
        if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) return true;
        return false;
      });
      return { manquants, invisibles };
    }, ids);
    check('onglet « ' + nom + ' » : les ' + ids.length + ' champs existent',
      res.manquants.length === 0, 'manquants: ' + res.manquants.join(', '));
    check('onglet « ' + nom + ' » : ils sont atteignables (visibles)',
      res.invisibles.length === 0, 'invisibles: ' + res.invisibles.join(', '));
  }

  // ─── 3bis. Les blocs conditionnels suivent bien le choix ────────────
  // Les champs internes des blocs TTS (ElevenLabs / Supertonic) sont
  // légitimement cachés — encore faut-il qu'ils S'OUVRENT quand on choisit le
  // moteur correspondant. Sinon le bloc serait mort, ce que l'exclusion
  // ci-dessus masquerait.
  console.log('\n--- 3bis. LES BLOCS CONDITIONNELS SUIVENT LE CHOIX ---');
  await page.evaluate(() => document.getElementById('settings-tab-tts').click());
  await page.waitForTimeout(250);
  for (const [moteur, bloc, champ] of [['elevenlabs', 'tts-el-block', 'tts-el-key'],
                                       ['supertonic', 'tts-st-block', 'tts-st-url']]) {
    const r = await page.evaluate((args) => {
      const [moteur, bloc, champ] = args;
      const sel = document.getElementById('tts-engine-select');
      sel.value = moteur;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return null;
    }, [moteur, bloc, champ]);
    await page.waitForTimeout(600);
    const etat = await page.evaluate((args) => {
      const [moteur, bloc, champ] = args;
      const b = document.getElementById(bloc), c = document.getElementById(champ);
      return {
        moteurChoisi: document.getElementById('tts-engine-select').value,
        blocVisible: b ? (b.offsetParent !== null || getComputedStyle(b).display !== 'none') : false,
        champVisible: c ? c.offsetParent !== null : false,
        autreCache: (() => {
          const autre = document.getElementById(moteur === 'elevenlabs' ? 'tts-st-block' : 'tts-el-block');
          return autre ? (autre.offsetParent === null || getComputedStyle(autre).display === 'none') : true;
        })(),
      };
    }, [moteur, bloc, champ]);
    check('moteur « ' + moteur + ' » : le moteur est bien sélectionné',
      etat.moteurChoisi === moteur, etat.moteurChoisi);
    check('moteur « ' + moteur + ' » : son bloc s\'ouvre', etat.blocVisible === true);
    check('moteur « ' + moteur + ' » : ses champs deviennent visibles', etat.champVisible === true);
    check('moteur « ' + moteur + ' » : l\'autre bloc se referme', etat.autreCache === true);
  }
  // On remet le moteur du système pour ne pas polluer la suite.
  await page.evaluate(() => {
    const sel = document.getElementById('tts-engine-select');
    sel.value = 'system';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  // ─── 4. Onglet « Modèle IA » : le sélecteur se remplit ──────────────
  console.log('\n--- 4. MODÈLE IA — LE SÉLECTEUR DE FOURNISSEUR ---');  await page.evaluate(() => document.getElementById('settings-tab-model').click());
  await page.waitForTimeout(250);
  const prov = await page.evaluate(() => {
    const s = document.getElementById('set-llm-provider');
    const opts = Array.from(s.querySelectorAll('option')).map(o => o.value);
    return {
      nb: opts.length,
      values: opts,
      groupes: s.querySelectorAll('optgroup').length,
      courant: s.value,
      // Le registre de l'app : c'est LUI qui fait foi, pas la liste du panneau.
      registre: (typeof PROVIDERS !== 'undefined') ? PROVIDERS.map(p => p.id) : [],
    };
  });
  check('le sélecteur propose les fournisseurs du registre',
    prov.nb >= prov.registre.length && prov.registre.every(id => prov.values.indexOf(id) >= 0),
    prov.nb + ' options pour ' + prov.registre.length + ' au registre');
  check('les options sont groupées', prov.groupes >= 1, String(prov.groupes));
  check('un fournisseur est présélectionné', !!prov.courant, prov.courant);

  // ─── 5. La synchronisation reflète le modèle ACTIF ──────────────────
  console.log('\n--- 5. MODÈLE IA — SYNCHRONISATION AVEC L\'ÉTAT ---');
  const sync = await page.evaluate(() => {
    // On force un modèle préfixé (autre fournisseur que Mistral) et on
    // resynchronise : le sélecteur ET les champs doivent suivre.
    window.__bancModelAvant = state.model;
    state.model = 'deepseek:deepseek-chat';
    if (typeof window.__settingsModelSyncForce !== 'function') {
      // Pas d'expose : on passe par la réouverture du modal, qui resynchronise.
      document.getElementById('settings-modal').classList.remove('active');
      document.getElementById('open-settings-modal').click();
    } else {
      window.__settingsModelSyncForce();
    }
    return null;
  });
  await page.waitForTimeout(900);
  const apresSync = await page.evaluate(() => {
    const s = document.getElementById('set-llm-provider');
    const m = document.getElementById('set-llm-model');
    const b = document.getElementById('set-llm-base');
    const dl = document.getElementById('set-llm-model-list');
    const p = (typeof PROVIDER_BY_ID !== 'undefined') ? PROVIDER_BY_ID['deepseek'] : null;
    return {
      selProv: s ? s.value : null,
      modele: m ? m.value : null,
      base: b ? b.value : null,
      baseAttendue: p ? p.base : null,
      optionsDatalist: dl ? dl.querySelectorAll('option').length : 0,
      model: state.model,
    };
  });
  check('le modèle actif « deepseek:deepseek-chat » est reconnu', apresSync.model === 'deepseek:deepseek-chat',
    String(apresSync.model));
  check('le sélecteur bascule sur le bon fournisseur', apresSync.selProv === 'deepseek', String(apresSync.selProv));
  check('le champ « Nom du modèle » montre le modèle', apresSync.modele === 'deepseek-chat', String(apresSync.modele));
  check('l\'URL de base est celle du fournisseur', apresSync.base === apresSync.baseAttendue,
    apresSync.base + ' vs ' + apresSync.baseAttendue);
  check('la liste de suggestions est remplie', apresSync.optionsDatalist >= 1, String(apresSync.optionsDatalist));

  // ─── 6. « Appliquer et activer » change réellement le modèle ────────
  console.log('\n--- 6. MODÈLE IA — APPLIQUER ET ACTIVER ---');
  // On repart d'un état PROPRE : le fournisseur « deepseek » est celui du
  // modèle actif. On veut prouver que changer de fournisseur puis saisir un
  // nom de modèle ABOUTIT bien à `openai:gpt-4o-mini` — donc que le choix
  // n'est pas annulé par une resynchronisation intempestive.
  await page.evaluate(() => {
    const s = document.getElementById('set-llm-provider');
    s.value = 'openai';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const apresChoix = await page.evaluate(() => ({
    // LE point du banc : le sélecteur doit AVOIR GARDÉ le choix de l'utilisateur.
    prov: document.getElementById('set-llm-provider').value,
    base: document.getElementById('set-llm-base').value,
    modeleVide: document.getElementById('set-llm-model').value === '',
    // et la barre principale ne doit PAS avoir bougé (rien n'est appliqué encore)
    model: state.model,
  }));
  check('changer de fournisseur CONSERVE le choix (pas de retour en arrière)',
    apresChoix.prov === 'openai', apresChoix.prov);
  check('changer de fournisseur remet la Base URL à sa valeur',
    apresChoix.base === 'https://api.openai.com/v1', apresChoix.base);
  check('changer de fournisseur vide le nom de modèle (à resaisir)',
    apresChoix.modeleVide === true);
  check('rien n\'est appliqué tant qu\'on n\'a pas cliqué',
    apresChoix.model === 'deepseek:deepseek-chat', String(apresChoix.model));

  // Étape B : saisir le modèle puis appliquer.
  await page.evaluate(() => {
    document.getElementById('set-llm-model').value = 'gpt-4o-mini';
    document.getElementById('set-llm-apply').click();
  });
  await page.waitForTimeout(1000);
  const apresApplique = await page.evaluate(() => ({
    model: state.model,
    sel: document.getElementById('model-select') ? document.getElementById('model-select').value : null,
    // Le libellé doit avoir été reconstruit pour inclure le nouveau modèle.
    optionPresente: (() => {
      const s = document.getElementById('model-select');
      if (!s) return false;
      return Array.from(s.querySelectorAll('option')).some(o => o.value === state.model);
    })(),
  }));
  check('« Appliquer et activer » pose le modèle préfixé',
    apresApplique.model === 'openai:gpt-4o-mini', String(apresApplique.model));
  check('la barre de modèle principale suit', apresApplique.sel === 'openai:gpt-4o-mini',
    String(apresApplique.sel));
  check('le modèle apparaît dans la liste principale', apresApplique.optionPresente === true);

  // ─── 7. « Tester la connexion » écrit un VERDICT ────────────────────
  console.log('\n--- 7. MODÈLE IA — TEST DE CONNEXION ---');
  // Cas 1 : aucune clé -> le verdict doit le DIRE, sans partir sur le réseau.
  // ORDRE IMPORTANT : on choisit d'abord le fournisseur (son gestionnaire
  // RECHARGE la clé depuis l'état), PUIS on vide. L'inverse serait annulé par
  // le rechargement — et le banc croirait à un bug de l'app.
  await page.evaluate(() => {
    const s = document.getElementById('set-llm-provider');
    s.value = 'gemini';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    delete state.keys['gemini'];
    document.getElementById('set-llm-key').value = '';
    document.getElementById('set-llm-model').value = 'gemini-1.5-flash';
  });
  await page.evaluate(() => document.getElementById('set-llm-test').click());
  await page.waitForTimeout(900);
  const sansCle = await page.evaluate(() => {
    const v = document.getElementById('set-llm-verdict');
    return {
      visible: v.style.display !== 'none' && v.offsetParent !== null,
      texte: v.textContent.trim(),
    };
  });
  check('sans clé, un verdict est affiché', sansCle.visible, sansCle.texte.slice(0, 80));
  check('le verdict dit que la clé manque',
    /Aucune clé|clé .*manque|ne peut pas aboutir/i.test(sansCle.texte), sansCle.texte.slice(0, 120));

  // Cas 2 : clé bidon -> une vraie requête part, et le verdict est un ÉCHEC
  // motivé (HTTP 401 souvent, parfois réseau/CORS). On ne teste PAS le code
  // exact : on teste qu'un verdict d'échec est écrit et qu'il n'est pas vide.
  await page.evaluate(() => {
    const s = document.getElementById('set-llm-provider');
    s.value = 'openai';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document.getElementById('set-llm-key').value = 'sk-banc-cle-inexistante-000000000000';
    document.getElementById('set-llm-model').value = 'gpt-4o-mini';
  });
  await page.evaluate(() => document.getElementById('set-llm-test').click());
  await page.waitForTimeout(11000);
  const avecCle = await page.evaluate(() => {
    const v = document.getElementById('set-llm-verdict');
    const btn = document.getElementById('set-llm-test');
    return {
      visible: v.style.display !== 'none' && v.offsetParent !== null,
      texte: v.textContent.trim(),
      boutonActif: !btn.disabled,
      libelleBouton: btn.textContent.trim(),
    };
  });
  check('avec une clé, un verdict est écrit', avecCle.visible, avecCle.texte.slice(0, 80));
  check('le verdict est motivé (HTTP, échec ou délai)',
    /HTTP|Échec|échec|Aucune réponse|Connexion/i.test(avecCle.texte), avecCle.texte.slice(0, 160));
  check('le bouton est réarmé après le test', avecCle.boutonActif === true, avecCle.libelleBouton);

  // ─── 8. La sélection d'onglet est PERSISTÉE ─────────────────────────
  console.log('\n--- 8. PERSISTANCE DE L\'ONGLET ---');
  await page.evaluate(() => {
    document.getElementById('settings-tab-keys').click();
  });
  await page.waitForTimeout(250);
  const stocke = await page.evaluate(() => localStorage.getItem('theologicus-settings-onglet'));
  check('l\'onglet courant est mémorisé', stocke === 'keys', String(stocke));

  await page.evaluate(() => {
    document.getElementById('settings-modal').classList.remove('active');
  });
  await page.waitForTimeout(300);
  // Même chemin d'ouverture que plus haut (le bouton d'en-tête n'est pas monté
  // dans toutes les vues : ce n'est pas ce que ce banc mesure).
  await page.evaluate(() => {
    const m = document.getElementById('settings-modal');
    m.classList.add('active');
    const b = document.getElementById('open-settings-modal');
    if (b && b.onclick) b.onclick();
  });
  await page.waitForTimeout(800);
  const rouvert = await page.evaluate(() => ({
    onglet: window.__settingsOnglet,
    keysActif: document.getElementById('settings-tab-keys').classList.contains('active'),
    panneauVisible: !document.getElementById('settings-panneau-keys').hidden,
  }));
  check('à la réouverture, on retrouve l\'onglet quitté',
    rouvert.onglet === 'keys' && rouvert.keysActif, String(rouvert.onglet));
  check('et son panneau est bien visible', rouvert.panneauVisible === true);

  // ─── 9. Le raccourci « Modèles custom » ouvre le bon onglet ─────────
  console.log('\n--- 9. RACCOURCIS VERS UN ONGLET PRÉCIS ---');
  await page.evaluate(() => {
    document.getElementById('settings-modal').classList.remove('active');
  });
  await page.waitForTimeout(250);
  const raccourci = await page.evaluate(async () => {
    // On appelle le raccourci par son nom d'action, comme le fait le menu.
    if (typeof window.__settingsOuvrirOnglet !== 'function') return { expose: false };
    window.__settingsOuvrirOnglet('providers');
    await new Promise(r => setTimeout(r, 200));
    return {
      expose: true,
      onglet: window.__settingsOnglet,
      actif: document.getElementById('settings-tab-providers').classList.contains('active'),
      panneau: !document.getElementById('settings-panneau-providers').hidden,
      // Le champ clé du panneau doit être là, sinon l'onglet serait vide.
      listePresente: !!document.getElementById('providers-list'),
    };
  });
  check('la bascule d\'onglet est exposée aux appelants', raccourci.expose === true);
  check('elle ouvre bien « Fournisseurs »', raccourci.onglet === 'providers' && raccourci.actif,
    String(raccourci.onglet));
  check('le panneau « Fournisseurs » est visible', raccourci.panneau === true);
  check('la liste des fournisseurs y est montée', raccourci.listePresente === true);

  // ─── 10. Aucun identifiant dupliqué ───────────────────────────────────
  console.log('\n--- 10. INTÉGRITÉ DU DOM ---');
  const doublons = await page.evaluate(() => {
    const m = document.getElementById('settings-modal');
    const vus = {}, dup = [];
    m.querySelectorAll('[id]').forEach(el => {
      if (vus[el.id]) dup.push(el.id); else vus[el.id] = 1;
    });
    return dup;
  });
  check('aucun identifiant dupliqué dans le modal', doublons.length === 0, doublons.join(', '));

  check('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  console.log('\n============================');
  console.log('  RESULTAT : ' + ok + '/' + (ok + ko));
  console.log('============================');
  await browser.close();
  process.exit(ko === 0 ? 0 : 1);
})().catch(e => { console.error('Echec du banc :', e.message); process.exit(1); });
