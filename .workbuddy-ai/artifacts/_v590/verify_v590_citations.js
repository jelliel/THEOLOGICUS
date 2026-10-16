/* ═══════════════════════════════════════════════════════════════
   Banc v590 — VÉRIFICATION DE FIDÉLITÉ DES CITATIONS (tranche 1).
   Objet : le comparateur (texte cité ↔ texte réel du corpus).
   Contrat affirmé :
   1. citation exacte → conforme ;
   2. variantes TYPOGRAPHIQUES (majuscules, accents, « » vs " ", ’ vs ')
      → conforme, JAMAIS divergent ;
   3. citation partielle (mots contigus du verset) → conforme + partiel ;
   4. un mot SUBSTITUÉ → approximatif (surtout pas conforme : c'est le faux
      positif que ce module existe pour empêcher) ;
   5. paraphrase → divergent (ce n'est pas une citation) ;
   6. texte étranger → divergent ; entrée vide / trop courte / trop longue
      → indetermine, avec un motif ;
   7. normalisation partagée, idempotente ;
   8. module PUR : aucun élément DOM, aucune surface d'API superflue.
   Le texte de référence est LU depuis bible/b1.js — le banc ne teste donc pas
   une chaîne inventée. Magasin isolé (v559). ═══════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os"), fs = require("fs");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

/* Texte RÉEL du corpus : Genèse 1,1 lu dans bible/b1.js (livre n°1).
   Format du fichier : (window.__bibleBooks=window.__bibleBooks||{})[1]={...};
   On coupe au PREMIER « ]= » (celui de l'en-tête) — les suivants, s'il y en a,
   appartiendraient au JSON lui-même. */
function versetCorpus(livre, ch, v) {
  const s = fs.readFileSync(path.join(__dirname, "..", "..", "..", "bible", "b" + livre + ".js"), "utf8");
  const k = s.indexOf("]=");
  if (k < 0) return null;
  let payload = s.slice(k + 2).trim();
  if (payload.endsWith(";")) payload = payload.slice(0, -1);
  const data = JSON.parse(payload);
  return data[String(ch)][String(v)];
}

(async () => {
  const REEL = versetCorpus(1, 1, 1);
  console.log("   [ref] Genèse 1,1 (corpus) : « " + REEL + " »");
  if (!REEL) { console.error("corpus illisible — banc impossible"); process.exit(1); }

  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v590_store_" + Date.now());
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = "http://127.0.0.1:" + port + "/THEOLOGICUS.html";
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1600);

  const C = async (cite) => page.evaluate(
    ([c, r]) => window.__v590Citations.comparer(c, r), [cite, REEL]);

  /* ── 1. le module est là, pur, et sans DOM ── */
  section("1. Module présent, pur, sans effet de bord");
  const surface = await page.evaluate(() => {
    const o = window.__v590Citations;
    /* on EXCLUT les <script> : la balise du module porte elle-même
       id="v590-citations" et se comptait donc elle-même (banc corrigé). */
    const injectes = Array.prototype.filter.call(
      document.querySelectorAll('[id^="v590"]'),
      function (e) { return e.tagName !== "SCRIPT"; });
    return {
      present: !!o,
      cles: o ? Object.keys(o).sort().join(",") : "",
      domV590: injectes.length,
      typeComparer: o ? typeof o.comparer : "absent"
    };
  });
  ok("window.__v590Citations est exposé", surface.present === true, JSON.stringify(surface));
  ok("surface d'API minimale (comparer, normaliser, seuils, bornes)",
     surface.cles === "MAX_CAR,MIN_JETONS,SEUILS,comparer,normaliser", surface.cles);
  ok("aucun élément DOM injecté par le module", surface.domV590 === 0, "n=" + surface.domV590);

  /* ── 2. citation exacte ── */
  section("2. Citation exacte");
  const c2 = await C(REEL);
  ok("texte identique → conforme", c2.verdict === "conforme", JSON.stringify(c2));
  ok("et non marqué « partiel »", c2.partiel === false, JSON.stringify(c2));

  /* ── 3. variantes typographiques : le piège classique ── */
  section("3. Variantes typographiques → conformes, jamais divergentes");
  const c3a = await C(REEL.toUpperCase());
  ok("majuscules → conforme", c3a.verdict === "conforme", JSON.stringify(c3a));
  const c3b = await C("« AU COMMENCEMENT DIEU CREA LE CIEL ET LA TERRE »");
  ok("guillemets « » + sans accents → conforme", c3b.verdict === "conforme", JSON.stringify(c3b));
  const c3c = await C('"Au commencement, Dieu crea le ciel et la terre"');
  ok("guillemets droits + accent retiré → conforme", c3c.verdict === "conforme", JSON.stringify(c3c));

  /* ── 4. citation partielle ── */
  section("4. Citation partielle");
  const c4 = await C("Dieu créa le ciel et la terre");
  ok("mots contigus du verset → conforme", c4.verdict === "conforme", JSON.stringify(c4));
  ok("et signalé comme partiel", c4.partiel === true, JSON.stringify(c4));

  /* ── 5. LE cas qui justifie le module : un mot substitué ── */
  section("5. Un mot substitué → approximatif (jamais conforme)");
  const c5 = await C("Au commencement, Dieu créa le ciel et la mer.");
  ok("« mer » au lieu de « terre » → approximatif", c5.verdict === "approximatif", JSON.stringify(c5));
  ok("le score reste élevé (proche du texte)", c5.score >= 0.8 && c5.score < 1, "score=" + c5.score);

  /* ── 6. paraphrase et texte étranger ── */
  section("6. Paraphrase et texte étranger → divergents");
  const c6a = await C("Au début, Dieu fit les cieux et la terre.");
  ok("paraphrase → divergent (ce n'est pas une citation)", c6a.verdict === "divergent", JSON.stringify(c6a));
  const c6b = await C("Le Seigneur est mon berger");
  ok("texte étranger → divergent", c6b.verdict === "divergent", JSON.stringify(c6b));

  /* ── 7. entrées dégénérées : indetermine, jamais un verdict inventé ── */
  section("7. Entrées dégénérées → indetermine + motif");
  const c7a = await C("");
  ok("vide → indetermine (motif entree-vide)", c7a.verdict === "indetermine" && c7a.motif === "entree-vide", JSON.stringify(c7a));
  const c7b = await C("Dieu");
  ok("un seul mot → indetermine (motif trop-court)", c7b.verdict === "indetermine" && c7b.motif === "trop-court", JSON.stringify(c7b));
  const c7c = await C("a".repeat(2100));
  ok("texte trop long → indetermine (motif trop-long)", c7c.verdict === "indetermine" && c7c.motif === "trop-long", JSON.stringify(c7c));

  /* ── 8. normalisation ── */
  section("8. Normalisation partagée et idempotente");
  const n = await page.evaluate(() => {
    const f = window.__v590Citations.normaliser;
    const a = f("ÉCOUTE, l’Éternel ! — « oui »");
    return { a: a, b: f(a), c: f(null), d: f(undefined), e: f(123) };
  });
  ok("accents retirés, ponctuation réduite à des espaces", n.a === "ecoute l eternel oui", n.a);
  ok("idempotente", n.a === n.b, n.b);
  ok("null / undefined / nombre ne lèvent pas", n.c === "" && n.d === "" && n.e === "123", JSON.stringify(n));

  /* ── 9. propreté ── */
  section("9. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
