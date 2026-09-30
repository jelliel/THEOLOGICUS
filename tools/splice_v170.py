#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Splice du module v170 (rubrique SUJETS) dans THEOLOGICUS.html."""
import io, sys

HTML = r'C:\tmp\theoverify\THEOLOGICUS.html'

MODULE = r'''
<script id="v170-ta-sujets">
/* ═══ v170 — rubrique SUJETS : toutes les citations de traditionapostolique.fr
   classées par sujet, consultables hors-ligne (tradition/ta_sujets.json).
   Bouton 📚 SUJETS de la topbar. Indépendant du panneau de verset (v167) :
   les sujets que le site cite SANS référence de verset (papauté, hiérarchie,
   succession apostolique…) ne sont accessibles QUE par ici. ═══ */
(function(){
  'use strict';
  if (window.__theoV170) return;
  window.__theoV170 = true;

  var DATA = null, LOADING = false;

  var style = document.createElement('style');
  style.textContent =
    '#v170-sujets{position:fixed;inset:0;z-index:130000;display:none;align-items:center;justify-content:center;background:rgba(2,6,12,.62);backdrop-filter:blur(4px)}' +
    '#v170-sujets.open{display:flex}' +
    '#v170-box{width:min(760px,94vw);max-height:86vh;display:flex;flex-direction:column;background:var(--bg-card,#0d1626);border:1px solid rgba(79,142,247,.45);border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden}' +
    '#v170-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(79,142,247,.25);color:#d6e4ff;font-weight:800;letter-spacing:.4px;font-size:14px}' +
    '#v170-close{background:none;border:none;color:#8fa8d8;font-size:15px;cursor:pointer;padding:2px 6px}' +
    '#v170-close:hover{color:#fff}' +
    '#v170-bar{padding:10px 16px 0}' +
    '#v170-q{width:100%;box-sizing:border-box;background:rgba(10,16,28,.9);color:#eaf4ff;border:1px solid rgba(79,142,247,.35);border-radius:8px;padding:8px 10px;font:12px Consolas,monospace}' +
    '#v170-status{padding:6px 16px 0;font-size:11px;opacity:.65;color:#d6e4ff;min-height:16px}' +
    '#v170-body{overflow:auto;padding:6px 12px 16px}' +
    '.v170-top{border:1px solid rgba(79,142,247,.18);border-radius:10px;margin:8px 4px;background:rgba(12,20,36,.6)}' +
    '.v170-top>summary{cursor:pointer;padding:9px 12px;font-weight:700;color:#bfd4ff;font-size:13px;list-style:none}' +
    '.v170-top>summary::-webkit-details-marker{display:none}' +
    '.v170-top[open]>summary{border-bottom:1px solid rgba(79,142,247,.18)}' +
    '.v170-n{opacity:.55;font-weight:400;font-size:11px}' +
    '.v170-item{padding:10px 14px;border-bottom:1px dashed rgba(79,142,247,.12)}' +
    '.v170-item:last-child{border-bottom:none}';
  document.head.appendChild(style);

  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s){ try { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); } catch(e){ return String(s||'').toLowerCase(); } }

  function ensurePanel(){
    var p = document.getElementById('v170-sujets');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'v170-sujets';
    p.innerHTML = '<div id="v170-box">'
      + '<div id="v170-head"><span id="v170-title">📚 Tradition apostolique — les Pères par sujet</span>'
      + '<button id="v170-close" aria-label="Fermer">✕</button></div>'
      + '<div id="v170-bar"><input id="v170-q" placeholder="Filtrer par sujet, auteur, œuvre ou mot du texte…" /></div>'
      + '<div id="v170-status"></div>'
      + '<div id="v170-body"></div></div>';
    document.body.appendChild(p);
    p.addEventListener('click', function(e){ if (e.target === p) p.classList.remove('open'); });
    p.querySelector('#v170-close').addEventListener('click', function(){ p.classList.remove('open'); });
    document.getElementById('v170-q').addEventListener('input', render);
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && p.classList.contains('open')) p.classList.remove('open');
    });
    return p;
  }

  function render(){
    var body = document.getElementById('v170-body');
    if (!body) return;
    if (!DATA){
      body.innerHTML = '<div style="opacity:.6;padding:16px">chargement du corpus…</div>';
      return;
    }
    var q = norm((document.getElementById('v170-q') || {}).value || '').trim();
    var h = '', shown = 0, shownQ = 0;
    DATA.topics.forEach(function(t){
      var hayT = norm(t.t);
      var qs = t.qs.filter(function(x){
        return !q || hayT.indexOf(q) >= 0 || norm(x.a + ' ' + x.w + ' ' + x.q).indexOf(q) >= 0;
      });
      if (!qs.length) return;
      shown++; shownQ += qs.length;
      h += '<details class="v170-top"' + (q ? ' open' : '') + '><summary>' + esc(t.t)
         + ' <span class="v170-n">(' + qs.length + ')</span></summary>';
      qs.forEach(function(x){
        h += '<div class="v170-item"><span class="v167-au">' + esc(x.a) + '</span>'
           + '<span class="v167-ti">— ' + esc(x.w) + (x.ch ? ' · ' + esc(x.ch) : '') + '</span>'
           + '<div class="v167-sn">' + esc(x.q) + '</div>'
           + '<a class="v167-lk" href="' + esc(x.wu || t.su) + '" target="_blank" rel="noopener">traditionapostolique.fr ↗</a></div>';
      });
      h += '</details>';
    });
    body.innerHTML = h || '<div style="opacity:.6;padding:16px">Aucun sujet ne correspond au filtre.</div>';
    var st = document.getElementById('v170-status');
    if (st) st.textContent = shown ? shown + ' sujets — ' + shownQ + ' citations' : '';
  }

  function load(){
    LOADING = true;
    fetch('tradition/ta_sujets.json').then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ DATA = (j && j.topics && j.topics.length) ? j : false; LOADING = false; render(); })
      .catch(function(){ DATA = false; LOADING = false; render();
        var st = document.getElementById('v170-status');
        if (st) st.textContent = '⚠ Corpus indisponible (tradition/ta_sujets.json introuvable).'; });
  }

  function openPanel(){
    var p = ensurePanel();
    p.classList.add('open');
    if (!DATA && !LOADING) load();
    render();
  }

  function boot(){
    var b = document.getElementById('open-ta-sujets');
    if (!b || b.dataset.v170wired) return;
    b.dataset.v170wired = '1';
    b.addEventListener('click', openPanel);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>
'''

with io.open(HTML, encoding='utf-8') as f:
    html = f.read()

if '__theoV170' in html:
    print('v170 déjà présent — rien à faire')
    sys.exit(0)

i = html.rfind('</body>')
assert i > 0, 'pas de </body>'
html = html[:i] + '\n' + MODULE + '\n' + html[i:]

with io.open(HTML, 'w', encoding='utf-8', newline='') as f:
    f.write(html)
print('module v170 splicé —', html.count('__theoV170'), 'occurrences')
