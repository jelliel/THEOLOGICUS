// Banc v121 — PARITÉ avec l'interface MoneyPrinterTurbo.
//
// Le banc précédent (verify_studio.js) prouvait que le modal S'OUVRE. Celui-ci
// prouve que ce qu'il contient FONCTIONNE : les listes se remplissent depuis le
// service, les curseurs disent leur valeur, les couleurs restent d'accord entre
// la pipette et le texte, et la charge utile envoyée correspond EXACTEMENT au
// contrat VideoParams (app/models/schema.py de MoneyPrinterTurbo).
//
// Méthode : on observe l'ÉTAT après le geste, jamais « pas d'exception ».
// Le piège du # a montré qu'un code qui ne lève pas peut ne rien faire.
//
// Usage :
//   node verify_studio_v121.js            (serveur sur 127.0.0.1:8765)
//   node verify_studio_v121.js <port>

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

// Les 30 identifiants que le formulaire doit exposer. Un seul manquant tue
// la fonctionnalité correspondante, en silence.
const IDS = [
  // Sujet et script
  'studio-subject', 'studio-lang-sel', 'studio-script', 'studio-terms',
  'studio-paragraphs', 'studio-match', 'studio-script-prompt', 'studio-sys-prompt',
  'studio-gen-script', 'studio-gen-terms',
  // Vidéo
  'studio-source', 'studio-aspect', 'studio-concat', 'studio-transition', 'studio-fit',
  'studio-count', 'studio-clip', 'studio-threads', 'studio-speed', 'studio-speed-val',
  // Audio
  'studio-vomode', 'studio-voice', 'studio-bgm-name', 'studio-bgmvol', 'studio-bgmvol-val',
  'studio-volume', 'studio-volume-val', 'studio-rate', 'studio-rate-val',
  // Sous-titres
  'studio-subtitles', 'studio-font', 'studio-subpos', 'studio-subdisplay', 'studio-subanim',
  'studio-custompos', 'studio-fontsize', 'studio-fontsize-val', 'studio-strokewidth',
  'studio-strokewidth-val', 'studio-color-pick', 'studio-color',
  'studio-stroke-pick', 'studio-stroke',
  'studio-bg-pick', 'studio-bgcolor', 'studio-bg-enabled', 'studio-bg-rounded',
  // Pied
  'studio-reset', 'studio-save', 'studio-launch',
];

// Le contrat VideoParams. `cle` = ce que MPT attend ; `champ` = l'id du champ.
// On ne teste pas que la clé EXISTE, on teste qu'elle porte la BONNE valeur.
const CONTRAT = [
  ['video_subject',              'studio-subject',     'Sujet bancaire'],
  ['video_language',             'studio-lang-sel',    'fr'],
  ['paragraph_number',           'studio-paragraphs',  1],
  ['match_materials_to_script',  'studio-match',       'true'],
  ['video_source',               'studio-source',      'pexels'],
  ['video_aspect',               'studio-aspect',      '9:16'],
  ['video_concat_mode',          'studio-concat',      'random'],
  ['video_fit_mode',             'studio-fit',         'cover'],
  ['video_transition_mode',      'studio-transition',  'FadeIn'],
  ['video_count',                'studio-count',       '1'],
  ['video_clip_duration',        'studio-clip',        '3'],
  ['video_clip_speed',           'studio-speed',       '1.5'],
  ['n_threads',                  'studio-threads',     '2'],
  ['voice_rate',                 'studio-rate',        '1.2'],
  ['voice_volume',               'studio-volume',      '1'],
  ['bgm_volume',                 'studio-bgmvol',      '0.5'],
  ['subtitle_position',          'studio-subpos',      'bottom'],
  ['subtitle_display_mode',      'studio-subdisplay',  'word_by_word'],
  ['subtitle_animation',         'studio-subanim',     'pop_spring'],
  ['custom_position',            'studio-custompos',   '70'],
  ['font_size',                  'studio-fontsize',    '80'],
  ['text_fore_color',            'studio-color',       '#FFEEDD'],
  ['stroke_color',               'studio-stroke',      '#112233'],
  ['stroke_width',               'studio-strokewidth', '3'],
];

