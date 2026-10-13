/* v572bis — format input_audio (le seul que l'API Mistral accepte, mesuré) +
   la dictée suit le cerveau choisi s'il est audio-capable. CRLF sûr. */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if ((src.match(/(?<!\r)\n/g) || []).length > 0) { console.error('FATAL : LF seuls avant édition'); process.exit(1); }

function remplacer(titre, oldLines, newLines) {
  const oldStr = oldLines.join('\r\n');
  const newStr = newLines.join('\r\n');
  const n = src.split(oldStr).length - 1;
  if (n !== 1) { console.error('FATAL [' + titre + '] : ancrage trouvé ' + n + ' fois'); process.exit(1); }
  src = src.replace(oldStr, () => newStr);
  console.log('OK  ' + titre);
}

/* ═══ 1. v571.transcrire — content en input_audio (fix 422) ═══ */
remplacer('v571.transcrire — input_audio (I1)',
[
'          body: JSON.stringify({',
'            model: essais[i],',
'            messages: [',
'              { role: "system", content: "Tu es un transcribeur vocal. Transcris fidèlement l\'audio en texte. Réponds UNIQUEMENT avec la transcription, sans commentaire." },',
'              { role: "user", content: [',
'                { type: "audio_url", audio_url: dataUrl },',
'                { type: "text", text: "Transcris cet audio." }',
'              ] }',
'            ],',
'            temperature: 0.1,',
'            max_tokens: 1000',
'          })'
],
[
'          body: JSON.stringify({',
'            model: essais[i],',
'            messages: [',
'              { role: "system", content: "Tu es un transcribeur vocal. Transcris fidèlement l\'audio en texte. Réponds UNIQUEMENT avec la transcription, sans commentaire." },',
'              { role: "user", content: (function () {',
'                  /* v572bis — l\'API Mistral N\\\'ACCEPT PAS audio_url en tableau',
'                     de contenu (HTTP 422 « Input should be a valid string »,',
'                     mesuré sur pièce) : le format correct est input_audio',
'                     {data, format} (style OpenAI) → 200 mesuré. */',
'                  const mF = /^data:audio\\/([^;]+);base64,(.*)$/.exec(String(dataUrl || "")) || [];',
'                  return mF[2]',
'                    ? [{ type: "input_audio", input_audio: { data: mF[2], format: mF[1] } }, { type: "text", text: "Transcris cet audio." }]',
'                    : [{ type: "text", text: "(audio illisible)" }];',
'                })() }',
'            ],',
'            temperature: 0.1,',
'            max_tokens: 1000',
'          })'
]);

/* ═══ 2. v571.cfgTranscription — le cerveau choisi s'il est audio ═══ */
remplacer('v571.cfgTranscription — cerveau audio en priorité (I2)',
[
'  function cfgTranscription() {',
'    try {',
'      const st = ST() || {};',
'      const cms = st.customModels || [];'
],
[
'  function cfgTranscription() {',
'    try {',
'      const st = ST() || {};',
'      /* v572bis — le CERVEAU CHOISI, s\\\'il traite l\\\'audio, sert à la dictée',
'         en priorité (demande utilisateur : la dictée doit suivre le modèle',
'         sélectionné dans la fenêtre d\\\'Adeodat). */',
'      const choix = modeleChoisi();',
'      if (choix) {',
'        const cmC = (st.customModels || []).find(m => m.uid === choix);',
'        if (cmC && cmC.audio && cmC.baseUrl && cle(cmC.apiKey)) {',
'          return { base: String(cmC.baseUrl).replace(/\\/+$/, ""), key: cle(cmC.apiKey), model: cmC.model || "whisper-1", alt: "", cerveau: true };',
'        }',
'        if (/^mistral:/.test(choix) && /voxtral/i.test(choix)) {',
'          const cfgC = (typeof resolveModelConfig === "function") ? resolveModelConfig(choix) : null;',
'          if (cfgC && cle(cfgC.apiKey)) {',
'            return { base: String(cfgC.endpoint).replace(/\\/chat\\/completions.*$/, ""), key: cle(cfgC.apiKey), model: cfgC.model, alt: "", cerveau: true };',
'          }',
'        }',
'      }',
'      const cms = st.customModels || [];'
]);

