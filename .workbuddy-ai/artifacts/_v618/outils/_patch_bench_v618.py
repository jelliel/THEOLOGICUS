# -*- coding: utf-8 -*-
"""Banc v618 : attendre applyShapes après un re-rendu, et prouver qu'un CLIC
ne retire pas l'ancre du cadre (défaut trouvé pendant la rédaction du banc)."""
import io

p = ".workbuddy-ai/artifacts/_v618/verify_v618_annoter_encadre.js"
s = io.open(p, encoding="utf-8", newline="").read()

# 1) re-rendu : applyShapes est asynchrone (observer à 60 ms)
old = """  const r6 = await page.evaluate((ts) => {
    if (typeof renderMessages === 'function') renderMessages();
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    const msg = state.messages.find(m => m.ts === ts);"""
assert s.count(old) == 1
new = """  await page.evaluate(() => { if (typeof renderMessages === 'function') renderMessages(); });
  /* applyShapes est déclenché par l'observer (~60 ms) : lire le DOM tout de
     suite donnerait un faux négatif. */
  await page.waitForTimeout(400);
  const r6 = await page.evaluate((ts) => {
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    const msg = state.messages.find(m => m.ts === ts);"""
s = s.replace(old, new)

# 2) nouveau contrôle : le clic sur le cadre préserve l'ancre
anc = """  section("2. 💬 ouvre un panneau VISIBLE et enregistre la note");"""
assert s.count(anc) == 1
s = s.replace(anc, """  section("1b. Un CLIC sur le cadre ne détruit pas son ancre texte");
  const rAnc = await page.evaluate((ts) => {
    const f = state.messages.find(m => m.ts === ts).shapes[0];
    return { ancre: !!f.ancre };
  }, TS);
  ok("l'ancre survit au clic qui ouvre la barre d'outils", rAnc.ancre === true, String(rAnc.ancre));

""" + anc)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
