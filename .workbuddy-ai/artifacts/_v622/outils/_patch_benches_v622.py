# -*- coding: utf-8 -*-
"""Bancs v619/v620 : le contrat a changé (v622) — le survol d'un CADRE
n'affiche plus la liste des commentaires qu'il recouvre ; chaque commentaire
s'affiche au survol de SON surlignage, et le cadre n'affiche que sa note."""
import io

# ── v619 ────────────────────────────────────────────────────────
p1 = ".workbuddy-ai/artifacts/_v619/verify_v619_survol_encadre.js"
s = io.open(p1, encoding="utf-8", newline="").read()

# helper : survol d'un SURSIGNAGE (plus du cadre)
old = """  async function lireTip() {"""
assert s.count(old) == 1
s = s.replace(old, """  async function survolerTexte(hlId) {
    const r = await page.evaluate((id) => {
      const el = document.querySelector('.atc-hl[data-hl-id="' + id + '"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, hlId);
    if (!r) return null;
    await page.evaluate(() => { const t = document.getElementById('atc-tip'); if (t) t.remove(); });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(180);
    await page.mouse.move(r.x, r.y);
    await page.waitForTimeout(380);
    return r;
  }
  async function lireTip() {""")

old1 = """  section("1. Survol d'un encadré qui recouvre un commentaire");
  await poser(CADRE_A);
  await survoler('[data-fig-id="fg-a"]');
  const t1 = await lireTip();
  ok("une infobulle apparaît", t1.present === true, String(t1.present));
  ok("elle est VISIBLE (surface réelle)", t1.visible === true, JSON.stringify(t1.visible));
  ok("elle contient le commentaire de l'annotation", /Commentaire sur Alpha/.test(String(t1.texte)),
     String(t1.texte).slice(0, 120));
  ok("elle rappelle le passage annoté", /Alpha/.test(String(t1.texte)), String(t1.texte).slice(0, 80));"""
assert s.count(old1) == 1
new1 = """  section("1. Survol du COMMENTAIRE : sa fiche, et rien d'autre");
  await poser(CADRE_A);
  await survolerTexte('hl-1');
  const t1 = await lireTip();
  ok("une infobulle apparaît", t1.present === true, String(t1.present));
  ok("elle est VISIBLE (surface réelle)", t1.visible === true, JSON.stringify(t1.visible));
  ok("elle contient le commentaire de l'annotation", /Commentaire sur Alpha/.test(String(t1.texte)),
     String(t1.texte).slice(0, 120));
  ok("elle rappelle le passage annoté", /Alpha/.test(String(t1.texte)), String(t1.texte).slice(0, 80));
  ok("elle ne liste PAS l'autre commentaire", !/Commentaire sur beta/.test(String(t1.texte)),
     String(t1.texte).slice(0, 120));"""
s = s.replace(old1, new1)

old3 = """  section("3. Un encadré qui porte une NOTE (v618) l'affiche au survol");
  await poser(CADRE_C);
  await survoler('[data-fig-id="fg-c"]');
  const t3 = await lireTip();
  ok("la note du cadre apparaît", /Note propre au cadre C/.test(String(t3.texte)), String(t3.texte).slice(0, 120));
  ok("le commentaire de l'annotation « beta » y figure aussi",
     /Commentaire sur beta/.test(String(t3.texte)), String(t3.texte).slice(0, 140));"""
assert s.count(old3) == 1
new3 = """  section("3. Le cadre avec note : la NOTE au survol du cadre, le COMMENTAIRE au survol du mot");
  await poser(CADRE_C);
  await survoler('[data-fig-id="fg-c"]');
  const t3 = await lireTip();
  ok("la note du cadre apparaît", /Note propre au cadre C/.test(String(t3.texte)), String(t3.texte).slice(0, 120));
  ok("aucun commentaire n'est listé sous la note (v622)",
     !/Commentaire sur beta/.test(String(t3.texte)), String(t3.texte).slice(0, 140));
  await survolerTexte('hl-2');
  const t3b = await lireTip();
  ok("le commentaire de « beta » s'affiche sur SON survol",
     /Commentaire sur beta/.test(String(t3b.texte)), String(t3b.texte).slice(0, 120));
  ok("la note du cadre n'y figure pas", !/Note propre au cadre C/.test(String(t3b.texte)),
     String(t3b.texte).slice(0, 120));"""
