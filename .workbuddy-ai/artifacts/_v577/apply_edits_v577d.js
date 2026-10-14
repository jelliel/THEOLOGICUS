/* ═══════════════════════════════════════════════════════════════════════
   Lot v577 — PARTIE 4 : RAG CEC + Denzinger dans __v574Chercher.
   « Que dit l’Église sur… » → le bloc SOURCES LOCALES cite désormais des
   § du Catéchisme (tradition/cec/cec_fr.json — {paragraphes:[{n,t}]}) et
   des textes du Denzinger (130 fichiers ddz_NNN.js, même extraction que
   la concordance v530). ════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls présents — abort'); process.exit(1); }
const LOG = [];
const M574 = 'v574-adeodat-v3i';
function dansModule(anc, nouv, nom) {
  const deb = src.indexOf('<script id="' + M574 + '">');
  if (deb === -1) { console.error('module ' + M574 + ' introuvable'); process.exit(1); }
  let fin = src.indexOf('<script id=', deb + 10);
  const finBody = src.indexOf('</body>', deb);
  if (fin === -1 || (finBody !== -1 && finBody < fin)) fin = finBody;
  const avant = src.slice(0, deb), milieu = src.slice(deb, fin), apres = src.slice(fin);
  const n = milieu.split(anc).length - 1;
  if (n !== 1) { console.error('ANCRAGE [' + nom + '] trouvé ' + n + ' fois'); process.exit(1); }
  src = avant + milieu.replace(anc, () => nouv) + apres;
  LOG.push(nom);
}
function lignes(a) { return a.join('\r\n'); }

/* E1 — loaders + cibler, insérés avant l’export */
dansModule(
  lignes(["  window.__v574Chercher = { chercher: chercher, mots: mots };"]),
  lignes([
    '  /* v577 — Catéchisme (CEC) + Denzinger : « que dit l’Église… » */',
    '  let docsCec = null, docsDenz = null;',
    '  async function assurerCec() {',
    '    if (docsCec) return docsCec;',
    '    const r = await fetch("tradition/cec/cec_fr.json", { cache: "no-store" });',
    '    const j = r.ok ? await r.json() : null;',
    '    docsCec = ((j && j.paragraphes) || []).map(function (p) { return { ref: "§" + p.n, texte: String(p.t || "") }; }).filter(function (p) { return p.texte.length > 30; });',
    '    return docsCec;',
    '  }',
    '  async function assurerDenz() {',
    '    if (docsDenz) return docsDenz;',
    '    const docs = [];',
    '    await new Promise(function (fini) {',
    '      let restant = 130;',
    '      for (let i = 1; i <= 130; i++) {',
    '        (function (i) {',
    '          fetch("denzinger/ddz_" + ("00" + i).slice(-3) + ".js").then(function (r) { return r.ok ? r.text() : null; }).then(function (t) {',
    '            if (t) {',
    '              try {',
    '                const kd = t.lastIndexOf("__denzingerWorks[");',
    '                const pos = kd >= 0 ? t.indexOf("=", kd) : t.lastIndexOf("=");',
    '                const j = JSON.parse(t.slice(pos + 1).replace(/;\\s*$/, ""));',
    '                Object.keys(j).forEach(function (k) {',
    '                  const w = j[k]; if (!w) return;',
    '                  (w.c || []).forEach(function (ch) {',
    '                    (ch.s || []).forEach(function (se) {',
    '                      (se.p || []).forEach(function (p) {',
    '                        if (typeof p === "string" && p.length > 20) docs.push({ ref: (w.t || k) + " §" + (se.t || ""), texte: p });',
    '                      });',
    '                    });',
    '                  });',
    '                });',
    '              } catch (e) {}',
    '            }',
    '          }).catch(function () {}).then(function () { if (--restant === 0) fini(); });',
    '        })(i);',
    '      }',
    '    });',
    '    docsDenz = docs;',
    '    return docs;',
    '  }',
    '  function cibler(docs, kws, nMax) {',
    '    const scores = [];',
    '    for (let i = 0; i < docs.length; i++) {',
    '      const d = docs[i], n = norm(d.texte);',
    '      let dist = 0, score = 0;',
    '      for (let k = 0; k < kws.length; k++) {',
    '        let c = 0, p = 0;',
    '        while ((p = n.indexOf(kws[k], p)) >= 0) { c++; p += kws[k].length; }',
    '        if (c) { dist++; score += c * (kws[k].length >= 6 ? 2 : 1); }',
    '      }',
    '      if (dist) scores.push({ d: d, s: score + dist * 10 });',
    '    }',
    '    scores.sort(function (a, b) { return b.s - a.s; });',
    '    return scores.slice(0, nMax).map(function (x) { return x.d; });',
    '  }',
    '  window.__v574Chercher = { chercher: chercher, mots: mots };'
  ]),
  'loaders CEC/Denzinger'
);

/* E2 — chercher : récupération + test de vacuité élargi */
dansModule(
  lignes([
    '    if (!extraits.length && !peres.length && !vlt.length) return null;'
  ]),
  lignes([
    '    /* v577 — Catéchisme + Denzinger */',
    '    let cat = [], denz = [];',
    '    try { cat = cibler(await assurerCec(), kws, 3); } catch (eC1) {}',
    '    try { denz = cibler(await assurerDenz(), kws, 3); } catch (eD1) {}',
    '    if (!extraits.length && !peres.length && !vlt.length && !cat.length && !denz.length) return null;'
  ]),
  'chercher + cat/denz'
);

/* E3 — lignes de sources + objet rendu */
dansModule(
  lignes([
    '    return {',
    '      extraits: extraits, peres: peres, vlt: vlt,',
    '      bloc: "SOURCES LOCALES TROUVÉES DANS LES CORPUS EMBARQUÉS DE THEOLOGICUS (utilise-les si elles sont pertinentes et cite leurs références entre parenthèses, par ex. (Jn 3:16)) :\\n" + lignesR.join("\\n")'
  ]),
  lignes([
    '    cat.forEach(function (p) { lignesR.push("- Catéchisme de l’Église catholique " + p.ref + " : « " + String(p.texte).slice(0, 240) + " »"); });',
    '    denz.forEach(function (p) { lignesR.push("- Denzinger — " + p.ref + " : « " + String(p.texte).slice(0, 240) + " »"); });',
    '    return {',
    '      extraits: extraits, peres: peres, vlt: vlt, cat: cat, denz: denz,',
    '      bloc: "SOURCES LOCALES TROUVÉES DANS LES CORPUS EMBARQUÉS DE THEOLOGICUS (utilise-les si elles sont pertinentes et cite leurs références entre parenthèses, par ex. (Jn 3:16), (CEC §27), (Denzinger §150)) :\\n" + lignesR.join("\\n")'
  ]),
  'lignesR cat/denz + return'
);

fs.writeFileSync(F, src, 'utf8');
LOG.forEach(l => console.log('  ✓ ' + l));
console.log('PARTIE 4 écrite.');
