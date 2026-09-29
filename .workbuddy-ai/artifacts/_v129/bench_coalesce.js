// Bench deterministe : prouve que le coalescing rAF reduit le nombre de
// mutations de style (-> reflow) d'un facteur ~ (evenements / images).
// Modele : on envoie N evenements `mousemove` repartis sur F images.
//   - OLD : chaque evenement ecrit le style -> N mutations (N reflow).
//   - NEW : chaque evenement ne fait qu'empiler + 1 rAF ; 1 mutation par image.

function makeRaf() {
  let q = [];
  return {
    raf(cb) { q.push(cb); return q.length; },
    tick() { const cur = q; q = []; cur.forEach(cb => cb()); },
    pending() { return q.length; }
  };
}

// OLD : style ecrit synchrone a chaque evenement
function oldDrag() {
  let batches = 0;
  function mv() { batches++; /* fb.style.width=... etc */ }
  return {
    on(ev) { mv(ev); },
    end() {},
    batches: () => batches
  };
}

// NEW : coalescing rAF (copie du handler v129)
function newDrag(raf) {
  let batches = 0, _mvEv = null, _mvRaf = 0;
  const sx = 0, sy = 0, ol = 0, ot = 0, ow = 0, oh = 0;
  function apply() {
    _mvRaf = 0; const ev = _mvEv; _mvEv = null;
    if (!ev) return;
    batches++; /* fb.style.width=... etc */
  }
  function mv(ev) { _mvEv = ev; if (!_mvRaf) _mvRaf = raf.raf(apply); }
  function end() { if (_mvRaf) { raf && null; apply(); } }
  return {
    on(ev) { mv(ev); },
    end,
    batches: () => batches,
    rafPending: () => raf.pending()
  };
}

function run(label, N, F) {
  const perFrame = Math.ceil(N / F);
  // OLD
  const old = oldDrag();
  for (let i = 0; i < N; i++) old.on({ clientX: i, clientY: i });
  // NEW (raf partage, on "tick" une image apres chaque paquet d'evenements)
  const raf = makeRaf();
  const neu = newDrag(raf);
  for (let i = 0; i < N; i++) {
    neu.on({ clientX: i, clientY: i });
    if ((i + 1) % perFrame === 0) raf.tick(); // une image se vide
  }
  if (raf.pending()) raf.tick(); // vide ce qui reste
  const bo = old.batches(), bn = neu.batches();
  console.log(
    `${label}: N=${N} evenements / F=${F} images -> ` +
    `OLD mutations=${bo}  NEW mutations=${bn}  ` +
    `reduction=${(bo / Math.max(bn, 1)).toFixed(1)}x`
  );
  return { bo, bn };
}

console.log('=== Coalescing rAF (v129) vs synchrone (avant) ===');
run('Burst 120Hz sur 1 image', 120, 1);
run('Souris 120Hz sur 8 images', 120, 8);
run('Tactile 60Hz sur 4 images', 60, 4);
run('Gros drag 600 evenements / 30 images', 600, 30);
