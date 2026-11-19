/* v706 — RÉFÉRENCES EXACTES DANS LES RÉPONSES.
   Vérifie que « 1 Jean 5:7-8 » reste « 1 Jean 5:7-8 » du prompt à la réponse,
   que les autres versets ne sont pas touchés, et que la correction vaut
   aussi pendant le streaming.
   Contrôle négatif : build pré-v706 → module absent. */
const path = require('path');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const HTML = 'file:///' + path.join(RACINE, 'THEOLOGICUS.html').replace(/\\/g, '/');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let charge = false;
  try { await page.waitForFunction(() => !!window.__v706Refs, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v706 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V706 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(1300);

  /* ── extraction : le préfixe est conservé, y compris sous forme abrégée ── */
  const extraits = await page.evaluate(() => {
    const V = window.__v706Refs;
    return {
      j1: V.extraire('1 Jean 5:7-8 — il y a ainsi trois à témoigner').map(x => x.ref),
      j2: V.extraire('2 Pierre 3:16 et 1 Corinthiens 13:4').map(x => x.ref),
      abr: V.extraire('1Jn 5,7-8 puis II Jean 1:1').map(x => x.ref),
      romain: V.extraire('I Jean 5:7').map(x => x.ref),
      sans: V.extraire('Jean 3:16 — évangile selon Jean').map(x => x.ref)
    };
  });
  ok('1 Jean 5:7-8 extrait avec son préfixe',
     extraits.j1.length === 1 && extraits.j1[0] === '1 Jean 5:7-8', JSON.stringify(extraits.j1));
  ok('plusieurs épîtres numérotées extraites', extraits.j2.length === 2 &&
     extraits.j2[0] === '2 Pierre 3:16' && extraits.j2[1] === '1 Corinthiens 13:4', JSON.stringify(extraits.j2));
  ok('abréviations et chiffres romains normés',
     extraits.abr.indexOf('1 Jean 5:7-8') !== -1 && extraits.abr.indexOf('3 Jean 1:1') === -1 &&
     extraits.romain[0] === '1 Jean 5:7', JSON.stringify({ abr: extraits.abr, romain: extraits.romain }));
  ok('un verset non numéroté ne crée pas de fausse référence', extraits.sans.length === 0);

  /* ── correction : ciblée, idempotente, sans toucher aux autres versets ── */
  const corr = await page.evaluate(() => {
    const V = window.__v706Refs, refs = V.extraire('1 Jean 5:7-8');
    const brut = 'Analyse critique du verset Jean 5:7-8 et de son absence.\n'
      + '1. Pourquoi Jean 5:7-8 est-il absent ?\n'
      + '2. Jean 3:16 reste un verset de l’évangile.\n'
      + '3. Déjà correct : 1 Jean 5:7-8.\n'
      + '4. Évangile de Jean 5:7-8 (volontaire).';
    const une = V.corriger(brut, refs), deux = V.corriger(une, refs);
    return {
      une: une, deux: deux,
      nbBare: (une.match(/(?<!\d )\bJean 5:7-8/g) || []).length,
      bon: (une.match(/1 Jean 5:7-8/g) || []).length,
      jean3: une.indexOf('Jean 3:16') !== -1,
      evangile: une.indexOf('Évangile de Jean 5:7-8') !== -1
    };
  });
  ok('les titres fautifs sont corrigés, l’évangile volontaire épargné',
     corr.nbBare === 1 && corr.bon >= 3, JSON.stringify({ nbBare: corr.nbBare, bon: corr.bon }));
  ok('correction idempotente (pas de « 1 1 Jean »)', corr.deux === corr.une);
  ok('Jean 3:16 et l’évangile cité volontairement sont intactes', corr.jean3 && corr.evangile);

  const bloc = await page.evaluate(() => {
    const V = window.__v706Refs;
    return { vide: V.bloc([]), plein: V.bloc(V.extraire('1 Jean 5:7-8')) };
  });
  ok('aucun bloc parasite sans référence numérotée', bloc.vide === '');
  ok('bloc prompt : référence exacte + avertissement de confusion',
     /1 Jean 5:7-8/.test(bloc.plein) && /Ne confonds PAS Jean/i.test(bloc.plein), bloc.plein.slice(0, 120));

  /* ── bout en bout : prompt envoyé ET réponse rendue ── */
  const e2e = await page.evaluate(async () => {
    const REPONSE = 'Analyse critique du verset Jean 5:7-8 et de son absence dans les manuscrits anciens.\n\n'
      + '1. Le problème textuel : Pourquoi Jean 5:7-8 est-il absent des manuscrits les plus anciens ?';
    let sys = '', corps = '';
    /* On stub le LLM (pas le transport) : aucun appel réseau, et le
       garde-fou v706 sur _sendMessageOriginal reste dans la chaîne. */
    window.callLLMStream = async function (cfg, messages) {
      sys = (messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
      corps = JSON.stringify(messages || []);
      return REPONSE;
    };
    state.apiKey = 'bench-key-0123456789';
    state.keys = { mistral: 'bench-key-0123456789' };
    state.model = 'mistral-large-2512';
    const avant = (state.messages || []).length;
    await window.sendMessage('1 Jean 5:7-8 — il y a ainsi trois à témoigner, explique ce verset absent');
    const messages = (state.messages || []).slice(avant);
    const assistant = messages.filter(m => m.role === 'assistant').pop();
    const txt = document.body.textContent;
    return {
      promptExact: sys.indexOf('1 Jean 5:7-8') !== -1 && /Ne confonds PAS Jean/i.test(sys),
      corpsExact: corps.indexOf('1 Jean 5:7-8') !== -1,
      reponse: assistant ? assistant.content : '',
      domOk: txt.indexOf('Analyse critique du verset 1 Jean 5:7-8') !== -1,
      stats: window.__v706Refs.stats()
    };
  });
  ok('le prompt contient la référence exacte avant l’appel', e2e.promptExact && e2e.corpsExact,
     JSON.stringify({ promptExact: e2e.promptExact, corpsExact: e2e.corpsExact }));
  ok('la réponse enregistrée garde « 1 Jean 5:7-8 »', /1 Jean 5:7-8/.test(e2e.reponse) &&
     !/(?<!\d )\bJean 5:7-8/.test(e2e.reponse), e2e.reponse.slice(0, 170));
  ok('le rendu affiche le bon verset', e2e.domOk);
  ok('corrections appliquées et comptées', e2e.stats >= 2, String(e2e.stats));

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V706 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
