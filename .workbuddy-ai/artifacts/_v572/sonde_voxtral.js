/* sonde voxtral — pourquoi HTTP 422 ? teste des variantes de format audio
   avec la configuration RÉELLE de la machine (clés JAMAIS affichées). */
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const { chromium } = require('playwright');
const BHC = require('../../../tools/bench_common.js');

(async () => {
  const port = await BHC.pickFreePort();
  /* PAS de localAppData : le relais sert le VRAI magasin (clés de l'utilisateur) */
  const relais = await BHC.spawnRelay({ port });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await BHC.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); localStorage.setItem('theo_sync_on_v1', '0'); } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const rapport = await page.evaluate(async () => {
    const out = { cles: {}, variantes: [] };
    const st = (typeof state !== 'undefined') ? state : window.state;
    out.cles = {
      mistral: !!(st.keys && st.keys.mistral) || !!st.apiKey,
      agnes: !!(st.keys && st.keys.agnes),
      openai: !!(st.keys && st.keys.openai),
      customs: (st.customModels || []).map(c => ({ nom: c.name || c.model, audio: !!c.audio }))
    };
    const cfg = (typeof resolveModelConfig === 'function') ? resolveModelConfig('mistral:voxtral-small-2507') : null;
    if (!cfg || !cfg.apiKey) { out.erreur = 'pas de config voxtral (clé Mistral absente ?)'; return out; }
    out.endpoint = cfg.endpoint;
    out.modele = cfg.model;
    out.klen = String(cfg.apiKey || '').length;

    const poster = async (payload) => {
      const t0 = performance.now();
      try {
        const res = await fetch(cfg.endpoint, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const ms = Math.round(performance.now() - t0);
        let corps = '';
        try { corps = (await res.text()).slice(0, 400); } catch (e) {}
        return { status: res.status, ms, corps };
      } catch (e) { return { status: 0, ms: Math.round(performance.now() - t0), corps: String(e && e.message || e) }; }
    };

    /* WAV de 1 s avec un vrai signal (pas du silence) */
    const rate = 16000, n = rate;
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = 0.2 * Math.sin(2 * Math.PI * 440 * i / rate) * Math.sin(Math.PI * i / n);
    const ab = (window.__v571Adeodat && window.__v571Adeodat.encoderWav) ? window.__v571Adeodat.encoderWav([buf], rate) : null;
    let bin = ''; const oct = new Uint8Array(ab); const PAS = 0x8000;
    for (let i = 0; i < oct.length; i += PAS) bin += String.fromCharCode.apply(null, oct.subarray(i, i + PAS));
    const wavUrl = 'data:audio/wav;base64,' + btoa(bin);
    out.wavKo = Math.round(oct.length / 1024);

    /* variante A : audio_url = data URL (implémentation actuelle v571) */
    out.variantes.push(await poster({
      model: 'voxtral-small-2507',
      messages: [{ role: 'user', content: [
        { type: 'audio_url', audio_url: wavUrl },
        { type: 'text', text: 'Dis ce que tu entends.' }
      ] }],
      max_tokens: 16
    }));

    /* variante B : audio_url = objet {url} */
    out.variantes.push(await poster({
      model: 'voxtral-small-2507',
      messages: [{ role: 'user', content: [
        { type: 'audio_url', audio_url: { url: wavUrl } },
        { type: 'text', text: 'Dis ce que tu entends.' }
      ] }],
      max_tokens: 16
    }));

    /* variante C : enregistrement MediaRecorder RÉEL (webm/opus) —
       exactement ce que fait la dictée du composeur */
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(flux);
      const morceaux = [];
      mr.ondataavailable = e => { if (e.data.size) morceaux.push(e.data); };
      const fini = new Promise(r => { mr.onstop = r; });
      mr.start();
      await new Promise(r => setTimeout(r, 1200));
      mr.stop();
      await fini;
      flux.getTracks().forEach(t => t.stop());
      const blob = new Blob(morceaux, { type: mr.mimeType || 'audio/webm' });
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result); fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      out.webmKo = Math.round(blob.size / 1024);
      out.webmType = mr.mimeType;
      out.variantes.push(await poster({
        model: 'voxtral-small-2507',
        messages: [{ role: 'user', content: [
          { type: 'audio_url', audio_url: dataUrl },
          { type: 'text', text: 'Dis ce que tu entends.' }
        ] }],
        max_tokens: 16
      }));
    } catch (e) {
      out.variantes.push({ status: -1, corps: 'MediaRecorder indisponible : ' + String(e && e.message || e).slice(0, 100) });
    }
    return out;
  });

  console.log(JSON.stringify(rapport, null, 2).replace(/"apiKey[^,]*/g, '"apiKey":"***"'));
  await browser.close();
  BHC.killRelay(relais);
})().catch(e => { console.error(e); process.exit(3); });
