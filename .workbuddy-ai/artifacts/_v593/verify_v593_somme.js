/* ═══════════════════════════════════════════════════════════════
   Banc v593 — T4 : vérification des références à la SOMME.
   Corpus : traduction Drioux (domaine public), `summafr/`, qid = partie*1000+q.
   L'app rend déjà `<a class="theo-ref summa-ref" data-summa="1002"
   data-summa-a="3">` : le qid et l'article sont dans les attributs, rien à
   re-parser.

   Règle affirmée ici : on ne marque QUE ce qu'on a trouvé.
     ✓  le texte est dans l'ARTICLE cité ;
     ⇄  le texte est dans la QUESTION mais pas dans l'article cité ;
     rien  introuvable — parce que le corpus est une OCR de 1851 : une
        différence peut venir de la traduction, pas d'une erreur du modèle.
        Accuser à tort une citation magistérielle serait pire que se taire.
   Magasin isolé (v559). ═══════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os"), fs = require("fs");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}
/* Lit une question de la Somme française depuis le corpus. */
function questionFr(qid) {
  const s = fs.readFileSync(path.join(__dirname, "..", "..", "..", "summafr", "s" + qid + ".js"), "utf8");
  const k = s.indexOf('"' + qid + '"] = {');
  let json = s.slice(k + ('"' + qid + '"] = ').length).trim();
  if (json.endsWith(";")) json = json.slice(0, -1);
  return JSON.parse(json);
}
const texteArt = (q, n) => (q.articles.filter(a => a.n === n)[0].paragraphs || []).map(p => p.text || "").join(" ");
const texteQuestion = q => q.articles.map(a => (a.paragraphs || []).map(p => p.text || "").join(" ")).join(" ");
const premiersMots = (t, n) => t.replace(/^[^\p{L}]+/u, "").split(/\s+/).filter(Boolean).slice(0, n).join(" ");

