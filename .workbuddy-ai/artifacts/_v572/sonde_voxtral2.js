/* sonde voxtral 2 — quel format accepte l'API Mistral pour l'audio ? */
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const { chromium } = require('playwright');
const BHC = require('../../../tools/bench_common.js');

(async () => {
  const port = await BHC.pickFreePort();
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
    const out = { variantes: [] };
    const st = (typeof state !== 'undefined') ? state : window.state;
    const cfg = (typeof resolveModelConfig === 'function') ? resolveModelConfig('mistral:voxtral-small-2507') : null;
    if (!cfg || !cfg.apiKey) { out.erreur = 'pas de clé mistral'; return out; }
    const entetes = { 'Authorization': 'Bearer ' + cfg.apiKey };

    /* WAV 1 s, signal réel */
    const rate = 16000, n = rate;
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = 0.2 * Math.sin(2 * Math.PI * 440 * i / rate) * Math.sin(Math.PI * i / n);
    const ab = window.__v571Adeodat.encoderWav([buf], rate);
    let bin = ''; const oct = new Uint8Array(ab); const PAS = 0x8000;
    for (let i = 0; i < oct.length; i += PAS) bin += String.fromCharCode.apply(null, oct.subarray(i, i + PAS));
    const b64 = btoa(bin);
    const wavUrl = 'data:audio/wav;base64,' + b64;

    const posterJson = async (url, payload, label) => {
      const t0 = performance.now();
      try {
        const res = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, entetes), body: JSON.stringify(payload) });
        const corps = (await res.text()).slice(0, 260);
        out.variantes.push({ label, status: res.status, ms: Math.round(performance.now() - t0), corps });
      } catch (e) { out.variantes.push({ label, status: 0, corps: String(e && e.message || e) }); }
    };

    /* D : input_audio à la OpenAI (base64 SANS préfixe + format) */
    await posterJson(cfg.endpoint, {
      model: 'voxtral-small-2507',
      messages: [{ role: 'user', content: [
        { type: 'input_audio', input_audio: { data: b64, format: 'wav' } },
        { type: 'text', text: 'Dis ce que tu entends.' }
      ] }],
      max_tokens: 16
    }, 'D input_audio (base64+format)');

    /* E : audio_url mais EN PREMIER le texte puis l'audio ? (ordre) — même chose, on teste plutôt chat complet avec content STRING + audio séparé impossible… on teste /audio/transcriptions multipart */
    try {
      const t0 = performance.now();
      const fd = new FormData();
      const blob = new Blob([oct], { type: 'audio/wav' });
      fd.append('file', blob, 'audio.wav');
      fd.append('model', 'voxtral-small-2507');
      const res = await fetch('https://api.mistral.ai/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': entetes.Authorization }, body: fd });
      const corps = (await res.text()).slice(0, 260);
      out.variantes.push({ label: 'G /audio/transcriptions (multipart)', status: res.status, ms: Math.round(performance.now() - t0), corps });
    } catch (e) { out.variantes.push({ label: 'G /audio/transcriptions', status: 0, corps: String(e && e.message || e) }); }

    /* H : chat/completions avec audio_url STRING mais model voxtral + stream:false explicite ? déjà fait (A). On tente plutôt : content array avec SEULEMENT audio_url (pas de texte) */
    await posterJson(cfg.endpoint, {
      model: 'voxtral-small-2507',
      messages: [{ role: 'user', content: [
        { type: 'audio_url', audio_url: wavUrl }
      ] }],
      max_tokens: 16
    }, 'H content = audio_url seul');
    return out;
  });

  console.log(JSON.stringify(rapport, null, 2));
  await browser.close();
  BHC.killRelay(relais);
})().catch(e => { console.error(e); process.exit(3); });