(async () => {
  console.log('=== Banc STUDIO VIDÉO — parité MoneyPrinterTurbo (port ' + PORT + ') ===\n');
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

  // ─── 1. Ouverture + inventaire des champs ───────────────────────────
  console.log('--- 1. OUVERTURE ET CHAMPS ---');
  await page.click('#open-studio-modal', { timeout: 8000 });
  await page.waitForTimeout(1500);

  const ouverture = await page.evaluate((ids) => {
    const m = document.getElementById('studio-modal');
    const form = document.getElementById('studio-form');
    return {
      actif: m.classList.contains('active'),
      visible: getComputedStyle(m).display === 'flex',
      formVisible: form ? getComputedStyle(form).display !== 'none' : false,
      manquants: ids.filter(i => !document.getElementById(i)),
      total: ids.length,
    };
  }, IDS);
  check('le modal est ouvert', ouverture.actif && ouverture.visible);
  check('le formulaire est affiché', ouverture.formVisible,
    'service détecté ? (le formulaire n\'apparaît que si MPT tourne)');
  check('les ' + ouverture.total + ' champs du formulaire existent',
    ouverture.manquants.length === 0, 'manquants: ' + ouverture.manquants.join(', '));

  // ─── 2. Listes remplies DEPUIS LE SERVICE ───────────────────────────
  console.log('\n--- 2. LISTES LUES DEPUIS LE SERVICE ---');
  const listes = await page.evaluate(() => {
    const v = document.getElementById('studio-voice');
    const f = document.getElementById('studio-font');
    const b = document.getElementById('studio-bgm-name');
    const op = s => s ? Array.from(s.querySelectorAll('option')) : [];
    const voix = op(v), polices = op(f), musiques = op(b);
    return {
      voixTotal: voix.length,
      voixFr: voix.filter(o => /^fr-/i.test(o.value)).length,
      voixGroupes: v ? v.querySelectorAll('optgroup').length : 0,
      premierGroupe: v && v.querySelector('optgroup') ? v.querySelector('optgroup').label : '',
      polices: polices.map(o => o.value),
      musiques: musiques.map(o => o.value),
    };
  });
  check('les voix sont chargées (>100)', listes.voixTotal > 100, listes.voixTotal + ' voix');
  check('les voix françaises sont présentes', listes.voixFr >= 10, listes.voixFr + ' voix fr');
  check('les voix sont groupées par langue', listes.voixGroupes === 2, listes.voixGroupes + ' groupes');
  check('le français est le PREMIER groupe',
    /^Fran/i.test(listes.premierGroupe), listes.premierGroupe);
  check('les polices sont chargées', listes.polices.length >= 5, listes.polices.join(', '));
  check('STHeitiMedium.ttc est présélectionnée (défaut du service)',
    listes.polices.includes('STHeitiMedium.ttc'));
  check('les musiques sont chargées', listes.musiques.length >= 1, listes.musiques.length + ' pistes');
  check('« Aléatoire » et « Aucune » encadrent la liste',
    listes.musiques[0] === 'random' && listes.musiques[1] === '');

  // ─── 3. Curseurs : la valeur affichée suit le curseur ───────────────
  console.log('\n--- 3. CURSEURS ET ÉTIQUETTES ---');
  const avantCurseur = await page.evaluate(() =>
    document.getElementById('studio-speed-val').textContent.trim());
  await page.evaluate(() => {
    const s = document.getElementById('studio-speed');
    s.value = '1.5';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const apresCurseur = await page.evaluate(() => ({
    etiq: document.getElementById('studio-speed-val').textContent.trim(),
    val: document.getElementById('studio-speed').value,
  }));
  check('l\'étiquette de vitesse réagit au curseur',
    apresCurseur.etiq !== avantCurseur && /1[,.]50/.test(apresCurseur.etiq),
    avantCurseur + ' -> ' + apresCurseur.etiq);

  const volumes = await page.evaluate(() => {
    const maj = (idS, v) => {
      const s = document.getElementById(idS);
      s.value = v; s.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById(idS + '-val').textContent.trim();
    };
    return {
      bgm: maj('studio-bgmvol', '0.5'),
      voix: maj('studio-volume', '1'),
      taille: maj('studio-fontsize', '80'),
      contour: maj('studio-strokewidth', '3'),
    };
  });
  check('l\'étiquette de musique affiche un pourcentage', /50\s*%/.test(volumes.bgm), volumes.bgm);
  check('l\'étiquette de voix affiche un pourcentage', /100\s*%/.test(volumes.voix), volumes.voix);
  check('l\'étiquette de taille affiche un entier', volumes.taille === '80', volumes.taille);
  check('l\'étiquette de contour affiche un décimal', /3[,.]00/.test(volumes.contour), volumes.contour);

  // ─── 4. Couleurs : pipette et texte restent d'accord ────────────────
  console.log('\n--- 4. COULEURS (pipette <-> texte) ---');
  const couleurs = await page.evaluate(() => {
    const r = {};
    const saisir = (idTexte, val) => {
      const t = document.getElementById(idTexte);
      t.value = val; t.dispatchEvent(new Event('input', { bubbles: true }));
    };
    saisir('studio-color', '#ffeedd');
    r.texteVersPipette = document.getElementById('studio-color-pick').value;
    saisir('studio-color', 'ABC');            // forme courte sans #
    r.courtNormalise = document.getElementById('studio-color-pick').value;
    const p = document.getElementById('studio-stroke-pick');
    p.value = '#112233'; p.dispatchEvent(new Event('input', { bubbles: true }));
    r.pipetteVersTexte = document.getElementById('studio-stroke').value;
    return r;
  });
  check('le texte met la pipette à jour',
    couleurs.texteVersPipette.toLowerCase() === '#ffeedd', couleurs.texteVersPipette);
  check('la forme courte « ABC » est normalisée',
    couleurs.courtNormalise.toLowerCase() === '#aabbcc', couleurs.courtNormalise);
  check('la pipette met le texte à jour',
    couleurs.pipetteVersTexte === '#112233', couleurs.pipetteVersTexte);

  // ─── 5. Charge utile = contrat VideoParams ──────────────────────────
  console.log('\n--- 5. CHARGE UTILE (contrat VideoParams) ---');
  const payload = await page.evaluate((contrat) => {
    // On pose les valeurs attendues sur les champs, puis on relit la charge.
    contrat.forEach(([, champ, val]) => {
      const e = document.getElementById(champ); if (!e) return;
      e.value = val;
      if (e.tagName === 'SELECT' || e.type === 'range') {
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    const maj = (id, v) => {
      const s = document.getElementById(id);
      s.value = v; s.dispatchEvent(new Event('input', { bubbles: true }));
    };
    maj('studio-speed', '1.5');
    maj('studio-strokewidth', '3');
    maj('studio-fontsize', '80');
    maj('studio-bgmvol', '0.5');
    maj('studio-rate', '1.2');
    return window.__studioPayload();
  }, CONTRAT);

  const attendu = {
    video_subject: 'Sujet bancaire', video_language: 'fr', paragraph_number: 1,
    match_materials_to_script: true, video_source: 'pexels', video_aspect: '9:16',
    video_concat_mode: 'random', video_fit_mode: 'cover',
    video_transition_mode: 'FadeIn', video_count: 1, video_clip_duration: 3,
    video_clip_speed: 1.5, n_threads: 2, voice_rate: 1.2, voice_volume: 1,
    bgm_volume: 0.5, subtitle_position: 'bottom',
    subtitle_display_mode: 'word_by_word', subtitle_animation: 'pop_spring',
    custom_position: 70, font_size: 80, text_fore_color: '#FFEEDD',
    stroke_color: '#112233', stroke_width: 3,
  };
  Object.keys(attendu).forEach(k => {
    const got = payload[k], exp = attendu[k];
    check('VideoParams.' + k + ' = ' + JSON.stringify(exp),
      got === exp, 'reçu ' + JSON.stringify(got));
  });

  // Les anciens noms FAUX ne doivent plus apparaître : MPT les ignore ou les
  // refuse, et le symptôme serait « la musique ne joue pas » / « le texte est
  // noir » — un défaut qu'on imputerait au service.
  check('la charge utile ne porte plus "bgm_type"',
    !('bgm_type' in payload), JSON.stringify(payload.bgm_type));
  check('la charge utile ne porte plus "text_color"',
    !('text_color' in payload), JSON.stringify(payload.text_color));
  check('la charge utile porte bien "text_fore_color"',
    'text_fore_color' in payload);
  check('les chaînes vides sont OMISES (video_script absent)',
    !('video_script' in payload), JSON.stringify(payload.video_script));
  check('le fond désactivé est un BOOLÉEN, pas une chaîne',
    payload.text_background_color === false, JSON.stringify(payload.text_background_color));

  // ─── 6. Restauration des valeurs par défaut ─────────────────────────
  console.log('\n--- 6. RÉGLAGES PAR DÉFAUT ---');
  const defauts = await page.evaluate(() => {
    const avant = {
      sujet: document.getElementById('studio-subject').value,
      aspect: document.getElementById('studio-aspect').value,
    };
    document.getElementById('studio-reset').click();
    return {
      avant,
      apres: {
        sujet: document.getElementById('studio-subject').value,
        aspect: document.getElementById('studio-aspect').value,
        vitesse: document.getElementById('studio-speed').value,
        vitesseEtiq: document.getElementById('studio-speed-val').textContent.trim(),
      },
    };
  });
  check('la réinitialisation vide le sujet',
    defauts.avant.sujet !== '' && defauts.apres.sujet === '', JSON.stringify(defauts.avant));
  check('la réinitialisation remet le format à 9:16',
    defauts.apres.aspect === '9:16', defauts.apres.aspect);
  check('la réinitialisation remet la vitesse à 1',
    defauts.apres.vitesse === '1' && /1[,.]00/.test(defauts.apres.vitesseEtiq),
    defauts.apres.vitesse + ' / ' + defauts.apres.vitesseEtiq);

  // ─── 7. Options avancées repliées ───────────────────────────────────
  console.log('\n--- 7. OPTIONS AVANCÉES ---');
  const adv = await page.evaluate(() => {
    const d = document.querySelector('details.studio-adv');
    if (!d) return { present: false };
    const ferme = !d.open;
    d.open = true;
    const sys = document.getElementById('studio-sys-prompt');
    return { present: true, ferme, sysVisible: sys ? sys.offsetParent !== null : false };
  });
  check('le bloc d\'options avancées existe', adv.present);
  check('il est REPLIÉ par défaut', adv.ferme === true);
  check('l\'invite système devient visible une fois déplié', adv.sysVisible === true);

  check('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  console.log('\n============================');
  console.log('  RESULTAT : ' + ok + '/' + (ok + ko));
  console.log('============================');
  await browser.close();
  process.exit(ko === 0 ? 0 : 1);
})().catch(e => { console.error('Echec du banc :', e.message); process.exit(1); });
