/* Sonde du plafond de durée de l'API Agnes (v455).
   Objectif : connaître la limite RÉELLE de num_frames et le message d'erreur
   exact au-delà — au lieu de la déduire. Consommation de quota minimale :
   on commence par une valeur AU-DESSUS du plafond supposé (601 images) ; si
   elle est refusée, on a la réponse sans lancer aucune génération.
   La clé n'est jamais écrite dans un fichier : elle vient de l'environnement. */
const KEY = process.env.AGNES_KEY;
const BASE = 'https://apihub.agnes-ai.com/v1';
const MODEL = process.env.AGNES_MODEL || 'agnes-video-v2.0';
const FRAME_RATE = 24;

async function essai(numFrames) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/videos', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: 'plan de test — sonde de durée', num_frames: numFrames, frame_rate: FRAME_RATE })
    });
    const txt = await r.text();
    return { numFrames, duree: (numFrames / FRAME_RATE).toFixed(1) + 's', statut: r.status, corps: txt.slice(0, 400) };
  } catch (e) {
    return { numFrames, erreur: String(e).slice(0, 200), ms: Date.now() - t0 };
  }
}

(async () => {
  if (!KEY) { console.log('AGNES_KEY absent de l’environnement'); process.exit(1); }
  console.log('Modèle :', MODEL, '| base :', BASE);
  // 1. au-dessus du plafond supposé (361) : si refusé, on a la réponse
  const haut = await essai(601);
  console.log('\n=== num_frames=601 (25,0 s) ===');
  console.log('statut :', haut.statut);
  console.log('corps  :', haut.corps || haut.erreur);
  // 2. seulement si 601 est ACCEPTÉ : on confirme la limite basse
  if (haut.statut && haut.statut < 300) {
    const bas = await essai(361);
    console.log('\n=== num_frames=361 (15,0 s) ===');
    console.log('statut :', bas.statut);
    console.log('corps  :', bas.corps || bas.erreur);
  } else {
    console.log('\n(601 refusé → aucune génération lancée, quota préservé)');
  }
})();
