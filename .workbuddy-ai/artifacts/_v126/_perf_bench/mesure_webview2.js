// Mesure la VRAIE WebView2 de THEOLOGICUS par le port de debogage distant.
//
// Pourquoi ne pas passer par pywebview : `evaluate_js` attend un evenement
// `loaded` qui n'arrive pas quand l'appel vient d'un autre fil, et
// `webview.start()` doit occuper le fil principal. Le port de debogage est un
// canal independant.
//
// Pourquoi une URL WebSocket et non l'URL http : Playwright ajoute une barre
// oblique finale (`/json/version/`) et le point d'entree de WebView2 repond
// alors 502. Le script Python lit `/json/version` et transmet
// `webSocketDebuggerUrl`.
//
// Usage : node mesure_webview2.js ws://127.0.0.1:9222/devtools/browser/<id>
const { chromium } = require("playwright");

const CIBLE = process.argv[2];
if (!CIBLE) { console.log("[X] usage : node mesure_webview2.js <ws-ou-http>"); process.exit(1); }

const JS_GPU = `(() => {
  const out = { dpr: window.devicePixelRatio, cores: navigator.hardwareConcurrency || 0,
                url: location.href };
  try {
    const c = document.createElement('canvas');
    const gl2 = c.getContext('webgl2');
    const gl = gl2 || c.getContext('webgl');
    out.webgl2 = !!gl2;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      out.vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      out.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } else { out.erreur = 'aucun contexte WebGL'; }
  } catch (e) { out.erreur = String(e); }
  return JSON.stringify(out);
})()`;

const JS_APP = `(() => {
  const c = document.getElementById('chat-container');
  const m = document.querySelector('#chat-container .message');
  const cs = m ? getComputedStyle(m) : null;
  return JSON.stringify({
    messages: document.querySelectorAll('#chat-container .message').length,
    willChange: cs ? cs.willChange : null,
    animation: cs ? cs.animationName : null,
    scrollBehavior: c ? getComputedStyle(c).scrollBehavior : null,
    version: (document.body.innerText.match(/2\\.0\\.[0-9]+/) || [])[0] || null,
    canvas: document.querySelectorAll('canvas').length,
    nodes: document.getElementsByTagName('*').length,
  });
})()`;

const JS_HZ = `new Promise(res => {
  const d = []; let last = performance.now(), n = 0;
  const step = () => { const t = performance.now(); d.push(t - last); last = t; n++;
    if (n < 90) requestAnimationFrame(step);
    else { const s = d.slice(1).sort((a,b)=>a-b);
           res(JSON.stringify({ mediane: s[Math.floor(s.length/2)], min: s[0], max: s[s.length-1] })); } };
  requestAnimationFrame(step);
})`;

(async () => {
  let b = null;
  try {
    b = await chromium.connectOverCDP(CIBLE);
  } catch (e) {
    console.log("[X] connexion a " + CIBLE.slice(0, 60) + " impossible : " + String(e).split("\n")[0]);
    process.exit(1);
  }
  const ctx = b.contexts()[0];
  const pages = ctx ? ctx.pages() : [];
  const page = pages.find(p => p.url().includes("THEOLOGICUS")) || pages[0];
  if (!page) { console.log("[X] aucune page trouvee"); process.exit(1); }

  console.log("page   : " + page.url());
  const gpu = JSON.parse(await page.evaluate(JS_GPU));
  console.log("\n── Moteur de rendu de la WebView2 ──");
  for (const k of ["vendor", "renderer", "webgl2", "dpr", "cores", "erreur"]) {
    if (k in gpu) console.log("  " + k.padEnd(10) + " " + gpu[k]);
  }
  const s = ((gpu.renderer || "") + " " + (gpu.vendor || "")).toLowerCase();
  const logiciel = ["swiftshader", "software", "llvmpipe", "basic render"].some(x => s.includes(x));
  console.log("  verdict    " + (gpu.renderer ? (logiciel ? "RENDU LOGICIEL (pas de GPU)" : "GPU UTILISE") : "indetermine"));

  let app = {}, hz = null;
  try { app = JSON.parse(await page.evaluate(JS_APP)); } catch (e) { app = { erreur: String(e) }; }
  console.log("\n── Etat de l'application ──");
  for (const k of Object.keys(app)) console.log("  " + k.padEnd(16) + " " + app[k]);
  try { hz = JSON.parse(await page.evaluate(JS_HZ)); } catch (e) {}
  if (hz) {
    console.log("  " + "ecart median".padEnd(16) + " " + hz.mediane.toFixed(1) + " ms  -> ~" +
                (1000 / hz.mediane).toFixed(0) + " Hz   (min " + hz.min.toFixed(1) +
                " / max " + hz.max.toFixed(1) + ")");
  }

  let calques = null;
  try {
    const cl = await ctx.newCDPSession(page);
    const vus = [];
    cl.on("LayerTree.layerTreeDidChange", e => { if (e && e.layers) { vus.length = 0; vus.push(...e.layers); } });
    await cl.send("LayerTree.enable");
    await page.waitForTimeout(1200);
    const raisons = {};
    for (const l of vus.slice(0, 400)) {
      try {
        const r = await cl.send("LayerTree.compositingReasons", { layerId: l.layerId });
        for (const x of (r.compositingReasons || [])) raisons[x] = (raisons[x] || 0) + 1;
      } catch (e) {}
    }
    await cl.send("LayerTree.disable");
    calques = { total: vus.length, raisons };
    console.log("\n── Calques de composition (WebView2) ──");
    console.log("  total " + vus.length);
    Object.entries(raisons).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .forEach(([k, v]) => console.log("    " + String(v).padStart(4) + "  " + k));
  } catch (e) { console.log("\n[!] LayerTree indisponible : " + String(e).split("\n")[0]); }

  console.log("\nJSON " + JSON.stringify({ gpu, app, hz, calques, logiciel }));
  // On ne ferme PAS le navigateur : c'est l'application de l'utilisateur.
  process.exit(0);
})();
