# -*- coding: utf-8 -*-
"""Banc v619 : un cadre À LA FOIS (sinon trois cadres sur la même ligne se
recouvrent après ré-ancrage et le survol tombe sur le dernier)."""
import io

p = ".workbuddy-ai/artifacts/_v619/verify_v619_survol_encadre.js"
s = io.open(p, encoding="utf-8", newline="").read()

old_start = "    state.messages[0].shapes = [\n      /* cadre A"
i = s.index(old_start)
j = s.index("    if (window.__applyShapes) window.__applyShapes();", i)
s = s[:i] + "    /* Un seul cadre à la fois : trois cadres sur la MÊME ligne se\n" \
            "       recouvrent après ré-ancrage (le survol tomberait sur le dernier). */\n" \
            "    state.messages[0].shapes = [];\n" + s[j:]

# helper de pose
anc = "  async function survoler(sel) {"
assert s.count(anc) == 1
s = s.replace(anc, """  async function poser(f) {
    await page.evaluate((o) => {
      state.messages[0].shapes = [o.f];
      document.querySelectorAll('.atc-figbox').forEach(function (e) { e.remove(); });
      if (window.__applyShapes) window.__applyShapes();
    }, { f: f });
    await page.waitForTimeout(250);
  }
  const CADRE_A = { id: 'fg-a', x: 6, y: 2, w: 90, h: 34, shape: 'Rectangle', color: '#4f8ef7',
    weight: 1.4, text: '', svg: '<rect/>', ancre: { start: 0, end: 5, texte: 'Alpha' } };
  const CADRE_B = { id: 'fg-b', x: 6, y: 44, w: 110, h: 34, shape: 'Rectangle', color: '#ff8a80',
    weight: 1.4, text: '', svg: '<rect/>', ancre: { start: 11, end: 16, texte: 'gamma' } };
  const CADRE_C = { id: 'fg-c', x: 6, y: 86, w: 110, h: 34, shape: 'Rectangle', color: '#ffd54f',
    weight: 1.4, text: '', svg: '<rect/>', note: 'Note propre au cadre C.',
    ancre: { start: 6, end: 10, texte: 'beta' } };

""" + anc)

# tests : poser le bon cadre avant chaque survol
s = s.replace("""  section("1. Survol d'un encadré qui recouvre un commentaire");
  await survoler('[data-fig-id="fg-a"]');""",
"""  section("1. Survol d'un encadré qui recouvre un commentaire");
  await poser(CADRE_A);
  await survoler('[data-fig-id="fg-a"]');""")

s = s.replace("""  section("3. Un encadré qui porte une NOTE (v618) l'affiche au survol");
  await survoler('[data-fig-id="fg-c"]');""",
"""  section("3. Un encadré qui porte une NOTE (v618) l'affiche au survol");
  await poser(CADRE_C);
  await survoler('[data-fig-id="fg-c"]');""")

s = s.replace("""  section("4. Contrôle NÉGATIF : cadre sans annotation chevauchante");
  await survoler('[data-fig-id="fg-b"]');""",
"""  section("4. Contrôle NÉGATIF : cadre sans annotation chevauchante");
  await poser(CADRE_B);
  await survoler('[data-fig-id="fg-b"]');""")

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