(async () => {
  const Q = questionFr("1002");                    /* Ia q.2 : « Dieu existe-t-il ? » */
  const ART3 = texteArt(Q, 3);                     /* article 3 : les cinq voies */
  const ART1 = texteArt(Q, 1);
  const CITE_ART3 = premiersMots(ART3, 12);
  const CITE_ART1 = premiersMots(ART1, 12);
  const INVENTEE = "Zwingli rédigea la Confession helvétique après la dispute de Berne, selon un plan arrêté.";
  console.log("   [corpus] Ia q.2 a.3 : " + ART3.length + " caractères | question : " + texteQuestion(Q).length);
  console.log("   [cas] dans l'article  : « " + CITE_ART3.slice(0, 70) + "… »");
  console.log("   [cas] d'un AUTRE art. : « " + CITE_ART1.slice(0, 70) + "… »");

  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v593_store_" + Date.now());
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);

  await page.evaluate(() => {
    window.__t = {
      hote: document.getElementById("chat-container"),
      poser: function (html) { window.__t.hote.innerHTML = "<p>" + html + "</p>"; },
      marques: function () {
        return Array.prototype.map.call(window.__t.hote.querySelectorAll(".v591-cite"), function (s) {
          return { glyphe: s.textContent, cls: s.className, titre: s.title };
        });
      },
      mode: function (m) { localStorage.setItem("theologicus_verify", m); }
    };
  });
  const REF = '<a class="theo-ref summa-ref" data-summa="1002" data-summa-a="3" href="#">Somme théologique, Ia q.2 a.3</a>';
  async function marquer(html) {
    return page.evaluate(async (h) => {
      window.__t.mode("strict");
      window.__t.poser(h);
      await window.__v591CitationsUi.marquerSumma(window.__t.hote);
      return window.__t.marques();
    }, html);
  }

  /* ── 1. le corpus est atteignable et rendu ── */
  section("1. Lecture du corpus français de la Somme");
  const t1 = await page.evaluate(async () => {
    const r = await window.__v591CitationsUi.texteSumma("1002", 3);
    return r ? { lang: r.lang, titre: r.titre, nArt: (r.article || "").length, nQ: (r.question || "").length } : null;
  });
  ok("texteSumma charge la question (langue française)", !!t1 && t1.lang === "fr", JSON.stringify(t1));
  ok("le texte de l'ARTICLE est non vide", !!t1 && t1.nArt > 500, t1 ? "n=" + t1.nArt : "null");
  ok("le texte de la QUESTION est plus large que l'article", !!t1 && t1.nQ > t1.nArt, t1 ? t1.nArt + " < " + t1.nQ : "null");

  /* ── 2. citation réellement présente dans l'article cité → ✓ ── */
  section("2. Citation présente dans l'ARTICLE cité → ✓ vert");
  const m2 = await marquer('Thomas écrit : ' + REF + ' « ' + CITE_ART3 + ' »');
  ok("une marque est posée", m2.length === 1, JSON.stringify(m2));
  ok("elle est VERTE (conforme)", m2[0] && /v591-ok/.test(m2[0].cls), JSON.stringify(m2[0]));

  /* ── 3. citation d'un AUTRE article de la même question → ⇄ ── */
  section("3. Citation d'un AUTRE article de la même question → ⇄ déplacé");
  const m3 = await marquer('Thomas écrit : ' + REF + ' « ' + CITE_ART1 + ' »');
  ok("une marque est posée", m3.length === 1, JSON.stringify(m3));
  ok("elle signale un DÉPLACEMENT (bleue, ⇄)", m3[0] && /v591-deplace/.test(m3[0].cls), JSON.stringify(m3[0]));
  ok("son infobulle parle de l'ARTICLE cité", m3[0] && /ARTICLE/.test(m3[0].titre), m3[0] && m3[0].titre);

  /* ── 4. citation introuvable → AUCUNE marque (on n'accuse pas) ── */
  section("4. Citation introuvable → AUCUNE marque (silence assumé)");
  const m4 = await marquer('Thomas écrit : ' + REF + ' « ' + INVENTEE + ' »');
  ok("aucune marque n'est posée", m4.length === 0, JSON.stringify(m4));

  /* ── 5. mode souple : une citation conforme n'est pas marquée ── */
  section("5. Mode « souple » : seuls les problèmes sont marqués");
  const m5 = await page.evaluate(async (h) => {
    window.__t.mode("souple");
    window.__t.poser(h);
    await window.__v591CitationsUi.marquerSumma(window.__t.hote);
    return window.__t.marques();
  }, 'Thomas écrit : ' + REF + ' « ' + CITE_ART3 + ' »');
  ok("citation conforme → AUCUNE marque en mode souple", m5.length === 0, JSON.stringify(m5));
  const m5b = await page.evaluate(async (h) => {
    window.__t.mode("souple");
    window.__t.poser(h);
    await window.__v591CitationsUi.marquerSumma(window.__t.hote);
    return window.__t.marques();
  }, 'Thomas écrit : ' + REF + ' « ' + CITE_ART1 + ' »');
  ok("citation déplacée → marquée en mode souple", m5b.length === 1, JSON.stringify(m5b));

  /* ── 6. mode off ── */
  section("6. Mode « off » : rien");
  const m6 = await page.evaluate(async (h) => {
    window.__t.mode("off");
    window.__t.poser(h);
    await window.__v591CitationsUi.marquerSumma(window.__t.hote);
    return window.__t.marques();
  }, 'Thomas écrit : ' + REF + ' « ' + CITE_ART3 + ' »');
  ok("aucune marque en mode off", m6.length === 0, JSON.stringify(m6));

  /* ── 7. non-régression : la Bible est toujours marquée ── */
  section("7. Non-régression : le marquage biblique fonctionne toujours");
  const m7 = await page.evaluate(async () => {
    window.__t.mode("strict");
    const h = window.__t.hote;
    h.innerHTML = '<p>Heureux : <span class="bible-ref">Mt 5,3</span> « Heureux ceux qui ont une »</p>';
    window.__v591CitationsUi.marquerBloc(h);
    await new Promise(r => setTimeout(r, 2500));
    return window.__t.marques();
  });
  ok("la citation biblique est marquée", m7.length === 1, JSON.stringify(m7));
  ok("et elle est verte (conforme)", m7[0] && /v591-ok/.test(m7[0].cls), JSON.stringify(m7[0]));

  /* ── 8. demarquer nettoie aussi la Somme ── */
  section("8. demarquer() nettoie les marques de la Somme");
  const m8 = await page.evaluate(async (h) => {
    window.__t.mode("strict");
    window.__t.poser(h);
    await window.__v591CitationsUi.marquerSumma(window.__t.hote);
    const avant = window.__t.marques().length;
    window.__v591CitationsUi.demarquer(window.__t.hote);
    return { avant: avant, apres: window.__t.marques().length, attrs: window.__t.hote.querySelectorAll("[data-v591]").length };
  }, 'Thomas écrit : ' + REF + ' « ' + CITE_ART3 + ' »');
  ok("une marque existait", m8.avant === 1, JSON.stringify(m8));
  ok("demarquer la retire et libère l'état", m8.apres === 0 && m8.attrs === 0, JSON.stringify(m8));

  /* ── 9. propreté ── */
  section("9. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