s = s.replace(old3, new3)
io.open(p1, "w", encoding="utf-8", newline="").write(s)

# ── v620 ────────────────────────────────────────────────────────
p2 = ".workbuddy-ai/artifacts/_v620/verify_v620_survol_geometrie.js"
t = io.open(p2, encoding="utf-8", newline="").read()

olda = """  section("1. Survol du cadre SANS ancre -> le commentaire s'affiche");
  await survoler('[data-fig-id="fg-sans-ancre"]');
  const t1 = await lireTip();
  ok("une infobulle apparaît", t1.present === true, String(t1.present));
  ok("elle est visible", t1.visible === true, String(t1.visible));
  ok("elle contient le commentaire recouvert", /Commentaire sur la hiérarchie/.test(String(t1.texte)),
     String(t1.texte).slice(0, 120));"""
assert t.count(olda) == 1
newa = """  section("1. Le commentaire s'affiche au survol de SON MOT, même dans un cadre sans ancre");
  await survolerTexte('hl-v620');
  const t1 = await lireTip();
  ok("une infobulle apparaît", t1.present === true, String(t1.present));
  ok("elle est visible", t1.visible === true, String(t1.visible));
  ok("elle contient le commentaire recouvert", /Commentaire sur la hiérarchie/.test(String(t1.texte)),
     String(t1.texte).slice(0, 120));
  /* v622 : le cadre, lui, ne liste PLUS les commentaires qu'il recouvre. */
  await survoler('[data-fig-id="fg-sans-ancre"]');
  const t1b = await lireTip();
  ok("le survol du CADRE ne liste aucun commentaire", t1b.present === false,
     t1b.present ? String(t1b.texte).slice(0, 90) : "(rien)");"""
t = t.replace(olda, newa)

oldb = """  section("4. Note du cadre + commentaire recouvert : les deux");"""
assert t.count(oldb) == 1
newb = """  section("4. Note du cadre (au survol du cadre) et commentaire (au survol du mot)");"""
t = t.replace(oldb, newb)

oldc = """  await survoler('[data-fig-id="fg-avec-ancre"]');
  const t4 = await lireTip();
  ok("le commentaire y est", /Commentaire sur la hiérarchie/.test(String(t4.texte)), String(t4.texte).slice(0, 110));
  ok("la note du cadre y est aussi", /Note propre au cadre/.test(String(t4.texte)), String(t4.texte).slice(0, 140));"""
assert t.count(oldc) == 1
newc = """  await survoler('[data-fig-id="fg-avec-ancre"]');
  const t4 = await lireTip();
  ok("la note du cadre s'affiche au survol du cadre", /Note propre au cadre/.test(String(t4.texte)),
     String(t4.texte).slice(0, 110));
  ok("le commentaire n'y est PAS (v622)", !/Commentaire sur la hiérarchie/.test(String(t4.texte)),
     String(t4.texte).slice(0, 140));
  await survolerTexte('hl-v620');
  const t5 = await lireTip();
  ok("le commentaire s'affiche au survol du mot", /Commentaire sur la hiérarchie/.test(String(t5.texte)),
     String(t5.texte).slice(0, 110));"""
t = t.replace(oldc, newc)

# helper survolerTexte dans v620
oldh = """  async function lireTip() {"""
assert t.count(oldh) == 1
t = t.replace(oldh, """  async function survolerTexte(hlId) {
    const r = await page.evaluate((id) => {
      const el = document.querySelector('.atc-hl[data-hl-id="' + id + '"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, hlId);
    if (!r) return null;
    await page.evaluate(() => { const tp = document.getElementById('atc-tip'); if (tp) tp.remove(); });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(180);
    await page.mouse.move(r.x, r.y);
    await page.waitForTimeout(380);
    return r;
  }
  async function lireTip() {""")
io.open(p2, "w", encoding="utf-8", newline="").write(t)
print("ok")
