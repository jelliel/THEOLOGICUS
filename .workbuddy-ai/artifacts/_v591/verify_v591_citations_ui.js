/* ═══════════════════════════════════════════════════════════════
   Banc v591 — MARQUAGE DES CITATIONS DANS LE CHAT (tranche 3).
   Contrat affirmé :
   1. le module est INERTE au chargement (aucun <style>, aucune marque) ;
   2. une citation CONFORME reçoit une marque verte (✓) ;
   3. une citation ALTÉRÉE reçoit une marque de problème (≈ ou ≠), jamais ✓ ;
   4. un livre NON CHARGÉ est chargé à la demande, PUIS marqué ;
   5. mode « souple » : une citation conforme n'est PAS marquée ;
   6. mode « off » : rien du tout ;
   7. demarquer() retire tout ; marquerBloc est IDEMPOTENT ;
   8. pendant le streaming (.theo-streaming) le DOM n'est PAS touché ;
   9. la marque est un FRÈRE du nœud texte (elle ne pollue pas le textContent
      de la référence — c'est ce que le parseur existant relit au clic) ;
  10. aucune erreur JavaScript.
   Le texte de référence est LU depuis le corpus (Mt 5,3, bible/b40.js).
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
  let payload = s.slice(k + 2).trim();
  if (payload.endsWith(";")) payload = payload.slice(0, -1);
  return JSON.parse(payload)[String(ch)][String(v)];
}

(async () => {
  const MT53 = versetCorpus(40, 5, 3);
  console.log("   [ref] Mt 5,3 (corpus) : « " + MT53 + " »");
  if (!MT53) { console.error("corpus illisible"); process.exit(1); }
  /* Données construites À PARTIR du corpus, sans supposer sa ponctuation :
     ce verset commence par un guillemet parasite, et une substitution écrite
     « à la main » (« pauvres » → « riches ») ne remplaçait RIEN — la
     « citation altérée » était identique à l'originale, et le banc accusait le
     module à tort. On nettoie donc les têtes non alphabétiques, et on altère le
     PLUS LONG mot effectivement présent. */
  const MOTS = MT53.replace(/^[^\p{L}]+/u, "").split(/\s+/).filter(Boolean);
  const PARTIEL = MOTS.slice(0, 5).join(" ");
  const long = MOTS.slice(0, 5).reduce((a, b) => (b.replace(/[^\p{L}]/gu, "").length > a.replace(/[^\p{L}]/gu, "").length ? b : a), MOTS[0]);
  const ALTERE = PARTIEL.replace(long, "zzzzzz");
  if (ALTERE === PARTIEL) { console.error("altération sans effet — banc invalide"); process.exit(1); }
  console.log("   [cas] conforme : « " + PARTIEL + " »");
  console.log("   [cas] altéré   : « " + ALTERE + " » (mot « " + long + " » remplacé)");

  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v591_store_" + Date.now());
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

  /* helpers côté page */
  await page.evaluate(() => {
    window.__t = {
      hote: document.getElementById("chat-container"),
      poser: function (html) { window.__t.hote.innerHTML = "<p>" + html + "</p>"; },
      marques: function () {
        return Array.prototype.map.call(window.__t.hote.querySelectorAll(".v591-cite"), function (s) {
          return { glyphe: s.textContent, cls: s.className, titre: s.title };
        });
      },
      refTexte: function () {
        const r = window.__t.hote.querySelector(".bible-ref");
        return r ? r.textContent : "";
      },
      mode: function (m) { localStorage.setItem("theologicus_verify", m); }
    };
  });

  /* ── 1. inerte au chargement ── */
  section("1. Module présent et INERTE au chargement");
  const e1 = await page.evaluate(() => ({
    ui: !!window.__v591CitationsUi,
    moteur: !!window.__v590Citations,
    style: !!document.getElementById("v591-style"),
    marques: document.querySelectorAll(".v591-cite").length,
    cles: window.__v591CitationsUi ? Object.keys(window.__v591CitationsUi).sort().join(",") : ""
  }));
  ok("window.__v591CitationsUi est exposé", e1.ui === true, JSON.stringify(e1));
  ok("surface d'API minimale", e1.cles === "demarquer,enFlux,marquerBloc,marquerSumma,modeVerif,texteSumma,texteVerset", e1.cles);
  ok("aucun <style> injecté au chargement", e1.style === false);
  ok("aucune marque au chargement", e1.marques === 0, "n=" + e1.marques);

  /* ── 2. livre non chargé puis chargé à la demande ── */
  section("2. Le texte du verset est chargé À LA DEMANDE");
  const avant = await page.evaluate(() => window.__v591CitationsUi.texteVerset({ book: "40", ch: "5", v1: 3, v2: null }));
  ok("avant tout marquage : le livre n'est pas chargé (undefined)",
     avant === undefined, JSON.stringify(avant));

  /* ── 3. citation conforme → marque verte ── */
  section("3. Citation CONFORME → marque verte");
  await page.evaluate((txt) => {
    window.__t.mode("strict");
    window.__t.poser('Heureux : <span class="bible-ref">Mt 5,3</span> « ' + txt + ' »');
  }, PARTIEL);
  await page.evaluate(() => window.__v591CitationsUi.marquerBloc(window.__t.hote));
  await page.waitForFunction(() => document.querySelectorAll(".v591-cite").length > 0, null, { timeout: 15000 });
  const m3 = await page.evaluate(() => ({ marques: window.__t.marques(), style: !!document.getElementById("v591-style") }));
  ok("une marque est posée", m3.marques.length === 1, JSON.stringify(m3.marques));
  ok("la marque est VERTE (conforme)", m3.marques[0] && m3.marques[0].cls.indexOf("v591-ok") !== -1, JSON.stringify(m3.marques[0]));
  ok("son infobulle annonce la conformité", m3.marques[0] && /CONFORME/.test(m3.marques[0].titre), m3.marques[0] && m3.marques[0].titre);
  ok("le <style> n'apparaît qu'au premier marquage", m3.style === true);
  const refIntact = await page.evaluate(() => window.__t.refTexte());
  ok("le textContent de la référence reste intact (marque en FRÈRE)",
     refIntact === "Mt 5,3", JSON.stringify(refIntact));

  /* ── 4. idempotence ── */
  section("4. marquerBloc est idempotent");
  await page.evaluate(() => { window.__v591CitationsUi.marquerBloc(window.__t.hote); window.__v591CitationsUi.marquerBloc(window.__t.hote); });
  await page.waitForTimeout(200);
  const m4 = await page.evaluate(() => window.__t.marques().length);
  ok("trois appels ne produisent qu'UNE marque", m4 === 1, "n=" + m4);

  /* ── 5. citation altérée → marque de problème ── */
  section("5. Citation ALTÉRÉE → marque de problème (jamais verte)");
  await page.evaluate((txt) => {
    window.__t.poser('Heureux : <span class="bible-ref">Mt 5,3</span> « ' + txt + ' »');
  }, ALTERE);
  await page.evaluate(() => window.__v591CitationsUi.marquerBloc(window.__t.hote));
  await page.waitForTimeout(400);
  const m5 = await page.evaluate(() => window.__t.marques());
  ok("une marque est posée", m5.length === 1, JSON.stringify(m5));
  ok("elle n'est PAS verte", m5[0] && m5[0].cls.indexOf("v591-ok") === -1, JSON.stringify(m5[0]));
  ok("elle signale un écart (≈ ou ≠)", m5[0] && (m5[0].cls.indexOf("v591-proche") !== -1 || m5[0].cls.indexOf("v591-ecart") !== -1), JSON.stringify(m5[0]));

  /* ── 6. mode souple : une citation conforme n'est pas marquée ── */
  section("6. Mode « souple » : seuls les problèmes sont marqués");
  await page.evaluate((txt) => {
    window.__t.mode("souple");
    window.__t.poser('Heureux : <span class="bible-ref">Mt 5,3</span> « ' + txt + ' »');
    window.__v591CitationsUi.marquerBloc(window.__t.hote);
  }, PARTIEL);
  await page.waitForTimeout(300);
  const m6a = await page.evaluate(() => window.__t.marques().length);
  ok("citation conforme → AUCUNE marque en mode souple", m6a === 0, "n=" + m6a);
  await page.evaluate((txt) => {
    window.__t.poser('Heureux : <span class="bible-ref">Mt 5,3</span> « ' + txt + ' »');
    window.__v591CitationsUi.marquerBloc(window.__t.hote);
  }, ALTERE);
  await page.waitForTimeout(300);
  const m6b = await page.evaluate(() => window.__t.marques().length);
  ok("citation altérée → marquée en mode souple", m6b === 1, "n=" + m6b);

  /* ── 7. mode off : rien ── */
  section("7. Mode « off » : rien n'est marqué");
  await page.evaluate((txt) => {
    window.__t.mode("off");
    window.__t.poser('Heureux : <span class="bible-ref">Mt 5,3</span> « ' + txt + ' »');
    window.__v591CitationsUi.marquerBloc(window.__t.hote);
  }, ALTERE);
  await page.waitForTimeout(300);
  const m7 = await page.evaluate(() => window.__t.marques().length);
  ok("aucune marque en mode off", m7 === 0, "n=" + m7);

  /* ── 8. demarquer ── */
  section("8. demarquer() retire tout et autorise un re-marquage");
  await page.evaluate((txt) => {
    window.__t.mode("strict");
    window.__t.poser('Heureux : <span class="bible-ref">Mt 5,3</span> « ' + txt + ' »');
    window.__v591CitationsUi.marquerBloc(window.__t.hote);
  }, ALTERE);
  await page.waitForTimeout(300);
  const avant8 = await page.evaluate(() => window.__t.marques().length);
  await page.evaluate(() => window.__v591CitationsUi.demarquer(window.__t.hote));
  const apres8 = await page.evaluate(() => ({
    marques: window.__t.marques().length,
    attrs: window.__t.hote.querySelectorAll("[data-v591]").length
  }));
  ok("une marque existait avant", avant8 === 1, "n=" + avant8);
  ok("demarquer retire la marque", apres8.marques === 0, "n=" + apres8.marques);
  ok("demarquer libère l'état (data-v591)", apres8.attrs === 0, "n=" + apres8.attrs);

  /* ── 9. streaming : le DOM n'est pas touché ── */
  section("9. Pendant le streaming, le message en cours n'est PAS touché");
  const m9 = await page.evaluate((txt) => {
    document.documentElement.classList.add("theo-streaming");
    window.__t.poser('Heureux : <span class="bible-ref">Mt 5,3</span> « ' + txt + ' »');
    const n = window.__v591CitationsUi.marquerBloc(window.__t.hote);
    const res = { retour: n, marques: window.__t.marques().length, flux: window.__v591CitationsUi.enFlux() };
    document.documentElement.classList.remove("theo-streaming");
    return res;
  }, ALTERE);
  ok("enFlux() détecte le streaming", m9.flux === true, JSON.stringify(m9));
  ok("marquerBloc ne marque RIEN pendant le flux", m9.retour === 0 && m9.marques === 0, JSON.stringify(m9));
  /* et la reprise planifiée doit marquer après la fin du flux */
  await page.waitForFunction(() => document.querySelectorAll(".v591-cite").length > 0, null, { timeout: 8000 });
  const m9b = await page.evaluate(() => window.__t.marques().length);
  ok("la reprise APRÈS le flux marque bien", m9b === 1, "n=" + m9b);

  /* ── 10. propreté ── */
  section("10. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
