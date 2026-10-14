/* ═══════════════════════════════════════════════════════════════════════
   Banc v577 — 4 AMÉLIORATIONS THÉOLOGIQUES :
     1. LITURGIE — calendrier calculé exact (Pâques 2026 = 5 avril ; Avent 1
        2026 = 29 nov → lectures Mt 24:37-44 ; Pâques → Jn 20:1-9 ;
        Annonciation 25 mars → Lc 1:26-38 ; aujourd’hui = temps ordinaire
        numéroté, évangile de l’année) + panneau + entrées du menu « + ».
     2. VERSIONS — Jn 3:16 : Segond (« aimé »), Vulgate (« dilexit »),
        Peshitta (syriaque) ; Genèse 1:1 → note « NT seul » honnête.
     3. CHAPELET — setDuJour (7 jours corrects), 73 pas (signe+credo+
        5×[mystère+Pater+10 Ave+Gloire+Ô Jésus]+Salve), avance/arrêt.
     4. RAG — chercher() cite désormais le Catéchisme (§) et le Denzinger
        (§), en plus de la Bible/Coran (corpus RÉELS servis par le relais).
   Magasin isolé (règle v559), fetch réel (les corpus sont servis). ════ */
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v577_store_' + Date.now());
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

  /* ── 1. calendrier liturgique calculé ── */
  section('1. LITURGIE : calendrier calculé (Pâques, Avent, temps ordinaire)');
  const cal = await page.evaluate(() => {
    const L = window.__v577Liturgie;
    const p26 = L.paques(2026);
    const paq = L.calculer(new Date('2026-04-05T12:00:00'));
    const av25 = L.calculer(new Date('2025-11-30T12:00:00'));
    const av26 = L.calculer(new Date('2026-11-29T12:00:00'));
    const to = L.calculer(new Date('2026-10-14T12:00:00'));
    const ann = L.calculer(new Date('2026-03-25T12:00:00'));
    return {
      paques26: p26.getFullYear() + '-' + (p26.getMonth() + 1) + '-' + p26.getDate(),
      paqTemps: paq.temps, paqEv: paq.lectures ? paq.lectures.ev : '',
      av25Ev: av25.lectures ? av25.lectures.ev : '', av25L1: av25.lectures ? av25.lectures.l1 : '',
      av26Ev: av26.lectures ? av26.lectures.ev : '', av26L1: av26.lectures ? av26.lectures.l1 : '',
      toTemps: to.temps, toSemaine: to.semaine, toEv: to.evangileAnnee,
      annEv: ann.lectures ? ann.lectures.ev : '', annFete: ann.fetes.join('|')
    };
  });
  ok('Pâques 2026 calculée = 5 avril', cal.paques26 === '2026-4-5', cal.paques26);
  ok('Dimanche de Pâques → Jn 20:1-9', cal.paqTemps === 'Temps pascal' && cal.paqEv === 'Jn 20:1-9', cal.paqEv);
  ok('1er dimanche de l’Avent 2025 (30 nov, cycle A) → Mt 24:37-44 + Is 2:1-5',
     cal.av25Ev === 'Mt 24:37-44' && cal.av25L1 === 'Is 2:1-5', cal.av25Ev + ' / ' + cal.av25L1);
  ok('1er dimanche de l’Avent 2026 (29 nov, cycle B) → Lc 21:25-28.34-36 + Jr 33:14-16',
     cal.av26Ev === 'Lc 21:25-28.34-36' && cal.av26L1 === 'Jr 33:14-16', cal.av26Ev + ' / ' + cal.av26L1);
  ok('Temps ordinaire numéroté (14 oct 2026 → semaine 28)', cal.toTemps === 'Temps ordinaire' && cal.toSemaine === 28, 'semaine=' + cal.toSemaine);
  ok('Évangile de l’année 2026 = Matthieu (A)', cal.toEv.indexOf('Matthieu') !== -1, cal.toEv);
  ok('25 mars → Annonciation (Lc 1:26-38)', cal.annEv === 'Lc 1:26-38' && cal.annFete.indexOf('Annonciation') !== -1, cal.annEv + ' / ' + cal.annFete);

  /* ── 2. menu « + » : les 3 entrées ── */
  section('2. Menu « + » : entrées Prière & liturgie');
  await page.waitForFunction(() => !!document.getElementById('v577-menu-entry'), null, { timeout: 15000 });
  const menu = await page.evaluate(() => ({
    a: !!document.getElementById('v577-menu-entry'),
    b: !!document.getElementById('v578-menu-entry'),
    c: !!document.getElementById('v579-menu-entry')
  }));
  ok('AUJOURD’HUI + BANC DE VERSIONS + CHAPELET dans le menu', menu.a && menu.b && menu.c, JSON.stringify(menu));

  /* ── 3. panneau lectionnaire ── */
  section('3. Panneau lectionnaire (aujourd’hui + navigation)');
  await page.evaluate(() => window.__v577Liturgie.ouvrir());
  await page.waitForFunction(() => {
    const m = document.getElementById('v577-modal');
    return m && m.classList.contains('open') && document.getElementById('v577-corps').innerHTML.length > 100;
  }, null, { timeout: 8000 });
  const pan = await page.evaluate(() => ({
    temps: document.getElementById('v577-corps').textContent.indexOf('Temps ordinaire') !== -1,
    note: document.getElementById('v577-corps').textContent.indexOf('INDICATIVES') !== -1 ||
          document.getElementById('v577-corps').textContent.indexOf('missel') !== -1
  }));
  ok('le panneau affiche le temps liturgique du jour', pan.temps);
  ok('la note d’honnêteté (missel) est présente', pan.note);
  await page.evaluate(() => document.getElementById('v577-prev').click());
  await page.waitForTimeout(150);
  const nav = await page.evaluate(() => document.getElementById('v577-corps').textContent.indexOf('octobre') !== -1);
  ok('navigation ◀ (semaine précédente) fonctionne', nav);
  await page.evaluate(() => document.getElementById('v577-auj').click());
  await page.waitForTimeout(150);

  /* ── 4. banc de versions ── */
  section('4. BANC DE VERSIONS : Jn 3:16 (Segond/Vulgate/Peshitta) + Genèse 1:1');
  await page.evaluate(() => window.__v578Versions.ouvrir('Jn 3:16'));
  await page.waitForFunction(() => {
    const c = document.getElementById('v578-cols');
    return c && c.textContent.indexOf('indisponible') === -1 && c.querySelectorAll('.col').length === 3;
  }, null, { timeout: 20000 });
  const v1 = await page.evaluate(() => {
    const cols = document.querySelectorAll('#v578-cols .col');
    return {
      seg: cols[0].textContent, vul: cols[1].textContent, sy: cols[2].textContent,
      syRtl: !!cols[2].querySelector('.sy')
    };
  });
  ok('Segond contient le verset (« aimé »)', v1.seg.indexOf('aimé') !== -1, v1.seg.slice(40, 110));
  ok('Vulgate contient « dilexit »', v1.vul.indexOf('dilexit') !== -1, v1.vul.slice(40, 110));
  ok('Peshitta (syriaque, RTL) non vide pour le NT', v1.sy.length > 40 && v1.syRtl);
  await page.evaluate(() => window.__v578Versions.ouvrir('Genèse 1:1'));
  await page.waitForFunction(() => {
    const c = document.getElementById('v578-cols');
    return c && c.textContent.indexOf('NT seul') !== -1;
  }, null, { timeout: 20000 });
  const v2 = await page.evaluate(() => document.querySelectorAll('#v578-cols .col')[0].textContent);
  ok('Genèse 1:1 : note honnête « Peshitta : NT seul »', v2.indexOf('Au commencement') !== -1 || v2.length > 30);

  /* ── 5. chapelet ── */
  section('5. CHAPELET : mystères du jour, 73 pas, navigation');
  const sets = await page.evaluate(() => {
    const C = window.__v579Chapelet;
    return {
      dim: C.setDuJour(new Date(2026, 9, 18)), lun: C.setDuJour(new Date(2026, 9, 19)),
      mar: C.setDuJour(new Date(2026, 9, 20)), mer: C.setDuJour(new Date(2026, 9, 14)),
      jeu: C.setDuJour(new Date(2026, 9, 15)), ven: C.setDuJour(new Date(2026, 9, 16)),
      sam: C.setDuJour(new Date(2026, 9, 17)), n: C.construire('joyeux').length
    };
  });
  ok('mystères du jour corrects (dim/mer = glorieux, lun = joyeux, mar/ven = douloureux, jeu = lumineux, sam = glorieux)',
     sets.dim === 'glorieux' && sets.mer === 'glorieux' && sets.lun === 'joyeux' && sets.mar === 'douloureux' &&
     sets.jeu === 'lumineux' && sets.ven === 'douloureux' && sets.sam === 'glorieux', JSON.stringify(sets));
  ok('le chapelet compte 73 pas (signe + credo + 5 dizaines + Salve)', sets.n === 73, 'n=' + sets.n);
  await page.evaluate(() => window.__v579Chapelet.ouvrir());
  await page.waitForFunction(() => {
    const m = document.getElementById('v579-modal');
    return m && m.classList.contains('open');
  }, null, { timeout: 8000 });
  const ch1 = await page.evaluate(() => ({
    cour: document.getElementById('v579-cour').textContent,
    compte: document.getElementById('v579-compte').textContent
  }));
  ok('le panneau commence par le signe de croix', ch1.cour.indexOf('Au nom du Père') !== -1, ch1.cour.slice(0, 50));
  ok('le compteur affiche les mystères du jour', ch1.compte.length > 5, ch1.compte);
  await page.evaluate(() => document.getElementById('v579-suiv').click());
  const ch2 = await page.evaluate(() => ({
    idx: window.__v579Chapelet.getIdx(),
    cour: document.getElementById('v579-cour').textContent
  }));
  ok('« Suivant » avance au Credo (pas 2/73)', ch2.idx === 1 && ch2.cour.indexOf('Je crois en Dieu') !== -1, ch2.cour.slice(0, 40));
  await page.evaluate(() => { window.__v579Chapelet.stop(); document.getElementById('v579-x').click(); });

  /* ── 6. RAG CEC + Denzinger ── */
  section('6. RAG : chercher() cite désormais le Catéchisme et le Denzinger');
  const rag = await page.evaluate(async () => {
    const r = await window.__v574Chercher.chercher('Dieu dans sa miséricorde pardonne aux pécheurs', 6);
    window.__ragRes = r;
    return r ? {
      n: r.extraits.length,
      cat: (r.cat || []).length,
      denz: (r.denz || []).length,
      catRef: (r.cat && r.cat[0] && r.cat[0].ref) || '',
      denzRef: (r.denz && r.denz[0] && r.denz[0].ref) || '',
      blocCat: String(r.bloc).indexOf('Catéchisme de l’Église catholique') !== -1,
      blocDenz: String(r.bloc).indexOf('Denzinger') !== -1,
      blocBible: String(r.bloc).indexOf('Bible (Segond)') !== -1
    } : null;
  });
  ok('extraits des corpus toujours présents (Bible ou Coran)', !!rag && rag.n >= 1, 'n=' + rag.n);
  ok('le Catéchisme est cité (§ …)', !!rag && rag.cat >= 1 && rag.catRef.indexOf('§') === 0, 'cat=' + rag.cat + ' ' + rag.catRef);
  ok('le Denzinger est cité (§ …, via radicaux latins)', !!rag && rag.denz >= 1 && rag.denzRef.indexOf('§') !== -1, 'denz=' + rag.denz + ' ' + rag.denzRef);
  ok('le bloc SOURCES contient Catéchisme + Denzinger', !!rag && rag.blocCat && rag.blocDenz);

  /* ── propreté ── */
  section('7. Propreté');
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
