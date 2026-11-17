<script id="v699-genealogie">
/* ═══ v699 : généalogie parchemin interactive dans les schémas ═══
   Quand un schéma parle de la généalogie de Jésus (David + Jésus/Nathan
   + au moins trois repères), la carte est remplacée par la présentation
   parchemin : deux colonnes reliées, pastilles, cartes Salomon / Nathan.
   Le contenu d'origine reste en mémoire : le bouton ARBRE le restitue.
   Tout est en DÉLÉGATION (les cartes sont re-rendues à chaque message).
   Aucun contrôle n'est ajouté à .header-controls (v597/v598). */
(function () {
  'use strict';

  var REPERES = ['David', 'Jesus', 'Nathan', 'Abraham', 'Salomon', 'Joseph', 'Isaac', 'Jacob', 'Marie'];
  function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function estGenealogie(card) {
    if (!card || !card.classList || card.classList.contains('v699-genealogie') || card.__v699Orig) return false;
    var t = norm(card.textContent || '');
    var n = 0;
    for (var i = 0; i < REPERES.length; i++) if (t.indexOf(norm(REPERES[i])) !== -1) n++;
    /* Nathan est aussi un prophète : exiger un repère de lignée évite
       de transformer un schéma doctrinal qui citerait David et Nathan. */
    var ancres = ['salomon','abraham','booz','jesse','isaac','jacob'];
    var a = 0;
    for (var k = 0; k < ancres.length; k++) if (t.indexOf(ancres[k]) !== -1) a++;
    var boxes = card.querySelectorAll('.schema-box').length;
    return t.indexOf('david') !== -1 &&
           (t.indexOf('jesus') !== -1 || t.indexOf('nathan') !== -1) &&
           n >= 4 && a >= 1 && boxes >= 4;
  }

  /* ── données vérifiées (AELF Mt 1,1-17 ; Lc 3,23-38) ──
     « Nom~note~1 » : le 1 marque une figure clé. L'orthographe de la
     capture cible est conservée, les variantes bibliques sont dans
     les fiches. */
  var SECTIONS = [
    { t: '1. D’Adam à Abraham', r: 'Lc 3,23-38', src: 'Luc 3', c: [
      ['Adam','Seth','Énos','Caïnan','Malaléel','Jared','Hénoc','Mathusalem','Lamech','Noé'],
      ['Salé','Héber','Phaleg','Ragau','Sarug','Nachor','Thara','Abraham~~1']
    ]},
    { t: '2. D’Abraham à David', r: 'Mt 1,2-6 ; Lc 3,31-34', src: 'Matthieu 1 · Luc 3', c: [
      ['Isaac','Jacob','Juda~la tribu~1','Pharès~et Zara, de Thamar','Esrom','Aram','Aminadab'],
      ['Naasson','Salmon~épouse : Rahab','Booz~épouse : Ruth','Obed','Jessé','David~roi~1']
    ]}
  ];
  var BRANCHES = [
    { id: 'salomon', t: 'Branche de Salomon', r: 'Matthieu 1,6-16 · lignée légale de Joseph', src: 'Matthieu 1', n: [
      'Salomon~mère : la femme d’Urie~1','Roboam','Abia','Asa','Josaphat','Joram','Ozias','Joatham',
      'Achaz','Ézéchias','Manassé','Amon','Josias','Jékonias~à l’époque de l’exil','Salathiel',
      'Zorobabel','Abioud','Éliakim','Azor','Sadok','Akim','Élioud','Éléazar','Mattane','Jacob',
      'Joseph~époux de Marie~1','Jésus~que l’on appelle Christ~1'
    ]},
    { id: 'nathan', t: 'Branche de Nathan', r: 'Luc 3,23-31 · lignée de Héli, côté Marie selon la Tradition', src: 'Luc 3', n: [
      'Nathan~fils de David~1','Mattatha','Menna','Méléa','Éliakim','Jonam','Joseph','Juda','Syméon',
      'Lévi','Matthate','Jorim','Éliézer','Jésus~ancêtre, v. 29','Er','Elmadam','Kosam','Addi','Melki',
      'Néri','Salathiel','Zorobabel','Résa','Joanane','Joda','Josek','Séméine','Mattathias','Maath',
      'Naggaï','Hesli','Nahoum','Amos','Mattathias','Joseph','Jannaï','Melki','Lévi','Matthate',
      'Éli','Joseph','Jésus~fils de Marie~1'
    ]}
  ];
  var FICHES = {
    'Abraham': ['Patriarche', 'Lc 3,34 · Mt 1,2', 'Ancêtre commun des deux généalogies.'],
    'Isaac': ['Patriarche', 'Mt 1,2 · Lc 3,34', 'Fils d’Abraham, père de Jacob.'],
    'Jacob': ['Patriarche', 'Mt 1,2 · Lc 3,34', 'Père de Juda et de ses frères.'],
    'Juda': ['Fils de Jacob — la tribu', 'Mt 1,2-3', 'De son union avec Thamar naissent Pharès et Zara.'],
    'Pharès': ['Fils de Juda', 'Mt 1,3', 'Jumeau de Zara, né de Thamar.'],
    'David': ['Roi d’Israël', 'Mt 1,6 · Lc 3,31', 'Les deux lignées partent de David, par Salomon et par Nathan.'],
    'Salomon': ['Roi d’Israël', 'Mt 1,6', 'Fils de David et de la femme d’Ourie.'],
    'Nathan': ['Fils de David', 'Lc 3,31', 'Lignée non royale : côté Marie selon la Tradition.'],
    'Booz': ['Ancêtre de David', 'Mt 1,5 · Lc 3,32', 'Fils de Salmon et de Rahab ; époux de Ruth.'],
    'Salmon': ['Ancêtre de David', 'Mt 1,4-5', 'De son union avec Rahab naît Booz.'],
    'Joseph': ['Époux de Marie', 'Mt 1,16 · Lc 3,23', 'Père légal selon Matthieu, père « considéré » selon Luc.'],
    'Jésus': ['Le Christ', 'Mt 1,16 · Lc 3,23', 'Fils de Marie ; les deux évangélistes donnent deux ascendance distinctes.']
  };
  var VARIANTES = {
    'Énos':'Énos (Lc 3,38)', 'Caïnan':'Kaïnam (Lc 3,36/38)', 'Malaléel':'Maléléel (Lc 3,37)',
    'Hénoc':'Hénok (Lc 3,37)', 'Lamech':'Lamek (Lc 3,37)', 'Salé':'Sala (Lc 3,35)',
    'Héber':'Éber (Lc 3,35)', 'Phaleg':'Phalek (Lc 3,35)', 'Ragau':'Ragaou (Lc 3,35)',
    'Sarug':'Sérouk (Lc 3,35)', 'Nachor':'Nakor (Lc 3,34)', 'Obed':'Jobed (Mt 1,5)',
    'Naasson':'Naassone (Mt 1,4)', 'Salmon':'Salmone (Mt 1,4)', 'Nathan':'Natham (Lc 3,31)',
    'Mattatha':'Matthate (Lc 3,24/29)', 'Méléa':'Méléa (Lc 3,31)', 'Jonam':'Jonam (Lc 3,30)',
    'Syméon':'Syméon (Lc 3,30)', 'Séméine':'Séméine (Lc 3,26)', 'Josek':'Josek (Lc 3,26)',
    'Joda':'Joda (Lc 3,26)', 'Joanane':'Joanane (Lc 3,27)', 'Résa':'Résa (Lc 3,27)',
    'Néri':'Néri (Lc 3,27)', 'Kosam':'Kosam (Lc 3,28)', 'Elmadam':'Elmadam (Lc 3,28)',
    'Nahoum':'Nahoum (Lc 3,25)', 'Hesli':'Hesli (Lc 3,25)', 'Naggaï':'Naggaï (Lc 3,25)',
    'Maath':'Maath (Lc 3,26)', 'Mattane':'Mattane (Mt 1,15)', 'Jékonias':'Jékonias (Mt 1,11)',
    'Sadok':'Sadok (Mt 1,14)', 'Akim':'Akim (Mt 1,14)', 'Élioud':'Élioud (Mt 1,14)',
    'Abioud':'Abioud (Mt 1,13)'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function item(x) { var a = String(x).split('~'); return { nom: a[0], note: a[1] || '', cle: a[2] === '1' }; }

  function css() {
    return [
'.schema-card.v699-genealogie{--v699-fond:#faf8f3;--v699-encre:#2b2118;--v699-muted:#6b5b45;--v699-trait:#c9b99b;--v699-violet:#5b3a87;--v699-or:#a9631f;--v699-or-fond:#f7e7cd;--v699-or-bord:#d8aa68;--v699-vert:#256c67;--v699-vert-fond:#dcf0ec;--v699-vert-bord:#8fc9bf;background:var(--v699-fond);color:var(--v699-encre);font-family:Georgia,"Times New Roman",serif}',
'.schema-card.v699-genealogie.schema-night{--v699-fond:#171923;--v699-encre:#ece5d8;--v699-muted:#b0a693;--v699-trait:#4b463c;--v699-violet:#c4a3ff;--v699-or-fond:#3a2c1c;--v699-vert-fond:#18352f;--v699-or-bord:#8a6634;--v699-vert-bord:#4b8a80}',
'.schema-card.v699-genealogie .schema-v699-titre{font-size:19px;font-weight:500;margin:0 0 8px}',
'.schema-card.v699-genealogie .schema-v699-sous{font-size:13px;font-style:italic;color:var(--v699-muted);margin:0 0 12px}',
'.schema-card.v699-genealogie .schema-tools.v699-bar{justify-content:flex-start;flex-wrap:wrap;margin:0 0 14px;padding-bottom:10px}',
'.schema-card.v699-genealogie .v699-search{font-family:inherit;font-size:12px;padding:5px 8px;border:1px solid var(--v699-trait);border-radius:5px;background:var(--v699-fond);color:var(--v699-encre);min-width:150px;outline:none}',
'.schema-card.v699-genealogie .v699-search:focus{border-color:var(--v699-violet)}',
'.schema-card.v699-genealogie button.schema-tool{font-family:inherit;font-size:10px}',
'.schema-card.v699-genealogie button.schema-tool[aria-pressed="true"]{background:var(--v699-encre);color:var(--v699-fond)}',
'.schema-card.v699-genealogie .schema-v699-sec{margin:18px 0 0}',
'.schema-card.v699-genealogie .schema-v699-sec>h3{font-size:16px;font-weight:500;margin:0 0 10px;cursor:pointer;user-select:none}',
'.schema-card.v699-genealogie .schema-v699-sec .ref{font-size:12px;font-style:italic;color:var(--v699-muted);font-weight:400}',
'.schema-card.v699-genealogie .schema-v699-sec.plie .schema-v699-corps{display:none}',
'.schema-card.v699-genealogie .schema-v699-cols{display:grid;grid-template-columns:1fr 1fr;gap:40px}',
'.schema-card.v699-genealogie .schema-v699-lignee{position:relative;padding-left:23px}',
'.schema-card.v699-genealogie .schema-v699-lignee::before{content:"";position:absolute;left:5px;top:10px;bottom:10px;border-left:1px solid var(--v699-trait)}',
'.schema-card.v699-genealogie .schema-v699-pers{position:relative;display:flex;flex-wrap:wrap;gap:6px;padding:3px 5px;margin:0 -5px;border-radius:5px;cursor:pointer;transition:background .15s,opacity .15s}',
'.schema-card.v699-genealogie .schema-v699-point{position:absolute;left:-22px;top:10px;width:9px;height:9px;border-radius:50%;border:1.5px solid var(--v699-trait);background:var(--v699-fond)}',
'.schema-card.v699-genealogie .schema-v699-pers.cle .schema-v699-point{left:-23px;top:9px;width:11px;height:11px;background:var(--v699-violet);border-color:var(--v699-violet)}',
'.schema-card.v699-genealogie .schema-v699-nom{font-size:14px}',
'.schema-card.v699-genealogie .schema-v699-pers.cle .schema-v699-nom{color:var(--v699-violet)}',
'.schema-card.v699-genealogie .schema-v699-note{font-size:12px;font-style:italic;color:var(--v699-muted)}',
'.schema-card.v699-genealogie .schema-v699-pers:hover{background:rgba(91,58,135,.10)}',
'.schema-card.v699-genealogie .schema-v699-pers.dim{opacity:.2}',
'.schema-card.v699-genealogie .schema-v699-pers.trouve{background:rgba(169,99,31,.16);text-decoration:underline;text-underline-offset:3px}',
'.schema-card.v699-genealogie .schema-v699-branches{display:grid;grid-template-columns:1fr 1fr;gap:16px}',
'.schema-card.v699-genealogie .schema-v699-br{border-radius:10px;padding:14px 15px;border:1px solid var(--bord);border-top:4px solid var(--accent)}',
'.schema-card.v699-genealogie .schema-v699-br.salomon{--accent:var(--v699-or);--bord:var(--v699-or-bord);background:var(--v699-or-fond)}',
'.schema-card.v699-genealogie .schema-v699-br.nathan{--accent:var(--v699-vert);--bord:var(--v699-vert-bord);background:var(--v699-vert-fond)}',
'.schema-card.v699-genealogie .schema-v699-br.masque{display:none}',
'.schema-card.v699-genealogie .schema-v699-br h4{font-size:15px;font-weight:500;color:var(--accent);margin:0 0 2px}',
'.schema-card.v699-genealogie .schema-v699-br .ref{font-size:11px;font-style:italic;color:var(--v699-muted);margin:0 0 9px}',
'.schema-card.v699-genealogie .schema-v699-br .schema-v699-lignee{max-height:300px;overflow:auto;scrollbar-width:thin}',
'.schema-card.v699-genealogie .schema-v699-br .schema-v699-lignee::before{border-left-color:var(--bord)}',
'.schema-card.v699-genealogie .schema-v699-fiche{border:1px solid var(--v699-trait);border-left:3px solid var(--v699-violet);border-radius:6px;padding:10px 14px;margin:0 0 14px;background:var(--v699-fond);font-size:13px}',
'.schema-card.v699-genealogie .schema-v699-fiche[hidden]{display:none}',
'.schema-card.v699-genealogie .schema-v699-fiche b{color:var(--v699-violet)}',
'.schema-card.v699-genealogie .schema-v699-fiche button{float:right;border:0;background:transparent;color:var(--v699-muted);font-size:17px;cursor:pointer}',
'.schema-card.v699-genealogie .schema-v699-legende{border-top:1px dashed var(--v699-trait);margin-top:18px;padding-top:9px;font-size:11px;font-style:italic;color:var(--v699-muted);text-align:center}',
'@media(max-width:760px){.schema-card.v699-genealogie .schema-v699-cols,.schema-card.v699-genealogie .schema-v699-branches{grid-template-columns:1fr}}'
    ].join('\n');
  }

  function ligne(liste, src) {
    var h = '<div class="schema-v699-lignee">';
    for (var i = 0; i < liste.length; i++) {
      var it = item(liste[i]);
      h += '<div class="schema-v699-pers' + (it.cle ? ' cle' : '') + '" tabindex="0" role="button"'
         + ' data-nom="' + esc(it.nom) + '" data-src="' + esc(src) + '"'
         + ' data-q="' + esc(norm(it.nom + ' ' + it.note)) + '">'
         + '<span class="schema-v699-point" aria-hidden="true"></span>'
         + '<span class="schema-v699-nom">' + esc(it.nom) + '</span>'
         + (it.note ? '<span class="schema-v699-note">(' + esc(it.note) + ')</span>' : '')
         + '</div>';
    }
    return h + '</div>';
  }

  function rendu() {
    var h = '<div class="schema-v699-titre">Généalogie de Jésus</div>'
          + '<p class="schema-v699-sous">D’Adam à Jésus · les deux lignées de David — présentation interactive</p>'
          + '<div class="schema-tools v699-bar">'
          + '<input class="v699-search" type="search" placeholder="Rechercher un nom…" aria-label="Rechercher un nom">'
          + '<button type="button" class="schema-tool v699-filtre" data-f="all" aria-pressed="true">TOUTES</button>'
          + '<button type="button" class="schema-tool v699-filtre" data-f="salomon" aria-pressed="false">SALOMON</button>'
          + '<button type="button" class="schema-tool v699-filtre" data-f="nathan" aria-pressed="false">NATHAN</button>'
          + '<button type="button" class="schema-tool v699-retour" title="Revenir au schéma d’origine">ARBRE</button>'
          + '<button type="button" class="schema-tool schema-svg" title="Exporter en SVG">SVG</button>'
          + '<button type="button" class="schema-tool schema-zoom" title="Ouvrir en plein écran">ZOOM</button>'
          + '<button type="button" class="schema-tool schema-night" title="Basculer le parchemin en mode nuit">NUIT</button>'
          + '<span class="schema-v699-compte" aria-live="polite"></span>'
          + '</div>'
          + '<div class="schema-v699-fiche" hidden></div><div class="schema-v699-corps">';
    for (var s = 0; s < SECTIONS.length; s++) {
      var sec = SECTIONS[s];
      h += '<section class="schema-v699-sec"><h3>◾ ' + esc(sec.t)
         + ' <span class="ref">(' + esc(sec.r) + ')</span></h3><div class="schema-v699-corps">'
         + '<div class="schema-v699-cols"><div>' + ligne(sec.c[0], sec.src) + '</div><div>'
         + ligne(sec.c[1], sec.src) + '</div></div></div></section>';
    }
    h += '<section class="schema-v699-sec"><h3>◾ 3. De David à Jésus : deux branches</h3><div class="schema-v699-corps"><div class="schema-v699-branches">';
    for (var b = 0; b < BRANCHES.length; b++) {
      var br = BRANCHES[b];
      h += '<article class="schema-v699-br ' + br.id + '" data-br="' + br.id + '">'
         + '<h4>' + esc(br.t) + '</h4><p class="ref">' + esc(br.r) + '</p>'
         + ligne(br.n, br.src) + '</article>';
    }
    h += '</div></div></section><div class="schema-v699-legende">● figure clé · ○ ancêtre · cliquer un nom ouvre sa fiche</div></div>';
    return h;
  }

  function traiter(card) {
    if (!estGenealogie(card)) return false;
    card.__v699Orig = card.innerHTML;
    card.classList.add('v699-genealogie');
    card.setAttribute('data-v699', '1');
    card.innerHTML = rendu();
    majCompte(card);
    return true;
  }
  function rendreArbre(card) {
    if (!card || !card.__v699Orig) return false;
    card.innerHTML = card.__v699Orig;
    card.__v699Orig = null;
    card.classList.remove('v699-genealogie');
    card.removeAttribute('data-v699');
    return true;
  }
  function majCompte(card) {
    var c = card.querySelector('.schema-v699-compte');
    if (!c) return;
    var ps = card.querySelectorAll('.schema-v699-pers');
    var t = card.querySelectorAll('.schema-v699-pers.trouve').length;
    c.textContent = t ? (t + ' trouvé' + (t > 1 ? 's' : '')) : (ps.length + ' noms');
  }
  function fiche(card, el) {
    var p = card.querySelector('.schema-v699-fiche');
    if (!p || !el) return;
    var nom = el.getAttribute('data-nom');
    var f = FICHES[nom] || [];
    var v = VARIANTES[nom];
    p.innerHTML = '<button type="button" class="v699-fermer" aria-label="Fermer">&times;</button>'
      + '<b>' + esc(nom) + '</b> — ' + esc(f[0] || 'Ancêtre mentionné dans la généalogie')
      + '<br><i>' + esc(f[1] || el.getAttribute('data-src')) + '</i>'
      + '<br>' + esc(f[2] || (v ? 'Forme biblique : ' + v + '.' : 'Nom tel qu’il apparaît dans la généalogie.'));
    p.hidden = false;
  }

  /* ── style ── */
  try {
    var st = document.createElement('style');
    st.id = 'v699-genealogie-css';
    st.appendChild(document.createTextNode(css()));
    document.head.appendChild(st);
  } catch (e) {}

  /* ── délégation ── */
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('v699-search')) return;
    var card = t.closest('.schema-card');
    if (!card) return;
    var q = norm(t.value.trim());
    var ps = card.querySelectorAll('.schema-v699-pers');
    for (var i = 0; i < ps.length; i++) {
      var ok = !q || ps[i].getAttribute('data-q').indexOf(q) !== -1;
      ps[i].classList.toggle('dim', !ok);
      ps[i].classList.toggle('trouve', !!q && ok);
    }
    majCompte(card);
  }, true);

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var card = t.closest('.schema-card.v699-genealogie');
    if (!card) return;
    if (t.closest('.v699-retour')) { e.preventDefault(); e.stopPropagation(); rendreArbre(card); return; }
    if (t.closest('.v699-fermer')) { e.preventDefault(); e.stopPropagation(); var p = card.querySelector('.schema-v699-fiche'); if (p) p.hidden = true; return; }
    var fil = t.closest('.v699-filtre');
    if (fil) {
      e.preventDefault(); e.stopPropagation();
      var v = fil.getAttribute('data-f');
      var fs = card.querySelectorAll('.v699-filtre');
      for (var i = 0; i < fs.length; i++) fs[i].setAttribute('aria-pressed', String(fs[i] === fil));
      var brs = card.querySelectorAll('.schema-v699-br');
      for (var j = 0; j < brs.length; j++) brs[j].classList.toggle('masque', v !== 'all' && brs[j].getAttribute('data-br') !== v);
      majCompte(card);
      return;
    }
    var h3 = t.closest('.schema-v699-sec > h3');
    if (h3) { e.preventDefault(); e.stopPropagation(); h3.parentNode.classList.toggle('plie'); return; }
    var pers = t.closest('.schema-v699-pers');
    if (pers) { e.preventDefault(); e.stopPropagation(); fiche(card, pers); }
  }, false);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (!t || !t.classList) return;
    if (t.classList.contains('schema-v699-pers')) { e.preventDefault(); fiche(t.closest('.schema-card'), t); }
    else if (t.matches && t.matches('.schema-v699-sec > h3')) { e.preventDefault(); t.parentNode.classList.toggle('plie'); }
  }, true);

  /* ── init + observation des cartes injectées ── */
  var vu = null; try { vu = new WeakSet(); } catch (e) {}
  function traiterRoot(root) {
    var cs = (root && root.querySelectorAll) ? root.querySelectorAll('.schema-card') : document.querySelectorAll('.schema-card');
    for (var i = 0; i < cs.length; i++) if (!vu || !vu.has(cs[i])) { if (vu) vu.add(cs[i]); traiter(cs[i]); }
  }
  function demarrer() {
    traiterRoot(document);
    try {
      var obs = new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) {
          var aj = ms[i].addedNodes;
          for (var j = 0; j < aj.length; j++) {
            var n = aj[j];
            if (!n || n.nodeType !== 1) continue;
            if (n.classList && n.classList.contains('schema-card')) traiter(n);
            else traiterRoot(n);
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
  setTimeout(demarrer, 800);

  window.__v699Genealogie = {
    version: 699,
    traiter: traiter,
    estGenealogie: estGenealogie,
    rendreArbre: rendreArbre,
    rendu: rendu,
    css: css,
    sections: SECTIONS,
    branches: BRANCHES
  };
})();
</script>
