/* ═══════════════════════════════════════════════════════════════════════
   Lot v577 — PARTIE 5 : correctifs après premier banc (17/24) :
     1. v579 : mercredi = MYSTÈRES GLORIEUX (règle standard du chapelet) ;
     2. v577 : la semaine du temps ordinaire se calcule AUSSI pour les
        jours de semaine (dimanche d’ouverture de la semaine liturgique) ;
     3. v577 : les fêtes de date fixe (Annonciation…) PRIMENT sur le cadre
        du temps (testées avant les branches de temps, sans return) ;
     4. v574 : le Denzinger (textes LATINS) est interrogé avec des
        radicaux tronqués (misericorde → miseric[ordia]).
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls présents — abort'); process.exit(1); }
const LOG = [];
function dansModule(idMod, anc, nouv, nom) {
  const deb = src.indexOf('<script id="' + idMod + '">');
  if (deb === -1) { console.error('module ' + idMod + ' introuvable'); process.exit(1); }
  let fin = src.indexOf('<script id=', deb + 10);
  const finBody = src.indexOf('</body>', deb);
  if (fin === -1 || (finBody !== -1 && finBody < fin)) fin = finBody;
  const avant = src.slice(0, deb), milieu = src.slice(deb, fin), apres = src.slice(fin);
  const n = milieu.split(anc).length - 1;
  if (n !== 1) { console.error('ANCRAGE [' + nom + '] dans ' + idMod + ' trouvé ' + n + ' fois'); process.exit(1); }
  src = avant + milieu.replace(anc, () => nouv) + apres;
  LOG.push(nom + ' @' + idMod);
}
function lignes(a) { return a.join('\r\n'); }

/* 1. mercredi = glorieux */
dansModule('v579-chapelet',
  lignes(['    return j === 0 || j === 6 ? "glorieux" : (j === 2 || j === 5 ? "douloureux" : (j === 4 ? "lumineux" : "joyeux"));']),
  lignes(['    return (j === 0 || j === 3 || j === 6) ? "glorieux" : (j === 2 || j === 5 ? "douloureux" : (j === 4 ? "lumineux" : "joyeux"));']),
  'mercredi = glorieux'
);

/* 2+3. v577 : fêtes prioritaires + semaine TO pour les jours de semaine */
dansModule('v577-liturgie',
  lignes([
    '    /* Avent (du 1er dimanche au 24 déc.) */'
  ]),
  lignes([
    '    /* fêtes de date fixe — une solennité prime sur le cadre du temps */',
    '    const cleFete = "fete-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);',
    '    if (L[cleFete]) { r.fetes.push(L[cleFete].t); if (!r.lectures) r.lectures = Object.assign({ cle: cleFete }, L[cleFete]); }',
    '    /* Avent (du 1er dimanche au 24 déc.) */'
  ]),
  'fêtes testées avant les temps'
);

dansModule('v577-liturgie',
  lignes([
    '    /* fêtes fixes */',
    '    const cleFete = "fete-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);',
    '    if (L[cleFete]) { r.fetes.push(L[cleFete].t); r.lectures = Object.assign({ cle: cleFete }, L[cleFete]); return r; }',
    '    /* temps ordinaire — numérotation du missel (34e semaine = dernière avant l’Avent) */',
    '    const a1Suiv = dimancheLePlusProcheDu30Nov(a);',
    '    const cr = addJ(a1Suiv, -7);            /* Christ-Roi */',
    '    r.temps = "Temps ordinaire";',
    '    if (d > trinite && d <= cr && d.getDay() === 0) {',
    '      const restants = Math.round((cr - dimAvantOuLe(d)) / 604800000);',
    '      r.semaine = 34 - restants;',
    '      if (memeJour(d, cr)) { r.lectures = Object.assign({ cle: "christ-roi-" + r.cycle }, L["christ-roi-" + r.cycle]); r.fetes.push("Christ Roi de l’univers"); }',
    '    } else if (d > bapteme && d < cendres) {',
    '      r.semaine = 1 + Math.floor((dimAvantOuLe(d) - addJ(bapteme, 1)) / 604800000);',
    '      if (r.semaine < 2) r.semaine = 2;',
    '    } else {',
    '      r.semaine = null;',
    '    }',
    '    return r;'
  ]),
  lignes([
    '    /* temps ordinaire — numérotation du missel (34e semaine = dernière avant l’Avent) ;',
    '       la semaine se calcule aussi pour les jours de semaine (dimanche d’ouverture) */',
    '    const a1Suiv = dimancheLePlusProcheDu30Nov(a);',
    '    const cr = addJ(a1Suiv, -7);            /* Christ-Roi */',
    '    r.temps = "Temps ordinaire";',
    '    const dimSem = dimAvantOuLe(d);',
    '    if (d > trinite && d <= cr) {',
    '      if (dimSem >= trinite) r.semaine = 34 - Math.round((cr - dimSem) / 604800000);',
    '      if (memeJour(d, cr)) { r.lectures = r.lectures || Object.assign({ cle: "christ-roi-" + r.cycle }, L["christ-roi-" + r.cycle]); r.fetes.push("Christ Roi de l’univers"); }',
    '    } else if (d > bapteme && d < cendres) {',
    '      r.semaine = 1 + Math.floor((dimAvantOuLe(d) - addJ(bapteme, 1)) / 604800000);',
    '      if (r.semaine < 2) r.semaine = 2;',
    '    } else {',
    '      r.semaine = null;',
    '    }',
    '    return r;'
  ]),
  'semaine TO jours de semaine + ancien bloc fêtes retiré'
);

/* 4. Denzinger : radicaux tronqués (textes latins) */
dansModule('v574-adeodat-v3i',
  lignes(['    try { denz = cibler(await assurerDenz(), kws, 3); } catch (eD1) {}']),
  lignes(['    /* textes latins : radicaux tronqués (misericorde → miseric…) */',
    '    try { denz = cibler(await assurerDenz(), kws.map(function (k) { return k.slice(0, 7); }).filter(function (k) { return k.length >= 5; }), 3); } catch (eD1) {}']),
  'denz radicaux'
);

fs.writeFileSync(F, src, 'utf8');
LOG.forEach(l => console.log('  ✓ ' + l));
console.log('PARTIE 5 écrite.');
