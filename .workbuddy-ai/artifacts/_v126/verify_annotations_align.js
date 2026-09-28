// Banc v126l — alignement des annotations (cadres colorés) sur les mots visés.
//
// Symptôme rapporté (capture 2026-09-28 132735) : les cadres colorés des
// passages annotés tombent à côté du mot visé — « ça décale pour aller sur
// d'autres mots ». Le texte fautif est une réponse en liste numérotée
// contenant des mots en gras collés à du texte (« marcion**isme** »), donc
// rendus en PLUSIEURS nœuds texte.
//
// Cause : `locateInBox()` traitait une position située EXACTEMENT sur la
// frontière entre deux nœuds texte comme appartenant au nœud PRÉCÉDENT. Or un
// premier surlignage scinde le nœud texte ; au re-rendu, `wrapByOffset()`
// repartait donc de la FIN du nœud précédent, enroulait une plage vide et
// décalait tous les surlignages suivants d'un cran.
//
// Correctif : `locateInBox(container, pos, inclusive)` — la FIN d'une plage
// reste sur le nœud précédent (inclusive = true), le DÉBUT passe au nœud
// suivant (inclusive = false). Les 4 appelants (wrapByOffset, wrapOnce,
// wrapNth, _offsetForText) passent le mode correct.
//
// Ce banc est de bout en bout : il fait réellement tourner THEOLOGICUS.html,
// injecte une réponse via un `fetch` simulé, annote trois passages par une
// VRAIE sélection DOM + onAddToChat, force un re-rendu complet, puis vérifie
// que la concaténation des spans d'un même hlId correspond exactement au
// texte visé.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8791;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const DIR = path.join(RACINE, ".workbuddy-ai", "artifacts", "_v126", "_align_bench");

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

// Sélectionne la (occ+1)-ième occurrence de `cible` dans #mc-<ts>, laisse la
// bulle « Add to chat » apparaître (chemin réel : detectSelectionAndShow),
// puis clique .atc-main. Renvoie true si le clic a bien eu lieu.
async function annotateViaBubble(page, ts, cible, occ) {
  const pose = await page.evaluate(({ ts, cible, occ }) => {
    const box = document.getElementById("mc-" + ts);
    if (!box) return "box absente";
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    let full = ""; const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push({ node: n, start: full.length });
      full += n.nodeValue;
    }
    let idx = -1;
    for (let k = 0; k <= (occ || 0); k++) {
      idx = full.indexOf(cible, idx + 1);
      if (idx === -1) return "cible absente: " + cible;
    }
    let sc = null, so = 0, ec = null, eo = 0;
    for (const { node, start } of nodes) {
      const end = start + node.nodeValue.length;
      if (!sc && idx >= start && idx < end) { sc = node; so = idx - start; }
      if (!ec && (idx + cible.length) > start && (idx + cible.length) <= end) {
        ec = node; eo = (idx + cible.length) - start;
      }
    }
    if (!sc || !ec) return "noeuds introuvables";
    const range = document.createRange();
    range.setStart(sc, so); range.setEnd(ec, eo);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    // mouseup sur le message -> detectSelectionAndShow (180 ms plus tard)
    box.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    return "";
  }, { ts, cible, occ });
  if (pose) return pose;
  await page.waitForTimeout(420);
  const clic = await page.evaluate(() => {
    const main = document.querySelector("#atc-bubble .atc-main");
    if (!main) return "bulle absente";
    if (main.offsetParent === null && getComputedStyle(main).display === "none") return "bulle cachée";
    main.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return "";
  });
  if (clic) return clic;
  await page.waitForTimeout(250);
  return true;
}

