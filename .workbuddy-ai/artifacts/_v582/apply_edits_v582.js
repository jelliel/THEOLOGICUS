/* v582 — Export des 20 agents théologiques (🎓 AGENTS) au format des
   agents utilisateur (importable via « Importer un agent »). */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls présents — abort'); process.exit(1); }
const M574 = 'v527-agents-script';
function lignes(a) { return a.join('\r\n'); }
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
}

/* E1 — le bouton dans le pied du panneau */
dansModule(M574,
  lignes(["      + '<button class=\"ui-btn\" id=\"v527-installe\">↻ (Ré)installer</button></div></div>';"]),
  lignes([
    "      + '<button class=\"ui-btn\" id=\"v527-export\">⬇ Exporter les ' + PRESETS.length + ' (JSON)</button>'",
    "      + '<button class=\"ui-btn\" id=\"v527-installe\">↻ (Ré)installer</button></div></div>';"
  ]),
  'bouton export'
);

/* E2 — le handler (schéma identique aux agents utilisateur : name+desc+…) */
dansModule(M574,
  lignes([
    "    p.querySelector('#v527-installe').addEventListener('click', async function () {",
    "      var r = await seme(); toast(r.poses ? r.poses + ' agent(s) installé(s)' : 'Déjà installés', 'success'); rendre();",
    "    });"
  ]),
  lignes([
    "    p.querySelector('#v527-installe').addEventListener('click', async function () {",
    "      var r = await seme(); toast(r.poses ? r.poses + ' agent(s) installé(s)' : 'Déjà installés', 'success'); rendre();",
    "    });",
    "    /* v582 — export des agents théologiques au format des agents utilisateur :",
    "       importable tel quel via « Importer un agent » (id regénéré à l'import). */",
    "    p.querySelector('#v527-export').addEventListener('click', function () {",
    "      try {",
    "        const data = PRESETS.map(function (x) {",
    "          return { id: x.id, name: x.name, desc: x.desc, instructions: x.instructions || '',",
    "            primer: x.primer || '', tags: x.tags || [], temperature: (x.temp == null ? 0.7 : x.temp),",
    "            maxTokens: 4096, style: x.style || '', forbidden: x.forbidden || '', memPrio: 3,",
    "            source: 'theologicus-preset' };",
    "        });",
    "        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });",
    "        const u = URL.createObjectURL(blob);",
    "        const a = document.createElement('a');",
    "        a.href = u; a.download = 'agents-theologiques-theologicus.json';",
    "        document.body.appendChild(a); a.click(); a.remove();",
    "        setTimeout(function () { try { URL.revokeObjectURL(u); } catch (e) {} }, 1000);",
    "        toast('⬇ ' + data.length + ' agents théologiques exportés — importables via « Importer un agent »', 'success');",
    "      } catch (e) { toast('Export impossible : ' + String(e && e.message || e), 'error'); }",
    "    });"
  ]),
  'handler export'
);

fs.writeFileSync(F, src, 'utf8');
console.log('  ✓ v582 : export des agents théologiques ajouté au panneau 🎓');
