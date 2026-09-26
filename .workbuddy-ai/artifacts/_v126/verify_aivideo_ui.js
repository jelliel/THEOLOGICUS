// Banc v126d — le modal « AI VIDEO » (document séparé dans un iframe).
//
// Ce banc ne vérifie pas que le studio IA FONCTIONNE (il faudrait une clé et
// cela coûterait de l'argent) : il vérifie qu'il est ATTEIGNABLE, ce qui est
// la seule chose qui peut casser silencieusement.
//
// Trois pannes muettes, toutes déjà possibles ici :
//   1. le fichier compagnon n'est pas servi → iframe VIDE, aucune erreur ;
//   2. les adresses d'API n'ont pas été réécrites → le navigateur appelle le
//      fournisseur en direct et se fait refuser (403 sur l'en-tête Origin),
//      ce qui s'affiche comme « clé invalide » pour une clé parfaite ;
//   3. le proxy du relais ne sait pas faire de GET → le contrôle de clé, qui
//      est un GET /models, échoue. Vérifié côté serveur dans ce banc aussi.
//
// Usage : node verify_aivideo_ui.js --port 8765

const path = require("path");
const { spawn } = require("child_process");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;

const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";

const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}
function section(t) { console.log("\n" + t); }

let relais = null;

async function relaisVit() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`,
      { signal: AbortSignal.timeout(3000) });
    return r.status === 200;
  } catch (e) { return false; }
}

async function assurerRelais() {
  if (await relaisVit()) return true;
  console.log("  … le relais ne répond pas : lancement de proxy_server.py");
  relais = spawn(PY, ["-u", "proxy_server.py"],
    { cwd: RACINE, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await relaisVit()) return true;
    if (relais.exitCode !== null) return false;
  }
  return false;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v126d — MODAL « AI VIDEO » (navigateur + relais)");
  console.log(BASE);
  console.log("=".repeat(72));

  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  // ── 0. Le relais sert le document compagnon ────────────────────────
  section("0. Le relais sert ai-video.html");
  const r0 = await fetch(`http://127.0.0.1:${PORT}/ai-video.html`);
  ok("le document compagnon est servi (HTTP 200)", r0.status === 200, "HTTP " + r0.status);
  const texte = r0.status === 200 ? await r0.text() : "";
  ok("le document n'est pas vide", texte.length > 50000, texte.length + " octets");
  // Sans cette réécriture, l'app appelle le fournisseur en direct et essuie un
  // 403 Origin : elle afficherait « clé invalide » pour une clé parfaite.
  ok("les adresses d'API passent par le relais",
    /_viaRelais\(\s*'https:\/\/apihub\.agnes-ai\.com/.test(texte)
    && /_viaRelais\(\s*'https:\/\/api\.mistral\.ai/.test(texte));
  ok("le repli file:// est conservé (pas de relais hors serveur)",
    /location\.protocol !== 'file:'/.test(texte));

  // ── 1. Le proxy du relais sait faire un GET ────────────────────────
  section("1. Le relais relaie un GET (le contrôle de clé en dépend)");
  // Serveur témoin qui renvoie la MÉTHODE reçue. On ne peut pas viser le
  // relais lui-même : il est mono-thread, il ne peut pas se servir une
  // requête pendant qu'il en traite une — on obtiendrait un 502 qui
  // accuserait le proxy alors qu'il ne décrit que le banc.
  const http = require("http");
  const temoin = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("METHODE=" + req.method);
  });
  await new Promise(r => temoin.listen(8799, "127.0.0.1", r));

  for (const methode of ["GET", "POST"]) {
    let corps = "";
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/proxy/http://127.0.0.1:8799/x`,
        { method: methode, body: methode === "GET" ? undefined : "{}" });
      corps = (await r.text()).trim();
    } catch (e) { corps = "ERR " + e; }
    ok(`un ${methode} confié au proxy part bien en ${methode}`,
      corps === "METHODE=" + methode, corps);
  }
  await new Promise(r => temoin.close(r));

  // ── 2. Le modal s'ouvre et porte le bon titre ──────────────────────
  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const BRUIT = /version\.txt/;
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => {
    if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text());
  });

  section("2. Le modal AI VIDEO");
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((h) => {
    const enc = new TextEncoder().encode("remember:" + h);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("theologicus_remember", JSON.stringify({
        v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok,
      }));
    });
  }, AUTH_HASH);
  await page.evaluate(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const bouton = await page.$("#open-aivideo-modal");
  ok("le bouton AI VIDEO existe", !!bouton);
  ok("il est à côté du bouton STUDIO VIDÉO", await page.evaluate(() => {
    const a = document.getElementById("open-aivideo-modal");
    const s = document.getElementById("open-studio-modal");
    return !!(a && s && a.parentElement === s.parentElement
      && a.previousElementSibling === s);
  }));

  await page.click("#open-aivideo-modal");
  const actif = await page.evaluate(() =>
    document.getElementById("aivideo-modal").classList.contains("active"));
  ok("le clic ouvre le modal", actif);
  const titre = await page.evaluate(() => {
    const m = document.getElementById("aivideo-modal");
    const t = m ? m.querySelector(".modal-title") : null;
    return t ? t.textContent.trim() : "";
  });
  ok("le modal est titré « AI VIDEO »", /AI VIDEO/.test(titre), titre);

  // ── 3. L'iframe charge vraiment le document ────────────────────────
  section("3. Le document est réellement chargé (pas un cadre vide)");
  let charge = false;
  try {
    await page.waitForFunction(() => {
      const f = document.getElementById("aivideo-frame");
      if (!f) return false;
      const d = f.contentDocument;
      return !!d && !!d.body && d.body.children.length > 0;
    }, { timeout: 30000 });
    charge = true;
  } catch (e) { charge = false; }
  ok("l'iframe a un document avec du contenu", charge);

  const interieur = await page.evaluate(() => {
    const f = document.getElementById("aivideo-frame");
    const d = f && f.contentDocument;
    if (!d) return null;
    return {
      titre: d.title || "",
      // Un `about:blank` porterait une URL vide : c'est le signe d'un fichier
      // absent, et il ne lève aucune erreur.
      url: (f.contentWindow && f.contentWindow.location.href) || "",
      enfants: d.body ? d.body.children.length : 0,
      // L'app se déclare elle-même au chargement : sa trace console est la
      // preuve que SON script a tourné, pas seulement que la page s'est peinte.
      aLesStyles: /STYLE_CATEGORIES|ALL_STYLES/.test(d.documentElement.innerHTML),
    };
  });
  ok("le document chargé est bien ai-video.html",
    interieur && /ai-video\.html/.test(interieur.url), interieur ? interieur.url : "(nul)");
  ok("le document porte le titre attendu",
    interieur && /AI VIDEO/.test(interieur.titre), interieur ? interieur.titre : "(nul)");
  ok("le corps du document est peuplé",
    interieur && interieur.enfants > 3, interieur ? interieur.enfants : 0);
  ok("le script de l'application a tourné (ses constantes sont présentes)",
    interieur && interieur.aLesStyles);

  const repli = await page.evaluate(() => {
    const z = document.getElementById("aivideo-indisponible");
    return z ? z.hidden : null;
  });
  ok("le message de repli reste caché quand tout va bien", repli === true, String(repli));

  // ── 4. Fermeture ───────────────────────────────────────────────────
  section("4. Fermeture");
  await page.click("#close-aivideo-modal");
  const ferme = await page.evaluate(() =>
    !document.getElementById("aivideo-modal").classList.contains("active"));
  ok("la croix referme le modal", ferme);

  section("5. Propreté");
  ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  if (relais) relais.kill();

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) {
    console.log("\nÉchecs :");
    resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`));
  }
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => {
  console.error("\n[EXCEPTION] " + (e && e.stack || e));
  if (relais) relais.kill();
  process.exit(3);
});