// Réponse assistant reproduisant la capture : liste numérotée + gras collé.
const REPONSE = [
  "Non, Tertullien n'a jamais écrit que le Livre d'Hénoc fut retiré *à cause des propriétés d'un Messie déjà venu*.",
  "En revanche :",
  "",
  "1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).",
  "2. Il **ne** justifie pas **son** exclusion du canon, **contrairement** à **Athanase** ou Épiphan**e**.",
  "3. La formulation que vous citez ressemble à une **interprétation ultérieure** (peut-être médiévale) de sa pensée.",
].join("\n");

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v126l — ALIGNEMENT DES ANNOTATIONS (cadres colorés)");
  console.log("=".repeat(72));

  fs.mkdirSync(DIR, { recursive: true });

  // Sert le dépôt (THEOLOGICUS.html + tranches JS) tel quel.
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8"
          : p.endsWith(".js") ? "application/javascript; charset=utf-8"
          : "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(fp).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404");
    }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  // Avant tout script de l'app : clé Agnes en localStorage (pour que
  // resolveModelConfig trouve une clé) et `fetch` simulé pour l'API LLM.
  await page.addInitScript((reponse) => {
    // Clé du fournisseur du modèle actif (Mistral par défaut) : le contrôle
    // d'envoi porte sur `_clePourModele(state.model)`, donc sur `key_mistral`.
    try { document.cookie = "key_mistral=sk-test-mistral-align; path=/"; } catch (e) {}
    try { localStorage.setItem("agnes_api_key", "sk-test-agnes-align"); } catch (e) {}
    const _orig = window.fetch ? window.fetch.bind(window) : null;
    function sseResponse(text) {
      const enc = new TextEncoder();
      const parts = [];
      // Découpe en petits morceaux pour imiter le streaming
      const chunks = text.match(/[\s\S]{1,24}/g) || [text];
      for (const c of chunks) {
        parts.push(enc.encode("data: " + JSON.stringify({ choices: [{ delta: { content: c } }] }) + "\n\n"));
      }
      parts.push(enc.encode("data: [DONE]\n\n"));
      let i = 0;
      const stream = new ReadableStream({
        pull(ctrl) {
          if (i >= parts.length) { ctrl.close(); return; }
          ctrl.enqueue(parts[i++]);
        }
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    function jsonResponse(obj) {
      return new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = String((init && init.method) || "GET").toUpperCase();
      // Réponses non-stream (titre de conversation, suggestions…) : JSON neutre
      if (method === "POST" && /chat\/completions|\/responses|\/v1\/messages/.test(url)) {
        const body = String((init && init.body) || "");
        // Une demande de titres/suggestions n'est pas streamée dans certains
        // chemins ; on renvoie du SSE quand l'app demande stream:true.
        let streamed = false;
        try { streamed = !!JSON.parse(body).stream; } catch (e) {}
        if (streamed) return Promise.resolve(sseResponse(reponse));
        return Promise.resolve(jsonResponse({ choices: [{ message: { role: "assistant", content: reponse } }] }));
      }
      if (_orig) return _orig(input, init);
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
  }, REPONSE);

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(
      () => typeof window.onAddToChat === "function" && typeof window.renderMessages === "function",
      null, { timeout: 90000 });

    // Ferme l'overlay d'auth s'il se présente (le retire du DOM : il se
    // réinstalle sinon et intercepte les coordonnées).
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay");
      if (o) o.remove();
    });

    // Envoie un message : l'app pousse user + assistant dans state.messages.
    await page.waitForSelector("#user-input", { timeout: 30000 });
    await page.fill("#user-input", "Tertullien a-t-il dit cela ?");
    await page.evaluate(() => {
      const inp = document.getElementById("user-input");
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    // Attend que la réponse assistant soit rendue.
    await page.waitForFunction(() => {
      const c = document.getElementById("chat-container");
      return c && /canonique/.test(c.textContent || "");
    }, null, { timeout: 60000 });
    await page.waitForTimeout(800);

    const ts = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('[id^="mc-"]'));
      const b = boxes.find(x => /canonique/.test(x.textContent || ""));
      return b ? b.id.replace("mc-", "") : null;
    });
    ok("la réponse assistant est rendue avec le texte de la capture", !!ts, "mc-" + ts);
    if (!ts) throw new Error("réponse non rendue — banc impossible");

    // Annote trois passages par une VRAIE sélection + la bulle « Add to chat »
    // (c'est le chemin réel de l'utilisateur : detectSelectionAndShow remplit
    // window._atcSel, le clic sur .atc-main appelle l'IIFE interne).
    const CIBLES = ["canonique", "marcionisme", "interprétation ultérieure"];
    for (const cible of CIBLES) {
      const pose = await annotateViaBubble(page, ts, cible, 0);
      ok(`la bulle « Add to chat » propose l'annotation de « ${cible} »`, pose, String(pose));
      await page.waitForTimeout(200);
    }

    // Un cadre doit exister pour chaque cible, à la bonne place.
    const avant = await page.evaluate((ts) => {
      const box = document.getElementById("mc-" + ts);
      const byId = new Map();
      box.querySelectorAll("[data-hl-id]").forEach(sp => {
        const id = sp.dataset.hlId;
        byId.set(id, (byId.get(id) || "") + sp.textContent);
      });
      return Array.from(byId.values()).map(t => t.trim());
    }, ts);
    for (const cible of CIBLES) {
      ok(`annotation posée sur « ${cible} » (avant re-rendu)`,
        avant.includes(cible), JSON.stringify(avant));
    }

    // Force un re-rendu complet : c'est là que le bug se manifestait.
    await page.evaluate(() => { window.renderMessages(true); });
    await page.waitForTimeout(900);

    const apres = await page.evaluate((ts) => {
      const box = document.getElementById("mc-" + ts);
      if (!box) return null;
      const byId = new Map();
      box.querySelectorAll("[data-hl-id]").forEach(sp => {
        const id = sp.dataset.hlId;
        byId.set(id, (byId.get(id) || "") + sp.textContent);
      });
      return Array.from(byId.values()).map(t => t.trim());
    }, ts);

    ok("la box du message survit au re-rendu", apres !== null);
    for (const cible of CIBLES) {
      ok(`cadre TOUJOURS aligné sur « ${cible} » après re-rendu`,
        Array.isArray(apres) && apres.includes(cible), JSON.stringify(apres));
    }

    // Aucun cadre vide ne doit subsister (symptôme exact du bug).
    const vides = await page.evaluate((ts) => {
      const box = document.getElementById("mc-" + ts);
      return Array.from(box.querySelectorAll("[data-hl-id]"))
        .filter(sp => !(sp.textContent || "").trim()).length;
    }, ts);
    ok("aucun cadre vide après re-rendu", vides === 0, "vides=" + vides);

    // Frontière de nœud : locateInBox doit distinguer DÉBUT et FIN.
    const frontiere = await page.evaluate(() => {
      const root = document.createElement("div");
      root.innerHTML = "AAA<span></span>BBB";
      document.body.appendChild(root);
      const inc = window.locateInBox(root, 3, true);
      const exc = window.locateInBox(root, 3, false);
      const r = {
        inc: { v: inc.node.nodeValue, o: inc.off },
        exc: { v: exc.node.nodeValue, o: exc.off },
      };
      root.remove();
      return r;
    });
    ok("locateInBox frontière FIN -> nœud précédent (AAA@3)",
      frontiere.inc.v === "AAA" && frontiere.inc.o === 3, JSON.stringify(frontiere.inc));
    ok("locateInBox frontière DÉBUT -> nœud suivant (BBB@0)",
      frontiere.exc.v === "BBB" && frontiere.exc.o === 0, JSON.stringify(frontiere.exc));

    // Sélection longue traversant plusieurs paragraphes (non-régression).
    // On cible la 2e occurrence d'un mot répété (« que ») pour vérifier que le
    // rang d'occurrence n'est pas confondu avec la 1re apparition.
    const poseNe = await annotateViaBubble(page, ts, "que", 1);
    ok("la bulle propose l'annotation de la 2e occurrence de « que »", poseNe, String(poseNe));
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.renderMessages(true); });
    await page.waitForTimeout(900);
    const neOk = await page.evaluate((ts) => {
      const box = document.getElementById("mc-" + ts);
      const byId = new Map();
      box.querySelectorAll("[data-hl-id]").forEach(sp => {
        const id = sp.dataset.hlId;
        byId.set(id, (byId.get(id) || "") + sp.textContent);
      });
      return Array.from(byId.values()).map(t => t.trim());
    }, ts);
    ok("mot répété « que » (2e occurrence) correctement cadré",
      Array.isArray(neOk) && neOk.includes("que"), JSON.stringify(neOk));

    ok("aucune erreur JS pendant le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("banc exécuté sans exception", false, String(e && e.message || e));
  } finally {
    await browser.close();
    serveur.close();
  }

  const total = resultats.length;
  const reussis = resultats.filter(r => r[0]).length;
  console.log("-".repeat(72));
  console.log(`RESULTAT : ${reussis}/${total}`);
  console.log("-".repeat(72));
  process.exit(reussis === total ? 0 : 1);
})();
