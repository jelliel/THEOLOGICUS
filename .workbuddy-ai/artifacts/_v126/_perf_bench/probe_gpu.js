// Sonde GPU — quel moteur de rendu cette machine expose-t-elle a Chromium ?
//
// WebView2 et Chromium partagent le meme moteur : la chaine rendue par
// `WEBGL_debug_renderer_info` est la meme (ANGLE -> D3D11 -> le vrai GPU, ou
// SwiftShader si le rendu est logiciel). Cette sonde sert donc de mesure de
// substitution quand la fenetre WebView2 ne peut pas etre ouverte.
//
// Usage : node probe_gpu.js

const path = require("path");
const { chromium } = require("playwright");

const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

const JS = `(() => {
  const out = { dpr: window.devicePixelRatio, cores: navigator.hardwareConcurrency || 0 };
  try {
    const c = document.createElement('canvas');
    const gl2 = c.getContext('webgl2');
    const gl = gl2 || c.getContext('webgl');
    out.webgl2 = !!gl2;
    if (!gl) { out.erreur = 'aucun contexte WebGL'; return JSON.stringify(out); }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    out.vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    out.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) { out.erreur = String(e); }
  return JSON.stringify(out);
})()`;

async function essayer(nom, options) {
  let b = null;
  try {
    b = await chromium.launch(options);
    const p = await b.newPage();
    const r = JSON.parse(await p.evaluate(JS));
    console.log(`\n── ${nom} ──`);
    for (const k of ["vendor", "renderer", "webgl2", "dpr", "cores", "erreur"]) {
      if (k in r) console.log(`  ${k.padEnd(10)} ${r[k]}`);
    }
    const s = ((r.renderer || "") + " " + (r.vendor || "")).toLowerCase();
    const logiciel = ["swiftshader", "software", "llvmpipe", "basic render"].some(x => s.includes(x));
    console.log(`  verdict    ${r.renderer ? (logiciel ? "RENDU LOGICIEL" : "GPU UTILISE") : "indetermine"}`);
    return r;
  } catch (e) {
    console.log(`\n── ${nom} ──`);
    console.log("  [X] " + String(e).split("\n")[0]);
    return null;
  } finally {
    if (b) { try { await b.close(); } catch (e) {} }
  }
}

(async () => {
  const exe = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
  const base = ["--no-sandbox", "--disable-dev-shm-usage"];
  const gpu = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization",
               "--enable-zero-copy", "--enable-accelerated-2d-canvas"];

  await essayer("headless, sans drapeaux GPU", {
    executablePath: exe, headless: true, args: base,
  });
  await essayer("headless, avec drapeaux GPU", {
    executablePath: exe, headless: true, args: base.concat(gpu),
  });
  const r = await essayer("FENETRE REELLE (headful), avec drapeaux GPU", {
    executablePath: exe, headless: false, args: base.concat(gpu),
  });
  if (r) console.log("\nJSON " + JSON.stringify(r));
  process.exit(0);
})();
