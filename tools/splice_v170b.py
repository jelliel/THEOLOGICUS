#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Remplace le module v170 par la version 2 : onglets Citations / Doctrines."""
import io, re, sys

HTML = r'C:\tmp\theoverify\THEOLOGICUS.html'

MODULE = r'''<script id="v170-ta-sujets">
/* ═══ v170/v173 — rubrique SUJETS & DOCTRINES
   Onglet « Citations » : toutes les citations de traditionapostolique.fr
   classées par sujet (tradition/ta_sujets.json).
   Onglet « Doctrines » : la base de doctrines de historicalchristian.faith
   (tradition/doctrines.json) — question, timeline de témoins (père, année,
   position), arguments pour/contre — avec boutons 🌐 FR (traduction
   LibreTranslate partagée avec le panneau des Pères, cache v171). ═══ */
(function(){
  'use strict';
  if (window.__theoV170) return;
  window.__theoV170 = true;

  var DATA = null, DDATA = null, LOADING = false, VIEW = 'q';

  var style = document.createElement('style');
  style.textContent =
    '#v170-sujets{position:fixed;inset:0;z-index:130000;display:none;align-items:center;justify-content:center;background:rgba(2,6,12,.62);backdrop-filter:blur(4px)}' +
    '#v170-sujets.open{display:flex}' +
    '#v170-box{width:min(760px,94vw);max-height:86vh;display:flex;flex-direction:column;background:var(--bg-card,#0d1626);border:1px solid rgba(79,142,247,.45);border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden}' +
    '#v170-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(79,142,247,.25);color:#d6e4ff;font-weight:800;letter-spacing:.4px;font-size:14px}' +
    '#v170-close{background:none;border:none;color:#8fa8d8;font-size:15px;cursor:pointer;padding:2px 6px}' +
    '#v170-close:hover{color:#fff}' +
    '#v170-bar{padding:10px 16px 0}' +
    '#v170-tabs{display:flex;gap:6px;margin-bottom:8px}' +
    '#v170-tabs button{flex:1;background:rgba(12,20,36,.7);color:#8fa8d8;border:1px solid rgba(79,142,247,.25);border-radius:8px;padding:7px 6px;font:700 11px Consolas,monospace;letter-spacing:.6px;cursor:pointer}' +
    '#v170-tabs button.on{color:#bfd4ff;border-color:#4f8ef7;background:rgba(28,58,120,.55)}' +
    '#v170-q{width:100%;box-sizing:border-box;background:rgba(10,16,28,.9);color:#eaf4ff;border:1px solid rgba(79,142,247,.35);border-radius:8px;padding:8px 10px;font:12px Consolas,monospace}' +
    '#v170-status{padding:6px 16px 0;font-size:11px;opacity:.65;color:#d6e4ff;min-height:16px}' +
    '#v170-body{overflow:auto;padding:6px 12px 16px}' +
    '.v170-top{border:1px solid rgba(79,142,247,.18);border-radius:10px;margin:8px 4px;background:rgba(12,20,36,.6)}' +
    '.v170-top>summary{cursor:pointer;padding:9px 12px;font-weight:700;color:#bfd4ff;font-size:13px;list-style:none}' +
    '.v170-top>summary::-webkit-details-marker{display:none}' +
    '.v170-top[open]>summary{border-bottom:1px solid rgba(79,142,247,.18)}' +
    '.v170-n{opacity:.55;font-weight:400;font-size:11px}' +
    '.v170-item{padding:10px 14px;border-bottom:1px dashed rgba(79,142,247,.12)}' +
    '.v170-item:last-child{border-bottom:none}' +
    '.v170-doc-q{font-style:italic;opacity:.85;padding:8px 14px 4px;font-size:12.5px;color:#d6e4ff}' +
    '.v170-doc-h{padding:8px 14px 2px;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:#f5c542}' +
    '.v170-wit{padding:8px 14px;border-bottom:1px dashed rgba(79,142,247,.10)}' +
    '.v170-wit>b{color:#bfd4ff;font-size:12.5px}' +
    '.v170-arg{padding:8px 14px;border-bottom:1px dashed rgba(79,142,247,.10)}' +
    '.v170-arg>b{color:#9fe3b8;font-size:12.5px}';
  document.head.appendChild(style);

  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s){ try { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); } catch(e){ return String(s||'').toLowerCase(); } }

  function ensurePanel(){
    var p = document.getElementById('v170-sujets');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'v170-sujets';
    p.innerHTML = '<div id="v170-box">'
      + '<div id="v170-head"><span id="v170-title">📚 Sujets &amp; Doctrines — les témoins anciens</span>'
      + '<button id="v170-close" aria-label="Fermer">✕</button></div>'
      + '<div id="v170-bar"><div id="v170-tabs">'
      + '<button id="v170-tab-q" class="on">CITATIONS DES PÈRES</button>'
      + '<button id="v170-tab-d">DOCTRINES (historicalchristian.faith)</button>'
      + '</div><input id="v170-q" placeholder="Filtrer par sujet, auteur, doctrine, témoin ou mot du texte…" /></div>'
      + '<div id="v170-status"></div>'
      + '<div id="v170-body"></div></div>';
    document.body.appendChild(p);
    p.addEventListener('click', function(e){ if (e.target === p) p.classList.remove('open'); });
    p.querySelector('#v170-close').addEventListener('click', function(){ p.classList.remove('open'); });
    document.getElementById('v170-q').addEventListener('input', render);
    document.getElementById('v170-tab-q').addEventListener('click', function(){ setView('q'); });
    document.getElementById('v170-tab-d').addEventListener('click', function(){ setView('d'); });
    /* v173 — boutons 🌐 FR de la vue Doctrines : traduction partagée v167 */
    document.getElementById('v170-body').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.v167-tr') : null;
      if (!b || b.dataset.busy) return;
      ev.preventDefault();
      var sn = b.dataset.sn || '';
      if (typeof window.__v167Translate === 'function') {
        window.__v167Translate(sn, b, document.getElementById('v170-status'));
      }
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && p.classList.contains('open')) p.classList.remove('open');
    });
    return p;
  }

  function setView(v){
    VIEW = v;
    document.getElementById('v170-tab-q').classList.toggle('on', v === 'q');
    document.getElementById('v170-tab-d').classList.toggle('on', v === 'd');
    var ph = v === 'q' ? 'Filtrer par sujet, auteur, œuvre ou mot du texte…'
                       : 'Filtrer par doctrine, témoin, argument ou mot du texte…';
    document.getElementById('v170-q').placeholder = ph;
    document.getElementById('v170-q').value = '';
    render();
  }

  /* ── vue Citations ── */
  function renderQ(q){
    var body = document.getElementById('v170-body');
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

  /* ── vue Doctrines (v173) ── */
  function renderD(q){
    var body = document.getElementById('v170-body');
    var trGet = window.__v167TrGet, frDiv = window.__v167FrDiv;
    var h = '', shown = 0, shownW = 0, shownA = 0;
    DDATA.ds.forEach(function(d){
      var hay = norm(d.t + ' ' + d.q + ' ' + d.s);
      var tl = d.tl, ar = d.ar;
      if (q) {
        hay += ' ' + norm(d.tl.map(function(x){ return x.w + ' ' + x.t; }).join(' '));
        hay += ' ' + norm(d.ar.map(function(x){ return x.q + ' ' + x.c; }).join(' '));
      }
      if (q && hay.indexOf(q) < 0) return;
      shown++; shownW += tl.length; shownA += ar.length;
      h += '<details class="v170-top"' + (q ? ' open' : '') + '><summary>' + esc(d.t)
         + ' <span class="v170-n">(' + tl.length + ' témoins · ' + ar.length + ' arguments)</span></summary>';
      if (d.q) h += '<div class="v170-doc-q">' + esc(d.q) + '</div>';
      if (tl.length) {
        h += '<div class="v170-doc-h">Timeline des témoins</div>';
        tl.forEach(function(x){
          h += '<div class="v170-wit"><b>' + esc(x.w) + '</b>'
             + '<div class="v167-sn" style="margin-top:4px">' + esc(x.t) + '</div>'
             + (trGet && trGet(x.t) ? frDiv(trGet(x.t)) : '<button type="button" class="v167-tr" data-sn="' + esc(x.t) + '">🌐 FR</button>')
             + '</div>';
        });
      }
      if (ar.length) {
        h += '<div class="v170-doc-h">Arguments pour &amp; contre</div>';
        ar.forEach(function(x){
          h += '<div class="v170-arg"><b>' + esc(x.q) + '</b>'
             + '<div class="v167-sn" style="margin-top:4px">' + esc(x.c) + '</div>'
             + (trGet && trGet(x.c) ? frDiv(trGet(x.c)) : '<button type="button" class="v167-tr" data-sn="' + esc(x.c) + '">🌐 FR</button>')
             + (x.a ? '<div class="v167-sn" style="opacity:.8;margin-top:6px">⚖ ' + esc(x.a) + '</div>' : '')
             + (x.u ? '<a class="v167-lk" href="' + esc(x.u) + '" target="_blank" rel="noopener">historicalchristian.faith ↗</a>' : '')
             + '</div>';
        });
      }
      h += '</details>';
    });
    body.innerHTML = h || '<div style="opacity:.6;padding:16px">Aucune doctrine ne correspond au filtre.</div>';
    var st = document.getElementById('v170-status');
    if (st) st.textContent = shown ? shown + ' doctrines — ' + shownW + ' témoins, ' + shownA + ' arguments' : '';
  }

  function render(){
    var body = document.getElementById('v170-body');
    if (!body) return;
    if (VIEW === 'q' && !DATA){
      body.innerHTML = '<div style="opacity:.6;padding:16px">chargement du corpus…</div>';
      return;
    }
    if (VIEW === 'd' && !DDATA){
      body.innerHTML = '<div style="opacity:.6;padding:16px">chargement des doctrines…</div>';
      return;
    }
    var q = norm((document.getElementById('v170-q') || {}).value || '').trim();
    if (VIEW === 'q') renderQ(q); else renderD(q);
  }

  function load(){
    LOADING = true;
    if (VIEW === 'q' && !DATA){
      fetch('tradition/ta_sujets.json').then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){ DATA = (j && j.topics && j.topics.length) ? j : false; LOADING = false; render(); })
        .catch(function(){ DATA = false; LOADING = false; render();
          var st = document.getElementById('v170-status');
          if (st) st.textContent = '⚠ Corpus indisponible (tradition/ta_sujets.json introuvable).'; });
    } else if (VIEW === 'd' && !DDATA){
      fetch('tradition/doctrines.json').then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){ DDATA = (j && j.ds && j.ds.length) ? j : false; LOADING = false; render(); })
        .catch(function(){ DDATA = false; LOADING = false; render();
          var st = document.getElementById('v170-status');
          if (st) st.textContent = '⚠ Corpus des doctrines indisponible (tradition/doctrines.json introuvable).'; });
    } else {
      LOADING = false;
    }
  }

  function openPanel(){
    var p = ensurePanel();
    p.classList.add('open');
    load();
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
</script>'''

with io.open(HTML, encoding='utf-8') as f:
    html = f.read()

i = html.find('<script id="v170-ta-sujets">')
assert i > 0, 'module v170 introuvable'
j = html.find('</script>', i)
assert j > 0
html = html[:i] + MODULE + html[j + len('</script>'):]

with io.open(HTML, 'w', encoding='utf-8', newline='') as f:
    f.write(html)
print('module v170 remplacé (v2 avec onglets) —', html.count('__theoV170'), 'occurrences')
