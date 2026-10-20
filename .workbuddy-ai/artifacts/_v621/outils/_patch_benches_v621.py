# -*- coding: utf-8 -*-
"""Bancs antérieurs au cadre traversant (v621) :
- v618 : le CLIC sur le cadre passe par son BORD (le centre est désormais
  traversant, il sélectionne le texte) ;
- v620 : fermer l'infobulle précédente avant chaque survol (elle peut couvrir
  le cadre et intercepter la souris)."""
import io

# ── v618 ────────────────────────────────────────────────────────
p1 = ".workbuddy-ai/artifacts/_v618/verify_v618_annoter_encadre.js"
s = io.open(p1, encoding="utf-8", newline="").read()
old = """  if (rect) {
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();"""
assert s.count(old) == 1, s.count(old)
new = """  /* v621 — le centre du cadre est TRAVERSANT : on saisit le cadre par son
     bord gauche (le centre sert désormais à sélectionner le texte). */
  const bord = await page.evaluate(() => {
    const e = document.querySelector('[data-fig-id="fg-banc"] .fb-edge[data-bord="l"]');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (bord) {
    const cx = bord.x, cy = bord.y;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();"""
s = s.replace(old, new)
io.open(p1, "w", encoding="utf-8", newline="").write(s)

# ── v620 ────────────────────────────────────────────────────────
p2 = ".workbuddy-ai/artifacts/_v620/verify_v620_survol_geometrie.js"
t = io.open(p2, encoding="utf-8", newline="").read()
old2 = """    if (!r) return null;
    await page.mouse.move(5, 5);
    await page.waitForTimeout(120);"""
assert t.count(old2) == 1, t.count(old2)
new2 = """    if (!r) return null;
    /* l'infobulle précédente est un panneau FIXE : elle peut couvrir le cadre
       et intercepter la souris (le survol ne l'atteindrait jamais). */
    await page.evaluate(() => { const tp = document.getElementById('atc-tip'); if (tp) tp.remove(); });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(160);"""
t = t.replace(old2, new2)
io.open(p2, "w", encoding="utf-8", newline="").write(t)
print("ok")
