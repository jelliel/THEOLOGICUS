/* v583 — correctif import : l'app re-binde initAgentImport APRÈS notre
   rebind (init différée) → marquer le HANDLER (pas l'input) et
   ré-affirmer le nôtre périodiquement. */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls présents — abort'); process.exit(1); }
const M = 'v583-agents-io';
function lignes(a) { return a.join('\r\n'); }
function dansModule(anc, nouv, nom) {
  const deb = src.indexOf('<script id="' + M + '">');
  if (deb === -1) { console.error('module ' + M + ' introuvable'); process.exit(1); }
  let fin = src.indexOf('<script id=', deb + 10);
  const finBody = src.indexOf('</body>', deb);
  if (fin === -1 || (finBody !== -1 && finBody < fin)) fin = finBody;
  const avant = src.slice(0, deb), milieu = src.slice(deb, fin), apres = src.slice(fin);
  const n = milieu.split(anc).length - 1;
  if (n !== 1) { console.error('ANCRAGE [' + nom + '] trouvé ' + n + ' fois'); process.exit(1); }
  src = avant + milieu.replace(anc, () => nouv) + apres;
}

/* E1 — garde sur le HANDLER, pas sur l'input */
dansModule(
  lignes(["    if (!inp || inp.__v583) return;",
    "    inp.__v583 = true;",
    "    inp.onchange = async function (e) {"]),
  lignes(["    if (!inp || (inp.onchange && inp.onchange.__v583)) return;",
    "    const h583 = async function (e) {"]),
  'garde handler'
);

/* E2 — marqueur posé après la définition */
dansModule(
  lignes(["      inp.value = \"\";",
    "    };"]),
  lignes(["      inp.value = \"\";",
    "    };",
    "    h583.__v583 = true;",
    "    inp.onchange = h583;"]),
  'marqueur handler'
);

/* E3 — ré-affirmation périodique (l'app peut re-binder à tout moment) */
dansModule(
  lignes(["  const ivM = setInterval(function () { installerBouton(); if (document.getElementById(\"export-all-agents-btn\")) clearInterval(ivM); }, 600);"]),
  lignes(["  /* l’app peut re-binder onchange après coup (init différée) : on ré-affirme */",
    "  const ivM = setInterval(function () { installerBouton(); rebindImport(); }, 600);"]),
  'ré-affirmation périodique'
);

fs.writeFileSync(F, src, 'utf8');
console.log('  ✓ v583 : handler marqué + ré-affirmation périodique');
