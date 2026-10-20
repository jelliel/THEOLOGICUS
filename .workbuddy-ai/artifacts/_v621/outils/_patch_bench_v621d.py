# -*- coding: utf-8 -*-
"""Banc v621 : poser le cadre DANS la zone visible (`.message-content` rogne)
et nettoyer sélection/barre d'outils avant le test de survol."""
import io

p = ".workbuddy-ai/artifacts/_v621/verify_v621_cadre_traversant.js"
s = io.open(p, encoding="utf-8", newline="").read()

old = """      x: Math.round(rt.left - rb.left - 14), y: Math.round(rt.top - rb.top - 10),
      w: Math.round(rt.width + 28), h: Math.round(rt.height + 20),"""
assert s.count(old) == 1
new = """      /* DANS la zone visible : `.message-content{overflow:hidden}` rogne tout
         ce qui dépasse, et un bord rogné n'est plus hit-testé. */
      x: 4, y: 2, w: Math.round(rb.width - 12), h: 90,"""
s = s.replace(old, new)

old2 = """  await page.evaluate(() => {
    const CONT = state.messages[0].content;"""
assert s.count(old2) == 1
new2 = """  /* nettoyer sélection + barre d'outils avant de mesurer un survol */
  await page.mouse.click(24, 520);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    document.querySelectorAll('.fig-tools').forEach(function (e) { e.remove(); });
    const t = document.getElementById('atc-tip'); if (t) t.remove();
  });
  await page.evaluate(() => {
    const CONT = state.messages[0].content;"""
s = s.replace(old2, new2)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
