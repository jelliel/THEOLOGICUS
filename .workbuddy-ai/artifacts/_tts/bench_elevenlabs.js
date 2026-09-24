/* Banc — la cause ElevenLabs est lisible (demande #1 de l'utilisateur).

   Le correctif : ttsCauseHttp(moteur, status, corps) traduit le statut HTTP en
   cause francaise au lieu de jeter « moteur-erreur ». On extrait la FONCTION
   REELLE du HTML livre (pas une copie) et on l'appelle avec les corps que
   renvoie api.elevenlabs.io, pour prouver que chaque echec nomme sa cause.
   Mesure, pas narration — comme bench_autostart.js l'a fait pour le demarrage. */
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Theologicus';
const html = fs.readFileSync(path.join(ROOT, 'THEOLOGICUS.html'), 'utf8');

// Extraction par comptage de braces : la fonction est auto-suffisante
// (JSON.parse + variables locales, aucune dependance externe).
const start = html.indexOf('function ttsCauseHttp');
if (start < 0) { console.error('ttsCauseHttp introuvable dans le HTML'); process.exit(1); }
let i = html.indexOf('{', start), depth = 0, end = -1;
for (; i < html.length; i++) {
  if (html[i] === '{') depth++;
  else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const ttsCauseHttp = eval('(' + html.slice(start, end) + ')');

// [moteur, status, corps brut, cause attendue]
const cas = [
  ['elevenlabs', 401, '{"detail":{"message":"Invalid API key"}}', 'clé API refusée (401) — Invalid API key'],
  ['elevenlabs', 402, '{}', 'quota épuisé (402)'],
  ['elevenlabs', 403, '{}', 'voix non autorisée pour ce compte (403)'],
  ['elevenlabs', 404, '{}', 'Voice ID inconnu (404)'],
  ['elevenlabs', 422, '{}', 'paramètres refusés (422) — essayez un autre modèle'],
  ['elevenlabs', 429, '{}', 'trop de requêtes (429)'],
  ['elevenlabs', 500, 'not json', 'HTTP 500'],
  ['elevenlabs', 401, 'not json', 'clé API refusée (401)'],
  ['elevenlabs', 400, '{"message":"voice not found"}', 'HTTP 400 — voice not found'],
  ['supertonic', 404, '{}', 'URL de service incorrecte : /tts absent (404)'],
  ['supertonic', 502, '{}', 'service arrêté ou modèle en cours de chargement (502)'],
];

let ech = 0;
for (const [m, s, corps, attendu] of cas) {
  const got = ttsCauseHttp(m, s, corps);
  const ok = got === attendu;
  if (!ok) ech++;
  console.log((ok ? 'OK    ' : 'ECHEC ') + m + ' ' + s + ' -> ' + JSON.stringify(got) +
    (ok ? '' : '   (attendu ' + JSON.stringify(attendu) + ')'));
}
console.log('\nVERDICT : ' + ech + ' echec(s) sur ' + cas.length);
process.exit(ech ? 1 : 0);
