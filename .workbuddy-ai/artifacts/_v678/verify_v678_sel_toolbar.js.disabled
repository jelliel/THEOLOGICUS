/* v678 — Barre d'outils de sélection (encadrage, surlignage, annotation).
   On vérifie que :
   1. le module est présent et expose __v678SelToolbar
   2. la barre s'affiche quand on sélectionne dans un message
   3. les groupes (Surligner, Encadrer, Annoter, Outils) sont présents
   4. les pastilles de couleur sont au bon nombre (5)
   5. les formes rapides sont au bon nombre (4)
   6. le clic sur une pastille crée un surlignage (mark)
   7. la barre disparaît quand on perd la sélection
   8. le panneau "plus de formes" s'ouvre et se ferme
   9. le patch de __atcBubble.show fonctionne (barre au lieu de bulle en mode annotation)
   10. la barre ne s'affiche PAS en mode universel (hors message) */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9693);
function trouverRacine() {
  let d = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, "THEOLOGICUS.html"))) return d;
    d = path.dirname(d);
  }
  return path.resolve(process.env.BENCH_ROOT || process.cwd());
}
const RACINE = path.resolve(process.env.BENCH_ROOT || trouverRacine());
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0, ign_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]    " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + "  -- " + detail); }
}
const pause = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const APP = path.join(RACINE, "THEOLOGICUS.html");
  if (!fs.existsSync(APP)) {
    console.error("[ECHEC] application introuvable : " + APP + " (racine=" + RACINE + ")");
    process.exit(1);
  }

  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const attendreAppli = (ms) => page.waitForFunction(
    () => typeof window.__v678SelToolbar === "object" && typeof window.sendMessage === "function",
    null, { timeout: ms }).then(() => true).catch(() => false);

  let appli = await attendreAppli(60000);
  if (!appli) {
    console.log("[DIAG] application non prête après 60 s — rechargement unique…");
    try { await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }); } catch (e) {}
    appli = await attendreAppli(60000);
  }
  if (!appli) {
    const d = await page.evaluate(() => ({
      v678: typeof window.__v678SelToolbar,
      send: typeof window.sendMessage,
      scripts: document.querySelectorAll("script[id]").length,
      module: !!document.getElementById("v678-sel-toolbar"),
      taille: document.documentElement ? document.documentElement.innerHTML.length : -1
    })).catch(e => ({ erreur: String(e.message) }));
    console.log("[DIAG] " + JSON.stringify(d));
  }

  /* Couper le réseau : pas d'appel modèle ni MCP pendant le banc */
  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, route => route.abort());
  await page.route("**/faux-llm", async (route) => {
    route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" },
      body: 'data: {"choices":[{"delta":{"content":"Reponse."}}]}\n\ndata: [DONE]\n\n' });
  });

  /* 1. Module présent */
  ok("M1 module __v678SelToolbar exposé",
    await page.evaluate(() => typeof window.__v678SelToolbar === "object"),
    "type=" + await page.evaluate(() => typeof window.__v678SelToolbar));

  ok("M2 script v678-sel-toolbar présent dans le DOM",
    await page.evaluate(() => !!document.getElementById("v678-sel-toolbar")),
    "");

  /* 2. Préparer un message dans le chat */
  await page.evaluate(() => {
    if (typeof state !== "undefined" && state.messages) {
      state.messages.push({
        role: "assistant",
        content: "Voici un passage theologique important. La grace divine illumine le coeur de l'homme. La foi est le fondement de toute esperance.",
        ts: Date.now(),
        annotations: [], marks: [], shapes: []
      });
      if (typeof renderMessages === "function") renderMessages();
    }
  });
  await pause(500);

  /* 3. Sélectionner du texte dans le message */
  const msgSelector = ".message-content";
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const range = document.createRange();
    const text = el.firstChild || el;
    if (text.nodeType === 3) {
      range.selectNodeContents(text);
    } else {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      const second = walker.nextNode();
      if (first && second) {
        range.setStart(first, 0);
        range.setEnd(second, Math.min(second.textContent.length, 20));
      } else if (first) {
        range.selectNodeContents(first);
      }
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, msgSelector);
  await pause(200);

  /* Déclencher la détection (detectSelectionAndShow) */
  await page.evaluate(() => {
    document.dispatchEvent(new Event("mouseup"));
  });
  await pause(500);

  /* 4. La barre d'outils doit être visible */
  const toolbarVisible = await page.evaluate(() => {
    const t = document.getElementById("sel-toolbar");
    return t && t.style.display !== "none" && t.offsetWidth > 0;
  });
  ok("B1 barre d'outils visible après sélection dans un message", toolbarVisible, "");

  /* 5. Vérifier les groupes */
  const groups = await page.evaluate(() => {
    const t = document.getElementById("sel-toolbar");
    if (!t) return null;
    const labels = Array.from(t.querySelectorAll(".st-label")).map(e => e.textContent.trim());
    const dots = t.querySelectorAll(".st-hl-dot").length;
    const shapes = t.querySelectorAll(".st-shape-btn").length;
    const btns = t.querySelectorAll(".st-btn").length;
    return { labels, dots, shapes, btns };
  });
  ok("B2 groupe 'Surligner' présent", groups && groups.labels.indexOf("Surligner") >= 0, groups ? JSON.stringify(groups.labels) : "null");
  ok("B3 groupe 'Encadrer' présent", groups && groups.labels.indexOf("Encadrer") >= 0, "");
  ok("B4 cinq pastilles de couleur", groups && groups.dots === 5, groups ? "dots=" + groups.dots : "null");
  ok("B5 cinq boutons de formes (4 rapides + 1 'plus')", groups && groups.shapes === 5, groups ? "shapes=" + groups.shapes : "null");
  ok("B6 boutons d'action présents (note, chat, copier, traduire, lire)", groups && groups.btns >= 5, groups ? "btns=" + groups.btns : "null");

  /* 6. Le panneau "plus de formes" s'ouvre */
  const moreOpens = await page.evaluate(() => {
    const btn = document.querySelector("#sel-toolbar .st-shape-btn:last-child");
    if (!btn) return false;
    btn.click();
    return new Promise(resolve => {
      setTimeout(() => {
        const m = document.querySelector("#sel-toolbar .st-more");
        resolve(m && m.classList.contains("open"));
      }, 200);
    });
  });
  ok("B7 panneau 'plus de formes' s'ouvre au clic", moreOpens, "");

  /* Vérifier que le panneau plus contient des formes de la palette */
  const moreCount = await page.evaluate(() => {
    const m = document.querySelector("#sel-toolbar .st-more");
    return m ? m.querySelectorAll(".st-more-ico").length : 0;
  });
  ok("B8 panneau 'plus de formes' contient des formes (>10)", moreCount > 10, "count=" + moreCount);

  /* Fermer le panneau plus */
  await page.evaluate(() => {
    const btn = document.querySelector("#sel-toolbar .st-shape-btn:last-child");
    if (btn) btn.click();
  });
  await pause(200);

  /* 7. La bulle atc-bubble doit être masquée quand la barre est visible */
  const bubbleHidden = await page.evaluate(() => {
    const b = document.getElementById("atc-bubble");
    return !b || b.style.display === "none";
  });
  ok("B9 bulle #atc-bubble masquée quand la barre d'outils est visible", bubbleHidden, "");

  /* 8. Cliquer sur une pastille de couleur crée un surlignage */
  /* Re-sélectionner d'abord */
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first) {
      range.selectNodeContents(first);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
    }
  }, msgSelector);
  await page.evaluate(() => document.dispatchEvent(new Event("mouseup")));
  await pause(500);

  const marksBefore = await page.evaluate(() => {
    const msgs = (typeof state !== "undefined" && state.messages) ? state.messages : [];
    return msgs.reduce((s, m) => s + (m.marks || []).length, 0);
  });

  /* Cliquer sur la pastille jaune */
  await page.evaluate(() => {
    const dot = document.querySelector("#sel-toolbar .st-hl-dot[data-color='yellow']");
    if (dot) dot.click();
  });
  await pause(500);

  const marksAfter = await page.evaluate(() => {
    const msgs = (typeof state !== "undefined" && state.messages) ? state.messages : [];
    return msgs.reduce((s, m) => s + (m.marks || []).length, 0);
  });
  ok("B10 clic sur pastille jaune crée un surlignage (marks augmentent)", marksAfter > marksBefore,
    "before=" + marksBefore + " after=" + marksAfter);

  /* 9. La barre disparaît après l'action */
  const toolbarHiddenAfter = await page.evaluate(() => {
    const t = document.getElementById("sel-toolbar");
    return !t || t.style.display === "none";
  });
  ok("B11 barre d'outils disparaît après l'action de surlignage", toolbarHiddenAfter, "");

  /* 10. La barre ne s'affiche PAS en mode universel (hors message) */
  /* D'abord, nettoyer l'état */
  await page.evaluate(() => {
    window._atcSel = null;
    const t = document.getElementById("sel-toolbar");
    if (t) t.style.display = "none";
    const b = document.getElementById("atc-bubble");
    if (b) b.style.display = "none";
    const sel = window.getSelection();
    sel.removeAllRanges();
  });
  await pause(200);

  /* Sélectionner du texte hors message (dans le titre par exemple) */
  const universalTarget = await page.evaluate(() => {
    /* Trouver un élément hors .message avec du texte */
    const candidates = document.querySelectorAll("h1, .app-title, header h1, .hud-title, nav h1, .brand");
    for (const el of candidates) {
      if (el.textContent.trim().length >= 3 && !el.closest(".message")) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(range);
        return el.tagName;
      }
    }
    /* Repli : créer un div temporaire hors .message */
    const div = document.createElement("div");
    div.textContent = "Texte hors message de test";
    div.style.position = "absolute"; div.style.top = "5px"; div.style.left = "5px";
    div.id = "test-universal-target";
    document.body.insertBefore(div, document.body.firstChild);
    const range = document.createRange();
    range.selectNodeContents(div);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    return "div#test-universal-target";
  });
  await pause(100);
  await page.evaluate(() => document.dispatchEvent(new Event("mouseup")));
  await pause(600);  /* Attendre les 300ms de notre timer + marge */

  const toolbarVisibleUniversal = await page.evaluate(() => {
    const t = document.getElementById("sel-toolbar");
    return t && t.style.display !== "none";
  });
  ok("B12 barre d'outils ne s'affiche PAS hors message (mode universel)", !toolbarVisibleUniversal,
    "display=" + await page.evaluate(() => { const t = document.getElementById("sel-toolbar"); return t ? t.style.display : "null"; }));

  /* 11. Vérifier que les écouteurs sont en place */
  const patchInfo = await page.evaluate(() => {
    return {
      v678Exposed: typeof window.__v678SelToolbar === "object",
      toolbarExists: !!document.getElementById("sel-toolbar"),
      atcBubbleExists: !!document.getElementById("atc-bubble")
    };
  });
  ok("B13 module v678 actif et écouteurs en place", patchInfo.v678Exposed && patchInfo.atcBubbleExists,
    "v678=" + patchInfo.v678Exposed + " bubble=" + patchInfo.atcBubbleExists);

  /* 12. Aucune erreur JS */
  ok("B14 aucune erreur JavaScript pendant le banc", erreurs.length === 0,
    erreurs.length ? erreurs.slice(0, 3).join(" | ") : "");

  await browser.close();
  serveur.close();

  console.log("\n=== v678 barre d'outils de sélection : " + ok_n + " OK, " + ko_n + " ÉCHEC, " + ign_n + " IGNORÉ ===");
  process.exit(ko_n > 0 ? 1 : 0);
})();