/* ═══ 3. v572.probeDictee — même format input_audio ═══ */
remplacer('v572.probeDictee — input_audio (I3)',
[
'          body: JSON.stringify({ model: essais[i], messages: [{ role: "user", content: [',
'            { type: "audio_url", audio_url: wav },',
'            { type: "text", text: "Décris cet audio en un mot." }',
'          ] }], max_tokens: 8, temperature: 0 })'
],
[
'          body: JSON.stringify({ model: essais[i], messages: [{ role: "user", content: (function () {',
'            const mF = /^data:audio\\/([^;]+);base64,(.*)$/.exec(String(wav || "")) || [];',
'            return mF[2] ? [{ type: "input_audio", input_audio: { data: mF[2], format: mF[1] } }, { type: "text", text: "Décris cet audio en un mot." }] : [{ type: "text", text: "(audio illisible)" }];',
'          })() }], max_tokens: 8, temperature: 0 })'
]);

/* ═══ 4. v572.candidatsDictee — la config PRINCIPALE (cerveau suivi) en tête ═══ */
remplacer('v572.candidatsDictee — priorité au cerveau suivi (I4)',
[
'  function candidatsDictee() {',
'    const st = ST() || {}, out = [];',
'    (st.customModels || []).forEach(function (cm) {',
'      if (cm.audio && cm.baseUrl && cle(cm.apiKey)) out.push({ label: "⭐ " + (cm.name || cm.model || "perso"), base: String(cm.baseUrl).replace(/\\/+$/, ""), key: cle(cm.apiKey), model: cm.model || "whisper-1" });',
'    });',
'    const mk = cle((st.keys && st.keys.mistral) || st.apiKey || "");',
'    if (mk) out.push({ label: "Mistral · Voxtral", base: "https://api.mistral.ai/v1", key: mk, model: "voxtral-small-2507", alt: "voxtral-mini-2507" });',
'    const ak = cle((st.keys && st.keys.agnes) || "");',
'    if (ak) out.push({ label: "Agnes · Voxtral", base: "https://apihub.agnes-ai.com/v1", key: ak, model: "voxtral-small-2507", alt: "voxtral-mini-2507" });',
'    return out;',
'  }'
],
[
'  function candidatsDictee() {',
'    const st = ST() || {}, out = [], vus = {};',
'    const pousser = function (c, lbl) { if (c && c.base && c.key && !vus[c.base + "::" + c.model]) { vus[c.base + "::" + c.model] = 1; out.push({ label: lbl, base: c.base, key: c.key, model: c.model, alt: c.alt }); } };',
'    try {',
'      /* v572bis — la config RÉELLEMENT utilisée par la dictée en premier */',
'      const p = (window.__v571Adeodat && window.__v571Adeodat.cfgTranscription) ? window.__v571Adeodat.cfgTranscription() : null;',
'      if (p) pousser(p, "🧠 " + (p.model || "audio") + (p.cerveau ? " — modèle choisi" : " — priorité"));',
'    } catch (e0) {}',
'    (st.customModels || []).forEach(function (cm) {',
'      if (cm.audio && cm.baseUrl && cle(cm.apiKey)) pousser({ base: String(cm.baseUrl).replace(/\\/+$/, ""), key: cle(cm.apiKey), model: cm.model || "whisper-1" }, "⭐ " + (cm.name || cm.model || "perso"));',
'    });',
'    const mk = cle((st.keys && st.keys.mistral) || st.apiKey || "");',
'    if (mk) pousser({ base: "https://api.mistral.ai/v1", key: mk, model: "voxtral-small-2507", alt: "voxtral-mini-2507" }, "Mistral · Voxtral");',
'    const ak = cle((st.keys && st.keys.agnes) || "");',
'    if (ak) pousser({ base: "https://apihub.agnes-ai.com/v1", key: ak, model: "voxtral-small-2507", alt: "voxtral-mini-2507" }, "Agnes · Voxtral");',
'    return out;',
'  }'
]);

