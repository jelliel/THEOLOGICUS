// Compare deux relevés produits par contraste_jetons.js --json.
//
// Piège que ce script existe pour éviter : un contraste qui BAISSE n'est pas
// une régression. Quand une déclaration jusque-là ignorée se met enfin à
// s'appliquer, l'élément abandonne la couleur ou le fond hérités — souvent du
// blanc très contrasté — pour sa couleur propre, moins contrastée mais VOULUE.
// Exemple mesuré : .badge-plasma passe de 15,38:1 (texte blanc hérité sur fond
// de carte) à 6,35:1 (texte plasma sur fond plasma). C'est le but recherché.
//
// Le seul verdict qui compte est donc l'ENSEMBLE des éléments sous le seuil :
//   - présents APRÈS mais pas AVANT  -> régression réelle
//   - présents AVANT mais pas APRÈS  -> panne corrigée
//
// Usage : node comparer_releves.js avant.json apres.json [--seuil 3]

const fs = require("fs");

const args = process.argv.slice(2);
const fichiers = args.filter(a => !a.startsWith("--"));
const SEUIL = args.includes("--seuil") ? parseFloat(args[args.indexOf("--seuil") + 1]) : 3;
const [fAvant, fApres] = fichiers;
if (!fAvant || !fApres) { console.error("usage : node comparer_releves.js avant.json apres.json [--seuil 3]"); process.exit(2); }

const avant = JSON.parse(fs.readFileSync(fAvant, "utf8"));
const apres = JSON.parse(fs.readFileSync(fApres, "utf8"));

const sousSeuil = (releve) => {
  const s = new Set();
  for (const [t, d] of Object.entries(releve)) {
    for (const c of (d.cibles || [])) {
      if (c.ratio !== null && c.ratio < SEUIL) s.add(`${t}  ${c.sel}  ${c.ratio}:1`);
    }
  }
  return s;
};

const sa = sousSeuil(avant), sb = sousSeuil(apres);
const nouvelles = [...sb].filter(x => !sa.has(x.split("  ").slice(0, 2).join("  ")) && ![...sa].some(y => y.startsWith(x.split("  ").slice(0, 2).join("  "))));
const reglees = [...sa].filter(x => ![...sb].some(y => y.startsWith(x.split("  ").slice(0, 2).join("  "))));

// Détail : jetons qui passent de vide à une valeur.
const jetonsRemplis = [];
for (const [t, d] of Object.entries(apres)) {
  const da = avant[t] || { jetons: {} };
  for (const [j, v] of Object.entries(d.jetons || {})) {
    const va = (da.jetons || {})[j];
    if (va !== v) jetonsRemplis.push(`${t.padEnd(10)} ${j.padEnd(14)} ${String(va).padEnd(30)} -> ${v}`);
  }
}

console.log(`Jetons dont la valeur change : ${jetonsRemplis.length}`);
for (const l of jetonsRemplis) console.log("  " + l);

console.log(`\nÉléments sous ${SEUIL}:1 — AVANT : ${sa.size}`);
for (const l of [...sa].sort()) console.log("  " + l);
console.log(`\nÉléments sous ${SEUIL}:1 — APRÈS : ${sb.size}`);
for (const l of [...sb].sort()) console.log("  " + l);

console.log(`\n──── VERDICT ────`);
console.log(`  pannes corrigées (sous le seuil avant, plus après) : ${reglees.length}`);
for (const l of reglees) console.log("    + " + l);
console.log(`  RÉGRESSIONS (sous le seuil après, pas avant)       : ${nouvelles.length}`);
for (const l of nouvelles) console.log("    - " + l);

process.exit(nouvelles.length === 0 ? 0 : 1);
