# -*- coding: utf-8 -*-
"""Banc v621 : neutraliser les surcouches de démarrage (porte + assistant de
configuration) et poser le cadre AUTOUR du texte visé, pas à l'aveugle."""
import io

p = ".workbuddy-ai/artifacts/_v621/verify_v621_cadre_traversant.js"
s = io.open(p, encoding="utf-8", newline="").read()

old = """  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const b = Array.prototype.find.call(document.querySelectorAll('button'), x => /UTILISER SANS CL/i.test(x.textContent || ''));
    if (b) b.click();
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(300);"""
assert s.count(old) == 1
new = """  /* Deux surcouches de démarrage couvrent l'app (porte d'accès z 999999,
     assistant de configuration z 2000). On les neutralise par CLASSE + style
     inline !important : un clic sur un bouton dépend de l'étape affichée. */
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.setProperty('display', 'none', 'important'); }
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(400);"""
s = s.replace(old, new)

old2 = """    const rb = box.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#4f8ef7', weight: 1.4,
      text: '', svg: '<rect/>',
      x: Math.round(rb.width * 0.05), y: 0, w: Math.round(rb.width * 0.9), h: 70,
      note: 'Note du cadre.' }];"""
assert s.count(old2) == 1
new2 = """    const rb = box.getBoundingClientRect();
    /* Le cadre doit VRAIMENT entourer le texte : on le cale sur son rectangle
       mesuré (le poser « au jugé » le laissait à côté — faux négatif). */
    const w0 = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const n0 = w0.nextNode();
    const rg0 = document.createRange();
    rg0.setStart(n0, 0); rg0.setEnd(n0, Math.min(40, n0.nodeValue.length));
    const rt = rg0.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#4f8ef7', weight: 1.4,
      text: '', svg: '<rect/>',
      x: Math.round(rt.left - rb.left - 14), y: Math.round(rt.top - rb.top - 10),
      w: Math.round(rt.width + 28), h: Math.round(rt.height + 20),
      note: 'Note du cadre.' }];"""
s = s.replace(old2, new2)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