/* ═══ 5. composeur transcribeWithMistral — même bug 422 corrigé ═══ */
remplacer('composeur.transcribeWithMistral — input_audio (I5)',
[
'      const contextMessages = [',
'        { role: "system", content: "Tu es un transcribeur vocal. Transcris fidèlement l\'audio en texte. Réponds UNIQUEMENT avec le texte transris, sans commentaire." },',
'        { role: "user", content: [',
'          { type: "audio_url", audio_url: audioBase64 },',
'          { type: "text", text: "Transcris cet audio en texte." }',
'        ]}',
'      ];'
],
[
'      const contextMessages = [',
'        { role: "system", content: "Tu es un transcribeur vocal. Transcris fidèlement l\'audio en texte. Réponds UNIQUEMENT avec le texte transris, sans commentaire." },',
'        { role: "user", content: (function () {',
'            /* v572bis — même correctif 422 que la dictée d\\\'Adeodat :',
'               input_audio {data, format} au lieu de audio_url (422 mesuré). */',
'            const mF = /^data:audio\\/([^;]+);base64,(.*)$/.exec(String(audioBase64 || "")) || [];',
'            return mF[2]',
'              ? [{ type: "input_audio", input_audio: { data: mF[2], format: mF[1] } }, { type: "text", text: "Transcris cet audio en texte." }]',
'              : [{ type: "audio_url", audio_url: audioBase64 }, { type: "text", text: "Transcris cet audio en texte." }];',
'          })() }',
'      ];'
]);

remplacer('composeur.transcribeFallback — input_audio (I6)',
[
'              messages: [',
'                { role: "system", content: "Transcris l\'audio en texte." },',
'                { role: "user", content: [',
'                  { type: "audio_url", audio_url: audioBase64 },',
'                  { type: "text", text: "Transcris cet audio." }',
'                ]}',
'              ],'
],
[
'              messages: [',
'                { role: "system", content: "Transcris l\'audio en texte." },',
'                { role: "user", content: (function () {',
'                    const mF = /^data:audio\\/([^;]+);base64,(.*)$/.exec(String(audioBase64 || "")) || [];',
'                    return mF[2]',
'                      ? [{ type: "input_audio", input_audio: { data: mF[2], format: mF[1] } }, { type: "text", text: "Transcris cet audio." }]',
'                      : [{ type: "audio_url", audio_url: audioBase64 }, { type: "text", text: "Transcris cet audio." }];',
'                  })() }',
'              ],'
]);

/* ═══ contrôles ═══ */
if ((src.match(/(?<!\r)\n/g) || []).length > 0) { console.error('FATAL : LF seuls introduits'); process.exit(1); }
for (const m of ['input_audio', 'cerveau: true', 'modèle choisi']) {
  if (src.indexOf(m) === -1) { console.error('FATAL : marqueur absent : ' + m); process.exit(1); }
}
for (const id of ['v571-adeodat-v3g', 'v572-adeodat-jauge']) {
  const a2 = src.indexOf('<script id="' + id + '">');
  const f2 = src.indexOf('</script>', a2);
  try { new Function(src.slice(a2 + ('<script id="' + id + '">').length, f2)); console.log('SYNTAXE OK ' + id); }
  catch (e) { console.error('FATAL : syntaxe ' + id + ' : ' + e.message); process.exit(1); }
}
fs.writeFileSync(F, src, 'utf8');
console.log('ÉCRIT. Taille : ' + src.length);
