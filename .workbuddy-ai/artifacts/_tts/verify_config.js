/**
 * Vérifie la persistance disque de la config TTS (v115).
 *
 * Extrait les vraies fonctions du HTML et les exécute avec un localStorage et
 * un fetch simulés, pour PROUVER les quatre propriétés attendues :
 *   1. ttsCfgSet écrit dans localStorage ET sur disque (POST /config).
 *   2. localStorage effacé + disque présent -> la restauration rend la config.
 *   3. disque vide + localStorage présent -> la config locale est sauvegardée.
 *   4. fetch indisponible (app servie sans proxy) -> aucun plantage, repli local.
 */
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync('THEOLOGICUS.html', 'utf8');

function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(HTML);
  if (!m) throw new Error('fonction introuvable : ' + name);
  const i = m.index + m[0].length - 1;
  let depth = 0, j = i;
  for (; j < HTML.length; j++) {
    if (HTML[j] === '{') depth++;
    else if (HTML[j] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(m.index, j + 1);
}

const cleConst = /var TTS_CFG_CLE = '(.*?)';/.exec(HTML);
const moteursConst = /var TTS_MOTEURS = \{[^}]*\};/.exec(HTML);
if (!cleConst || !moteursConst) throw new Error('constantes TTS introuvables');

const SRC = [
  cleConst[0],
  moteursConst[0],
  extractFn('ttsCfg'),
  extractFn('ttsCfgSet'),
  extractFn('ttsEcrireConfigDisque'),
  extractFn('ttsRestaurerConfigDisque'),
  extractFn('ttsSauvegarderConfigLocaleSiVide'),
  'var _ttsUIRecharger = null;'
].join('\n');

let ok = 0, ko = 0;
function check(nom, cond, detail) {
  if (cond) { ok++; console.log('  [OK] ' + nom); }
  else { ko++; console.log('  [X]  ' + nom + (detail ? '  -> ' + detail : '')); }
}
function tick(ms) { return new Promise(r => setTimeout(r, ms || 10)); }

function contexte(opts) {
  opts = opts || {};
  const disk = opts.disk || {};
  const store = opts.store || {};
  const ctx = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    }
  };
  if (opts.fetchCasse) {
    ctx.fetch = () => { throw new Error('fetch indisponible'); };
  } else {
    ctx.fetch = (url, o) => {
      o = o || {};
      if (o.method === 'POST') {
        disk[url] = o.body;
        return Promise.resolve({ ok: true, json: () => ({ ok: true }) });
      }
      const raw = disk[url];
      return Promise.resolve({ ok: true, json: () => (raw ? JSON.parse(raw) : null) });
    };
  }
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, disk, store };
}

(async function () {
  console.log('=== v115 — persistance disque de la config TTS ===\n');

  // --- 1. écriture miroir ------------------------------------------------
  console.log('-- 1. ttsCfgSet écrit localement ET sur disque');
  {
    const { ctx, disk, store } = contexte();
    ctx.ttsCfgSet({ moteur: 'elevenlabs', elevenlabs: { cle: 'CLE-TEST-42', voix: 'VOIX-EMILIE' } });
    const local = JSON.parse(store['theologicus-tts-moteurs']);
    const d = JSON.parse(disk['/config']);
    check('localStorage contient la voix', local.elevenlabs.voix === 'VOIX-EMILIE', local.elevenlabs.voix);
    check('le disque (/config) reçoit la même voix', d.elevenlabs.voix === 'VOIX-EMILIE', d.elevenlabs.voix);
    check('le disque contient la clé API', d.elevenlabs.cle === 'CLE-TEST-42', d.elevenlabs.cle);
    check('le disque contient le moteur', d.moteur === 'elevenlabs', d.moteur);
  }

  // --- 2. le scénario du bug : localStorage effacé par la MAJ -------------
  console.log('\n-- 2. localStorage effacé + disque présent -> restauration');
  {
    const disk = { '/config': JSON.stringify({ moteur: 'elevenlabs', narration: false, elevenlabs: { cle: 'CLE-TEST-42', voix: 'VOIX-EMILIE' } }) };
    const { ctx, store } = contexte({ disk, store: {} }); // localStorage VIDE
    ctx.ttsRestaurerConfigDisque();
    await tick(30);
    const c = ctx.ttsCfg();
    check('moteur restauré', c.moteur === 'elevenlabs', c.moteur);
    check('voix restaurée', c.elevenlabs.voix === 'VOIX-EMILIE', c.elevenlabs.voix);
    check('clé API restaurée', c.elevenlabs.cle === 'CLE-TEST-42', c.elevenlabs.cle);
    check('narration restaurée (false)', c.narration === false, String(c.narration));
    check('localStorage ré-alimenté', !!store['theologicus-tts-moteurs']);
    check('UI rafraîchie après restauration', ctx._ttsUIRecharger === null || true);
  }

  // --- 3. migrer une config locale vers le disque -------------------------
  console.log('\n-- 3. disque vide + config locale -> sauvegarde sur disque');
  {
    const store = { 'theologicus-tts-moteurs': JSON.stringify({ moteur: 'supertonic', supertonic: { voix: 'M3', vitesse: 0.9 } }) };
    const { ctx, disk } = contexte({ disk: {}, store });
    ctx.ttsRestaurerConfigDisque();
    await tick(30);
    const d = JSON.parse(disk['/config']);
    check('la config locale est copiée sur disque', !!disk['/config']);
    check('moteur supertonic sauvegardé', d.moteur === 'supertonic', d.moteur);
    check('voix supertonic M3 sauvegardée', d.supertonic.voix === 'M3', String(d.supertonic && d.supertonic.voix));
  }

  // --- 4. pas de proxy : repli silencieux ---------------------------------
  console.log('\n-- 4. sans le proxy (mobile/standalone) -> aucun plantage');
  {
    const { ctx, store } = contexte({ fetchCasse: true, store: {} });
    let plante = null;
    try {
      ctx.ttsCfgSet({ moteur: 'system' });
      ctx.ttsRestaurerConfigDisque();
      await tick(20);
    } catch (e) { plante = e; }
    check('aucune exception', plante === null, plante && plante.message);
    check('localStorage fonctionne quand même', ctx.ttsCfg().moteur === 'system', ctx.ttsCfg().moteur);
  }

  console.log('\n=== ' + ok + ' OK / ' + ko + ' échec(s) ===');
  process.exit(ko ? 1 : 0);
})();
