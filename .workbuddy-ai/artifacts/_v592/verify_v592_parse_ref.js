/* ═══════════════════════════════════════════════════════════════
   Banc v592 — `parseRef` : les LIVRES NUMÉROTÉS en abrégé.
   Défaut corrigé (mesuré avant correction) : « 2 Tm 3,16 », « 2Tm 3,16 » et
   « 1 Co 13,4 » renvoyaient null. Cause : la clé était reconstruite avec un
   espace (« 2 tm ») alors que BOOK_NUM ne contient que « 2tm », et la regex
   exigeait un espace après le numéro.
   Conséquence sur l'existant : ces références ne recevaient NI lien NI ✅ ;
   conséquence sur v590/v591 : aucune citation n'y était appariée.

   Le banc vérifie AUSSI la non-permissivité : élargir une regex peut faire
   entrer des choses qui n'en sont pas. Les cas négatifs sont donc affirmés.
   Magasin isolé (v559). ═══════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os"), fs = require("fs");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}
function versetCorpus(livre, ch, v) {
  const s = fs.readFileSync(path.join(__dirname, "..", "..", "..", "bible", "b" + livre + ".js"), "utf8");
  const k = s.indexOf("]=");
  let p = s.slice(k + 2).trim(); if (p.endsWith(";")) p = p.slice(0, -1);
  return JSON.parse(p)[String(ch)][String(v)];
}

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v592_store_" + Date.now());
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
  await page.waitForTimeout(1800);

  /* ── 1. le parseur est exposé ── */
  section("1. Le parseur est disponible");
  const dispo = await page.evaluate(() => typeof window.__parseBibleRef);
  ok("window.__parseBibleRef est une fonction", dispo === "function", dispo);
  if (dispo !== "function") { console.error("parseur absent"); process.exit(1); }

  /* ── 2. LE DÉFAUT : livres numérotés en abrégé ── */
  section("2. Livres numérotés en abrégé (le défaut corrigé)");
  const attendus = {
    "2 Tm 3,16": "55", "2Tm 3,16": "55", "1 Co 13,4": "46", "1Co 13,4": "46",
    "1 S 1,1": "9", "1 P 1,2": "60", "2 P 1,2": "61", "1 Jn 4,8": "62",
    "2 Jn 1,1": "63", "3 Jn 1,1": "64", "2 R 5,1": "12", "1 Ch 1,1": "13",
    "2 Th 1,1": "53", "1 Tm 2,1": "54", "2 Co 5,1": "47"
  };
  const res = await page.evaluate((liste) => {
    const out = {};
    liste.forEach(function (r) { const p = window.__parseBibleRef(r); out[r] = p ? p.book : null; });
    return out;
  }, Object.keys(attendus));
  let bons = 0, details = [];
  for (const r in attendus) {
    const okCas = res[r] === attendus[r];
    if (okCas) bons++; else details.push(r + " → " + res[r] + " (attendu " + attendus[r] + ")");
  }
  ok("les " + Object.keys(attendus).length + " références abrégées numérotées sont résolues",
     bons === Object.keys(attendus).length, details.join(" | ") || "toutes");

  /* ── 3. non-régression : ce qui marchait marche encore ── */
  section("3. Non-régression : les formes qui marchaient");
  const attendus2 = {
    "Jn 3,16": "43", "Mt 5,3": "40", "Gn 1,1": "1", "Ps 23,1": "19",
    "Ap 21,1": "66", "Jude 1,1": "65", "Ct 1,1": "22", "Cantique des cantiques 1,1": "22",
    "2 Timothée 3,16": "55", "1 Corinthiens 13,4": "46", "Jean 3,16": "43",
    "Gn 5:1": "1", "Ex 20,3": "2"
  };
  const res2 = await page.evaluate((liste) => {
    const out = {};
    liste.forEach(function (r) { const p = window.__parseBibleRef(r); out[r] = p ? p.book : null; });
    return out;
  }, Object.keys(attendus2));
  let bons2 = 0, d2 = [];
  for (const r in attendus2) {
    if (res2[r] === attendus2[r]) bons2++; else d2.push(r + " → " + res2[r]);
  }
  ok("les " + Object.keys(attendus2).length + " formes déjà supportées le restent",
     bons2 === Object.keys(attendus2).length, d2.join(" | ") || "toutes");

  /* ── 4. NON-PERMISSIVITÉ : élargir ne doit pas faire entrer n'importe quoi ── */
  section("4. Élargir la regex n'a PAS rendu le parseur permissif");
  const negatifs = ["Jean 3", "3,16", "XYZ 1,1", "1 Jn", "", "voir 2 Tm 3,16",
                    "1 2,3", "2 Tm", "chapitre 3,16", "1 Tm 3", "3 Jn 1,"];
  const res3 = await page.evaluate((liste) => {
    const out = {};
    liste.forEach(function (r) { const p = window.__parseBibleRef(r); out[r] = p ? (p.book + ":" + p.ch + ":" + p.v1) : null; });
    return out;
  }, negatifs);
  const faux = Object.keys(res3).filter(function (r) { return res3[r] !== null; });
  ok("aucune des " + negatifs.length + " chaînes non-références n'est acceptée",
     faux.length === 0, faux.map(function (r) { return r + " → " + res3[r]; }).join(" | ") || "aucune");

  /* ── 5. les plages et les numéros de verset ── */
  section("5. Chapitres, versets et plages");
  const plages = await page.evaluate(() => ({
    simple: window.__parseBibleRef("2 Tm 3,16"),
    plage: window.__parseBibleRef("1Co 13,4-7"),
    deuxPoints: window.__parseBibleRef("2 Tm 3:16")
  }));
  ok("chapitre et verset corrects", plages.simple && plages.simple.ch === "3" && plages.simple.v1 === 16 && plages.simple.v2 === null, JSON.stringify(plages.simple));
  ok("plage de versets conservée", plages.plage && plages.plage.v1 === 4 && plages.plage.v2 === 7, JSON.stringify(plages.plage));
  ok("forme « : » acceptée sur un livre numéroté", plages.deuxPoints && plages.deuxPoints.book === "55", JSON.stringify(plages.deuxPoints));

  /* ── 6. intégration : l'appareil existant valide enfin ces références ── */
  section("6. Intégration : l'appareil existant (✅) valide ces références");
  await page.evaluate(async () => {
    if (typeof window.__loadVerseCounts === "function" && !window.__bibleVerseCounts) await window.__loadVerseCounts();
  });
  await page.waitForTimeout(600);
  const verif = await page.evaluate(() => {
    const out = {};
    ["2 Tm 3,16", "1 Co 13,4", "Jn 3,16", "2 Tm 3,999"].forEach(function (r) {
      const p = window.__parseBibleRef(r);
      out[r] = p ? window.__bibleVerifyState(p) : "non-parse";
    });
    return out;
  });
  ok("« 2 Tm 3,16 » est reconnu PRÉSENT (ok)", verif["2 Tm 3,16"] === "ok", JSON.stringify(verif["2 Tm 3,16"]));
  ok("« 1 Co 13,4 » est reconnu PRÉSENT (ok)", verif["1 Co 13,4"] === "ok", JSON.stringify(verif["1 Co 13,4"]));
  ok("« Jn 3,16 » reste ok (non-régression)", verif["Jn 3,16"] === "ok", JSON.stringify(verif["Jn 3,16"]));
  ok("un verset inexistant est toujours signalé (missing)",
     verif["2 Tm 3,999"] === "missing", JSON.stringify(verif["2 Tm 3,999"]));

  /* ── 7. intégration : appariement + marquage sur un livre numéroté ── */
  section("7. Intégration v590/v591 : citation sur un livre numéroté");
  const TM316 = versetCorpus(55, 3, 16);
  console.log("   [ref] 2 Tm 3,16 (corpus) : « " + String(TM316).slice(0, 70) + "… »");
  const MOTS = String(TM316).replace(/^[^\p{L}]+/u, "").split(/\s+/).filter(Boolean);
  const PARTIEL = MOTS.slice(0, 6).join(" ");
  const long = MOTS.slice(0, 6).reduce((a, b) => (b.replace(/[^\p{L}]/gu, "").length > a.replace(/[^\p{L}]/gu, "").length ? b : a), MOTS[0]);
  const ALTERE = PARTIEL.replace(long, "zzzzzz");
  const integ = await page.evaluate(async (d) => {
    const hote = document.getElementById("chat-container");
    const out = {};
    hote.innerHTML = '<p>Paul écrit : <span class="bible-ref">2 Tm 3,16</span> « ' + d.partiel + ' »</p>';
    const liste = window.__v590Citations.citationsDuBloc(hote);
    out.apparie = liste.length;
    out.parse = liste.length ? liste[0].parse : null;
    window.__v591CitationsUi.marquerBloc(hote);
    await new Promise(r => setTimeout(r, 2500));
    out.marques = Array.prototype.map.call(hote.querySelectorAll(".v591-cite"), s => s.className);
    hote.innerHTML = '<p>Paul écrit : <span class="bible-ref">2 Tm 3,16</span> « ' + d.altere + ' »</p>';
    window.__v591CitationsUi.marquerBloc(hote);
    await new Promise(r => setTimeout(r, 600));
    out.marquesAltere = Array.prototype.map.call(hote.querySelectorAll(".v591-cite"), s => s.className);
    return out;
  }, { partiel: PARTIEL, altere: ALTERE });
  ok("la citation est appariée (parse non nul) — impossible avant le correctif",
     integ.apparie === 1 && !!integ.parse && integ.parse.book === "55", JSON.stringify({ n: integ.apparie, parse: integ.parse }));
  ok("elle est marquée CONFORME (verte)", integ.marques.length === 1 && /v591-ok/.test(integ.marques[0]), JSON.stringify(integ.marques));
  ok("la citation altérée n'est PAS verte", integ.marquesAltere.length === 1 && !/v591-ok/.test(integ.marquesAltere[0]), JSON.stringify(integ.marquesAltere));

  /* ── 8. propreté ── */
  section("8. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const total = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + total + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(total === resultats.length ? 0 : 1);
})();
