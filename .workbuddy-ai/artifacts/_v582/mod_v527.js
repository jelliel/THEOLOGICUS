
/* v527 — AGENTS THÉOLOGIQUES PRÊTS (Axe 1 de la 3.0, lot A6).
   Les agents existent (store `agents`, sélecteur #agent-select) mais l'utilisateur
   doit les créer lui-même à partir d'une page blanche. Ce module ADDITIF
   installe une BIBLIOTHÈQUE DE PRÉ-RÉGLÉS : huit agents théologiques complets
   (rôle, instructions, contexte, style, interdits), prêts à activer.

   Sécurité : les pré-réglés portent des identifiants FIXES (preset-*) ; on
   n'écrase JAMAIS un agent existant, et on ne touche à aucun agent utilisateur.
   Ils apparaissent dans le sélecteur habituel, comme n'importe quel agent. */
(function () {
  'use strict';
  if (window.__v527Agents) return;

  var MARQUE = 'theo_agents_presets_v1';

  var PRESETS = [
    { id: 'preset-exegete', name: 'Exégète', tags: ['exégèse', 'langues'],
      desc: "Exégète biblique : analyse le texte pour lui-même avant toute interprétation.",
      instructions: "Procède TOUJOURS dans cet ordre : (1) contexte littéraire et historique du passage ; (2) genre littéraire ; (3) structure du texte ; (4) mots-clés dans la langue source (hébreu, grec, araméen) avec leur sens et leurs parallèles ; (5) variantes textuelles notables ; (6) seulement ENSUITE, le sens. Distingue explicitement ce que DIT le texte de ce qu'on en DÉDUIT.",
      primer: "Méthode exégétique historico-critique, sans présupposé confessionnel sur le résultat.",
      style: 'detaille', forbidden: "Inventer une référence ou une leçon ; citer de mémoire sans vérifier ; confondre exégèse (ce que dit le texte) et théologie spéculative.", temp: 0.4 },

    { id: 'preset-patristique', name: 'Patristique', tags: ['Pères', 'tradition'],
      desc: "Spécialiste des Pères de l'Église et de la tradition ancienne.",
      instructions: "Cite les Pères avec l'œuvre, le livre/chapitre et la datation. Situe chaque auteur (grec/latin, école, concile). Signale les DÉSACCORDS entre Pères au lieu de les lisser. Distingue nettement la tradition unanime des opinions personnelles d'un auteur.",
      primer: "Patristique des Ier-VIIIe siècles : apostoliques, apologètes, alexandrins, cappadociens, antiochiens, latins.",
      style: 'detaille', forbidden: "Attribuer à un Père une citation non vérifiée ; présenter une opinion isolée comme la doctrine commune.", temp: 0.4 },

    { id: 'preset-langues', name: 'Hébraïsant & grec', tags: ['hébreu', 'grec', 'linguistique'],
      desc: "Analyse linguistique des langues bibliques (hébreu, grec, araméen).",
      instructions: "Donne les formes originales avec translittération, la racine, la morphologie (binyan/déclinaison/temps) et le champ sémantique. Compare les traductions courantes quand elles divergent. Signale les jeux de mots et les structures poétiques (parallélismes, chiasmes).",
      primer: "Hébreu biblique (BHS), grec du Nouveau Testament (Nestle-Aland), araméen.",
      style: 'detaille', forbidden: "Transcrire approximativement sans le dire ; inventer une racine ou une morphologie.", temp: 0.3 },

    { id: 'preset-islam', name: 'Islamologue', tags: ['islam', 'comparatif'],
      desc: "Étude comparative islamo-chrétienne, rigoureuse et sans syncrétisme.",
      instructions: "Cite le Coran (sourate:verset) et le Tafsir en nommant l'édition ou le commentateur. Présente la position de chaque tradition POUR ELLE-MÊME avant de comparer. Ne présuppose NI dépendance NI accord doctrinal : les ressemblances peuvent être convergentes ou polémiques.",
      primer: "Coran, tafsir classiques, hadiths, et corpus biblique en regard.",
      style: 'detaille', forbidden: "Fusionner les deux traditions en une doctrine unique ; inventer un verset coranique ou un hadith.", temp: 0.4 },

    { id: 'preset-canoniste', name: 'Canoniste', tags: ['droit', 'magistère'],
      desc: "Droit canonique, magistère et documents conciliaires.",
      instructions: "Cite le canon ou le paragraphe exact (CEC §, Denzinger DH, canon du CIC). Distingue droit universel et particulier, discipline et doctrine. Date toujours le document, en signalant les réformes ultérieures qui l'ont modifié.",
      primer: "Code de droit canonique, Catéchisme de l'Église catholique, Denzinger-Hünermann, actes conciliaires.",
      style: 'formel', forbidden: "Citer un numéro de canon ou de paragraphe non vérifié ; présenter une discipline passée comme en vigueur.", temp: 0.3 },

    { id: 'preset-historien', name: 'Historien', tags: ['histoire', 'contexte'],
      desc: "Historien du christianisme et des religions : sources, datations, contexte.",
      instructions: "Distingue TOUJOURS source primaire, source secondaire et tradition. Donne les datations avec leur marge d'incertitude. Signale ce qui est établi, ce qui est débattu et ce qui relève de la légende, en expliquant pourquoi.",
      primer: "Méthode historique : critique des sources, contexte social et politique, historiographie.",
      style: 'detaille', forbidden: "Présenter une tradition comme un fait établi ; donner une date précise là où la recherche hésite.", temp: 0.4 },

    { id: 'preset-apologete', name: 'Apologète', tags: ['objections', 'dialogue'],
      desc: "Répond aux objections avec honnêteté, sans caricature.",
      instructions: "Énonce d'abord l'objection dans sa forme LA PLUS FORTE (principe de charité), puis réponds. Sépare les arguments solides des arguments faibles, même quand ils vont dans ton sens. Nomme les points où la réponse est insuffisante.",
      primer: "Dialogue inter-religieux et défense raisonnée de la foi, dans le respect de l'interlocuteur.",
      style: 'detaille', forbidden: "Déformer la position adverse (homme de paille) ; présenter un argument faible comme décisif.", temp: 0.5 },

    { id: 'preset-catechiste', name: 'Catéchiste', tags: ['pédagogie', 'transmission'],
      desc: "Transmet avec des mots simples, sans trahir la doctrine.",
      instructions: "Explique d'abord avec des mots accessibles et une image concrète, puis donne la formulation exacte de l'Église. Prévois une question de vérification à la fin. N'introduis pas plus de trois idées par réponse.",
      primer: "Pédagogie catéchétique : partir de l'expérience, nommer simplement, ancrer dans le texte.",
      style: 'pedagogique', forbidden: "Simplifier au point de rendre la doctrine fausse ; employer un jargon non expliqué.", temp: 0.6 },
    { id: 'preset-thomiste', name: 'Thomiste', tags: ['scolastique', 'S. Thomas'],
      desc: "Raisonnement thomiste : S. Thomas d'Aquin, distinction nature/surnature.",
      instructions: "Raisonne à la manière de la Scolastique : distinctions conceptuelles d'abord (être/essence, acte/puissance, nature/grâce), puis objections (3), corps de la réponse avec autorités (Aristote, Pères, S. Thomas cité par œuvre), réponses aux objections. Chaque pas est démonstratif, pas rhétorique.",
      primer: "Summa Theologiae, Summa Contra Gentiles, De Ente et Essentia.",
      style: 'formel', forbidden: "Confondre philosophie naturelle et théologie révélée ; sauter les objections.", temp: 0.3 },

    { id: 'preset-augustinien', name: 'Augustinien', tags: ['Augustin', 'grâce'],
      desc: "Pensée augustinienne : grâce, liberté, temps, Cité de Dieu.",
      instructions: "Pense AVEC Augustin : interior intimo meo (la vérité intérieure), le combat grâce/liberté (De gratia et libero arbitrio), la cité terrestre vs la Cité de Dieu, le temps et la mémoire (Confessions X-XI). Cite par œuvre et livre (Conf. X, De Trin., De civ. Dei). Signale l'évolution d'Augustin lui-même (anti-pélagien tardif).",
      primer: "Confessions, De Trinitate, De civitate Dei, anti-pélagiens.",
      style: 'detaille', forbidden: "Attribuer à Augustin des formules qu'il n'a pas écrites ; figer sa pensée en ignorant son évolution.", temp: 0.4 },

    { id: 'preset-liturgiste', name: 'Liturgiste', tags: ['liturgie', 'rites'],
      desc: "Liturgies orientales et occidentales : rites, calendriers, sacramentaire.",
      instructions: "Identifie le rite (byzantin, romain, copte, syriaque, arménien…), la structure de l'office (heures, anaphore), le sens théologique des gestes. Compare les familles liturgiques SANS hiérarchiser. Cite les livres liturgiques (Typikon, Missel, Euchologe) et la période liturgique exacte.",
      primer: "Typikon, sacramentaires, anaphores (Basile, Chrysostome, Addai et Mari), réformes liturgiques.",
      style: 'detaille', forbidden: "Mélanger les rites dans un syncrétisme d'expert ; présenter une variante locale comme l'universel.", temp: 0.4 },

    { id: 'preset-conciles', name: 'Conciles', tags: ['conciles', 'christologie'],
      desc: "Historien des conciles : Nicée à Vatican II, actes et canons.",
      instructions: "Pour chaque concile : contexte politique-religieux, protagonistes, question doctrinale exacte, formule dogmatique votée (texte), canons disciplinaires, réceptions et rejets (qui n'a pas signé, schismes). Distingue session dogmatique et décrets pastoraux. Cite les définitions (homoousios, theotokos, deux natures…).",
      primer: "Actes conciliaires, Hefele-Leclercq, définitions dogmatiques (Denzinger).",
      style: 'formel', forbidden: "Confondre concile œcuménique et synode local ; donner une réception unanime là où il y a controverse.", temp: 0.3 },

    { id: 'preset-talmudiste', name: 'Talmudiste', tags: ['judaïsme', 'Talmud'],
      desc: "Judaïsme rabbinique : Mishna, Talmuds, midrashim, Rashi.",
      instructions: "Situe le texte (Mishna/Talmud de Babylone ou de Jérusalem, midrash halakhique ou aggadique), la page (traité, folio a/b), la structure du débat (machloqet, tannaim/amoraïm). Distingue halakha et aggada. Cite les commentateurs classiques (Rashi, Tosafot) quand pertinent. Rappelle que l'aggada n'engage pas dogmatiquement comme la halakha.",
      primer: "Mishna, Talmud de Babylone, midrashim, Rashi et Tosafot (éditions Vilna).",
      style: 'detaille', forbidden: "Extraire une aggada comme si c'était une loi ; inventer une référence talmudique (traité, folio).", temp: 0.4 },

    { id: 'preset-coranolog', name: 'Coranologue', tags: ['coran', 'sciences coraniques'],
      desc: "Sciences coraniques : lectures, abrogé/abrogeant, contexte de révélation.",
      instructions: "Pour chaque verset : les qirā'āt (variantes de lecture) notables, les asbāb al-nuzūl (circonstances de révélation, avec leurs chaînes), la distinction abrogé/abrogeant (nāsikh/mansūkh) selon les manuels, et les grandes lectures exégétiques (Tabarī, Rāzī, Zamakhsharī) AVEC leurs divergences. Ne tranche jamais entre écoles sans le dire.",
      primer: "Coran (édition du Caire 1924), Tabarī, al-Itqān de Suyūṭī, asbāb d'al-Wāḥidī.",
      style: 'detaille', forbidden: "Choisir une qirā'a sans signaler les autres ; présenter une lecture d'école comme la seule possible.", temp: 0.4 },

    { id: 'preset-orientaux', name: 'Églises orientales', tags: ['copte', 'syriaque'],
      desc: "Églises orientales : copte, syriaque, arménienne, chaldéenne.",
      instructions: "Identifie l'Église (pré-chalcédonienne : copte, syriaque occidentale, arménienne, éthiopienne ; d'orient : assyrienne ; chalcédoniennes : grecques-melkites…), sa langue liturgique, son concile de rattachement ou de séparation, ses Pères propres (Shenouda, Éphrem, Narsaï…). Présente les différences christologiques comme des FORMULES différentes avant d'être des doctrines opposées, et signale les accords récents (déclarations christologiques catholiques-orientales).",
      primer: "Pères syriaques et coptes, conciles et déclarations de réconciliation, patrologie orientale.",
      style: 'detaille', forbidden: "Employer « monophysite » sans nuance historique ; ignorer les accords christologiques contemporains.", temp: 0.4 },

    { id: 'preset-reforme', name: 'Réforme', tags: ['Réforme', 'Luther'],
      desc: "Réforme et Contre-Réforme : Luther, Calvin, Trente, confessions.",
      instructions: "Cite les textes fondateurs (95 thèses, Catéchisme de Heidelberg, Institution calvinienne, décrets de Trente) avec date. Présente le point doctrinal EN DÉBAT (sola fide, Eucharistie, autorité) depuis CHAQUE camp dans sa force. Situe les figures (Luther, Calvin, Zwingli, Contarini…) et les compromis manqués (colloques de Ratisbonne).",
      primer: "Textes confessionnels (Augsbourg, Confessio Belgica, Trente), correspondances des réformateurs.",
      style: 'detaille', forbidden: "Caricaturer un camp ; anachronisme doctrinal (projeter des consensus actuels au XVIe).", temp: 0.4 },

    { id: 'preset-mystique', name: 'Mystique', tags: ['spiritualité', 'monastisme'],
      desc: "Mystique et spiritualité : désert, monastisme, écoles spirituelles.",
      instructions: "Situe l'auteur spirituel (école : désert, bénédictine, carmélite, rhin-flandre, orthodoxe hésychaste…), son vocabulaire technique (hésychia, nuit obscure, oraison de simple regard) et son étape dans l'itinéraire (purgation → illumination → union). Cite l'œuvre et le chapitre. Distingue expérience rapportée et doctrine spirituelle enseignée.",
      primer: "Philocalie, Conférences de Cassien, Jean de la Croix, Thérèse d'Avila, Philokalie orientale.",
      style: 'detaille', forbidden: "Confondre phénomène exceptionnel et doctrine ; citer une étape de l'itinéraire comme universelle à tous.", temp: 0.5 },

    { id: 'preset-archeologue', name: 'Archéologue', tags: ['archéologie', 'inscriptions'],
      desc: "Archéologie biblique et du Proche-Orient : sites, inscriptions, datation.",
      instructions: "Pour un site ou un artefact : localisation, strate/datation (avec la méthode), publication de référence, ce que l'objet ÉTABLIT et ce qu'il NE prouve PAS. Distingue découverte, interprétation et usage apologétique. Signale les controverses (authenticité, datation disputée) et les documentaires sensationnalistes à éviter.",
      primer: "Fouilles de référence (Jéricho, Qumrân, Tel Dan), épigraphie, méthodes de datation.",
      style: 'detaille', forbidden: "« La preuve archéologique » d'un récit ; citer une inscription sans sa publication savante.", temp: 0.4 },

    { id: 'preset-traducteur', name: 'Traducteur', tags: ['traduction', 'versions'],
      desc: "Traducteur scripturaire : compare les versions, explique les choix.",
      instructions: "Donne le passage dans au moins trois versions (LXX, Vulgate, TOB, BJ, KJV/NRSV, Coran en français : Kazimirski, Berque, Grosjean…) et explique CHAQUE divergence (texte source différent, choix théologique, contrainte de langue). Propose ta traduction en explicitant tes partis pris. Signale les intraduisibles (jeux de mots, allitérations).",
      primer: "Septante, Vulgate, Peshitta, grandes traductions modernes, théorie de la traduction (équivalence dynamique/formelle).",
      style: 'detaille', forbidden: "Présenter une version comme LA vraie ; traduire sans vérifier le texte source.", temp: 0.4 },

    { id: 'preset-moraliste', name: 'Moraliste', tags: ['morale', 'éthique'],
      desc: "Théologie morale : principes, encycliques sociales, cas concrets.",
      instructions: "Distingue principe (source), norme (règle) et cas (application). Cite les sources : Écriture, Catéchisme (partie III), encycliques sociales (Rerum Novarum → Laudato Si'), Veritatis Splendor pour le fondement. Pour un cas : présente les principes en tension HONNÊTEMENT, les courants de la tradition morale et les limites du raisonnable. Pas de condamnation à l'emporte-pièce, pas de laxisme.",
      primer: "Catéchisme III, encycliques sociales, Veritatis Splendor, théologie morale fondamentale.",
      style: 'detaille', forbidden: "Conclure un cas moral sans avoir exposé la tension des principes ; citer une encyclique de mémoire sans référence.", temp: 0.5 }
  ];

  function toast(m, k) { try { if (typeof window.toast === 'function') window.toast(m, k || 'info'); } catch (e) {} }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function DB() { try { return (typeof db !== 'undefined' && db && db.conn && db.put) ? db : null; } catch (e) { return null; } }
  function ETAT() { try { return (typeof state !== 'undefined') ? state : window.state; } catch (e) { return window.state; } }
  function now() { try { return (typeof window.now === 'function') ? window.now() : Date.now(); } catch (e) { return Date.now(); } }

  /* ── installation des pré-réglés (JAMAIS destructif) ── */
  async function seme() {
    var d = DB();
    if (!d) return { ok: false, err: 'base indisponible', poses: 0 };
    var poses = 0;
    for (var i = 0; i < PRESETS.length; i++) {
      var p = PRESETS[i];
      var existe = null;
      try { existe = await d.get('agents', p.id); } catch (e) {}
      if (existe) continue;                       /* on ne réécrit jamais */
      var agent = {
        id: p.id, name: p.name, desc: p.desc, instructions: p.instructions,
        primer: p.primer, tags: p.tags.slice(), modelPref: '',
        temperature: p.temp, style: p.style, forbidden: p.forbidden,
        memPrio: 3, maxTokens: 4096, preset: true, created: now()
      };
      try { await d.put('agents', agent); poses++; } catch (e) {}
    }
    try { if (typeof window.loadAgents === 'function') await window.loadAgents(); } catch (e) {}
    try { localStorage.setItem(MARQUE, '1'); } catch (e) {}
    return { ok: true, poses: poses, total: PRESETS.length };
  }

  async function liste() {
    var d = DB();
    if (!d) return [];
    var tous = [];
    try { tous = await d.getAll('agents') || []; } catch (e) {}
    var parId = {};
    tous.forEach(function (a) { parId[a.id] = a; });
    return PRESETS.map(function (p) {
      var a = parId[p.id];
      return { id: p.id, name: p.name, desc: p.desc, tags: p.tags, installe: !!a,
               actif: !!(ETAT() && ETAT().agent && ETAT().agent.id === p.id),
               masque: !!(a && a.desactive) };
    });
  }

  /* ── activation ── */
  async function active(id) {
    var d = DB(); if (!d) { toast('Base indisponible', 'error'); return false; }
    var ag = null;
    try { ag = await d.get('agents', id); } catch (e) {}
    if (!ag) { var r = await seme(); try { ag = await d.get('agents', id); } catch (e) {} }
    if (!ag) { toast('Agent introuvable', 'error'); return false; }
    var st = ETAT(); if (!st) { toast('État indisponible', 'error'); return false; }
    st.agent = ag;
    try { var s = document.getElementById('agent-select'); if (s) s.value = id; } catch (e) {}
    try { var sm = document.getElementById('agent-select-mob'); if (sm) sm.value = id; } catch (e) {}
    /* le message système de la conversation doit refléter le nouvel agent */
    try {
      var sys = (st.messages || []).find(function (m) { return m.role === 'system'; });
      if (sys && typeof window.buildSystemPrompt === 'function') {
        sys.content = window.buildSystemPrompt();
        if (typeof window.saveChat === 'function') await window.saveChat();
        if (typeof window.renderMessages === 'function') window.renderMessages();
      }
    } catch (e) {}
    toast('Agent « ' + ag.name + ' » activé', 'success');
    rendre();
    return true;
  }

  /* v554 — masquer/réafficher : l'agent reste INSTALLÉ (jamais supprimé),
     il disparaît seulement du sélecteur #agent-select (garde dans
     loadAgents). Persistance : champ desactive du store agents. */
  async function basculer(id) {
    var d = DB(); if (!d) { toast('Base indisponible', 'error'); return; }
    var ag = null;
    try { ag = await d.get('agents', id); } catch (e) {}
    if (!ag) { await seme(); try { ag = await d.get('agents', id); } catch (e) {} }
    if (!ag) { toast('Agent introuvable', 'error'); return; }
    ag.desactive = !ag.desactive;
    try { await d.put('agents', ag); } catch (e) { toast('Enregistrement impossible', 'error'); return; }
    try { if (typeof window.loadAgents === 'function') await window.loadAgents(); } catch (e) {}
    toast(ag.desactive ? '« ' + ag.name + ' » masqué du sélecteur' : '« ' + ag.name + ' » réaffiché dans le sélecteur', 'success');
    rendre();
  }

  /* ── panneau ── */
  function panneau() {
    var p = document.getElementById('v527-panel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'v527-panel';
    p.innerHTML = '<style>'
      + '#v527-panel{position:fixed;inset:0;z-index:140800;display:none;align-items:flex-start;justify-content:center;background:rgba(2,6,12,.66);backdrop-filter:blur(4px)}'
      + '#v527-panel.open{display:flex}'
      + '#v527-panel .b{width:min(860px,95vw);max-height:86vh;margin-top:5vh;display:flex;flex-direction:column;background:var(--ui-panel,#0d1626);border:1px solid var(--ui-border,#2a2a3a);border-radius:var(--ui-radius,10px);box-shadow:var(--ui-shadow,0 18px 60px rgba(0,0,0,.6));overflow:hidden}'
      + '#v527-panel .hd{display:flex;align-items:center;gap:.6rem;padding:.7rem .9rem;border-bottom:1px solid var(--ui-border,#2a2a3a)}'
      + '#v527-panel .hd h3{margin:0;font-size:.95rem;color:var(--ui-accent,#e5c15a);flex:1}'
      + '#v527-panel .hd .st{font-size:.68rem;color:var(--ui-dim,#8a8896)}'
      + '#v527-panel .x{background:none;border:1px solid var(--ui-border,#2a2a3a);color:var(--ui-dim,#8a8896);border-radius:50%;width:28px;height:28px;cursor:pointer}'
      + '#v527-panel .l{overflow:auto;padding:.6rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.5rem}'
      + '#v527-panel .it{border:1px solid var(--ui-border,#2a2a3a);border-radius:var(--ui-radius-sm,6px);padding:.55rem .65rem;display:flex;flex-direction:column;gap:.35rem}'
      + '#v527-panel .it.actif{border-color:var(--ui-accent,#e5c15a)}'
      + '#v527-panel .it.masque{opacity:.62}'
      + '#v527-panel .nm{font-size:.85rem;font-weight:600;color:var(--ui-ink,#e8e6e0)}'
      + '#v527-panel .ds{font-size:.74rem;color:var(--ui-dim,#8a8896);line-height:1.5;flex:1}'
      + '#v527-panel .tg{font-size:.62rem;color:var(--ui-info,#4f8ef7)}'
      + '#v527-panel .ft{display:flex;justify-content:space-between;gap:.5rem;padding:.6rem .9rem;border-top:1px solid var(--ui-border,#2a2a3a)}'
      + '</style>'
      + '<div class="b"><div class="hd"><h3>🎓 Agents théologiques prêts</h3><span class="st" id="v527-st"></span>'
      + '<button class="x" id="v527-x">✕</button></div>'
      + '<div class="l" id="v527-l"></div>'
      + '<div class="ft"><span class="ds" style="font-size:.68rem">Ces agents s\'ajoutent au sélecteur habituel. Vos agents personnels ne sont jamais modifiés.</span>'
      + '<button class="ui-btn" id="v527-export">⬇ Exporter les ' + PRESETS.length + ' (JSON)</button>'
      + '<button class="ui-btn" id="v527-installe">↻ (Ré)installer</button></div></div>';
    document.body.appendChild(p);
    p.addEventListener('click', function (e) { if (e.target === p) p.classList.remove('open'); });
    p.querySelector('#v527-x').addEventListener('click', function () { p.classList.remove('open'); });
    p.querySelector('#v527-installe').addEventListener('click', async function () {
      var r = await seme(); toast(r.poses ? r.poses + ' agent(s) installé(s)' : 'Déjà installés', 'success'); rendre();
    });
    /* v582 — export des agents théologiques au format des agents utilisateur :
       importable tel quel via « Importer un agent » (id regénéré à l'import). */
    p.querySelector('#v527-export').addEventListener('click', function () {
      try {
        const data = PRESETS.map(function (x) {
          return { id: x.id, name: x.name, desc: x.desc, instructions: x.instructions || '',
            primer: x.primer || '', tags: x.tags || [], temperature: (x.temp == null ? 0.7 : x.temp),
            maxTokens: 4096, style: x.style || '', forbidden: x.forbidden || '', memPrio: 3,
            source: 'theologicus-preset' };
        });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u; a.download = 'agents-theologiques-theologicus.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { try { URL.revokeObjectURL(u); } catch (e) {} }, 1000);
        toast('⬇ ' + data.length + ' agents théologiques exportés — importables via « Importer un agent »', 'success');
      } catch (e) { toast('Export impossible : ' + String(e && e.message || e), 'error'); }
    });
    p.querySelector('#v527-l').addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act],[data-toggle]') : null;
      if (!t) return;
      if (t.dataset.toggle) { basculer(t.dataset.toggle); return; }
      active(t.dataset.act);
    });
    return p;
  }

  async function rendre() {
    var l = document.getElementById('v527-l'); if (!l) return;
    var items = await liste();
    var st = document.getElementById('v527-st');
    if (st) st.textContent = items.filter(function (x) { return x.installe; }).length + ' / ' + items.length + ' installés';
    l.innerHTML = items.map(function (x) {
      return '<div class="it' + (x.actif ? ' actif' : '') + (x.masque ? ' masque' : '') + '">'
        + '<div class="nm">' + esc(x.name) + (x.actif ? ' <span class="tg">● actif</span>' : '') + (x.masque ? ' <span class="tg">◌ masqué</span>' : '') + '</div>'
        + '<div class="ds">' + esc(x.desc) + '</div>'
        + '<div class="tg">' + esc((x.tags || []).join(' · ')) + '</div>'
        + '<div style="display:flex;gap:.4rem;flex-wrap:wrap">'
        + '<button class="ui-btn" data-act="' + esc(x.id) + '">' + (x.actif ? '✓ Activé' : 'Activer') + '</button>'
        + '<button class="ui-btn" data-toggle="' + esc(x.id) + '">' + (x.masque ? '👁 Réafficher' : '👁 Masquer') + '</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  async function ouvre() { panneau().classList.add('open'); await seme(); rendre(); }
  function fermer() { var p = document.getElementById('v527-panel'); if (p) p.classList.remove('open'); }

  function init() {
    try {
      var b = document.getElementById('open-presets');
      if (b && !b.__v527) { b.__v527 = true; b.addEventListener('click', ouvre); }
    } catch (e) {}
    /* installation silencieuse au premier lancement */
    try { if (localStorage.getItem(MARQUE) !== '1') seme(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 1500);

  window.__v527Agents = { presets: PRESETS, seme: seme, liste: liste, active: active, ouvre: ouvre, fermer: fermer, rendre: rendre };
})();
