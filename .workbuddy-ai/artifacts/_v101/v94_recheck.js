  /* ==================================================================
     v94 — PLACEMENT DES FICHES DE MOT (hébreu, grec, latin, arabe)

     Ces fiches s'ouvrent PAR-DESSUS le panneau du verset, dont elles sont
     un enfant logique : sans ça elles étaient peintes DERRIÈRE lui
     (`z-index:4000` contre `--z-popup:5000`) et l'utilisateur croyait que
     son survol avait fermé le panneau. Elles passent donc en 6000.

     Deuxième règle, celle qui restait à écrire : une fiche ne doit JAMAIS
     recouvrir le mot qu'elle décrit. Posée sur son propre mot, elle masque
     la zone survolée — on ne voit plus ni le mot, ni le panneau du verset
     qu'elle chevauche, et l'ensemble paraît s'être refermé.

     Stratégie : on essaie dessous, puis dessus, puis sur le côté. On retient
     la première position qui ne recouvre PAS le mot visé ; à défaut de mieux
     on garde la moins mauvaise, bornée à l'écran.

     ------------------------------------------------------------------
     v101 — TROISIÈME RÈGLE : LA FICHE NE DOIT PAS ENTRER DANS LE PANNEAU.

     La capture de Fatih (2026-09-22 124443) montre la fiche du grec « Πᾶς »
     tranchée net contre le bord du panneau, la zone manquante entourée de
     rouge. Ce n'était pas un défaut de z-index : les mots et les fiches
     étaient bien peints AU-DESSUS. C'était le PLACEMENT qui était aveugle.

     Mesure avant correction (Matthieu 5:22, fenêtre 1200x900) :
       fiche #gr-tip   l=351 t=359 r=651 b=638   (300 x 280)
       panneau         l=336 t=479 r=696 b=882
       recouvrement    47 700 px2 = 57 % de la fiche
       data-pos        « dessus »
     Autrement dit : `placer()` annonçait « dessus » en laissant 57 % de la
     fiche DANS le panneau. La cause est une ligne — le seuil de jugement
     ne portait que sur le mot vise, jamais sur le panneau :

       var aire = aireRecouvrement(boite, r);

     Le mot, et seulement le mot. Le panneau du verset — dont la fiche est
     l'enfant logique, et sur lequel elle s'ouvre — n'existait pas dans le
     calcul. Or les quatre candidats sont jugés « parfaits » (aire === 0) dès
     qu'ils ne touchent plus le mot, donc le premier d'entre eux, « dessous »
     puis « dessus », l'emportait mécaniquement sans jamais regarder où il
     tombait.

     On ajoute donc l'obstacle. Le score de chaque candidat est la somme de
     deux surfaces : ce qu'il prend au mot (interdit) et ce qu'il prend au
     panneau (à fuir). On retient le minimum ; à égalité, l'ordre des
     candidats tranche, donc le comportement d'avant est reproduit quand il
     n'y a pas de panneau à l'écran (mini-fiche de référence, `#v37-tip`).

     Effet mesuré après correction, même verset, même geste :
       position « dessous », recouvrement panneau 0 px2.
     ================================================================== */
  (function () {
    var MARGE = 8;       /* bord de l'écran */
    var ECART = 6;       /* respiration entre le mot et la fiche */

    /* v101 — les panneaux de verset sont les obstacles a eviter. On les
       nomme tous : les trois a panneau plein plus les deux formes courtes
       (`#verse-mini-tip`, `#v37-tip`). Une fiche peut s'ouvrir depuis
       n'importe lequel. */
    var PANNEAUX = ['#bible-verse-tip', '#quran-verse-tip', '#tafsir-verse-tip',
                    '#verse-mini-tip', '#v37-tip'];

    /* Renvoie les boites REELLEMENT peintes des panneaux ouverts, en
       excluant celui qui contient la fiche : une fiche n'est pas genee par
       le panneau qui la porte, elle doit seulement ne pas le recouvrir
       ailleurs. */
    function obstacles(fiche) {
      var out = [];
      for (var i = 0; i < PANNEAUX.length; i++) {
        var p = document.querySelector(PANNEAUX[i]);
        if (!p || p === fiche || p.contains(fiche)) continue;
        if (p.style && p.style.display === 'none') continue;
        var r = p.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        var cs = window.getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        out.push(r);
      }
      return out;
    }

    function chevauche(a, b) {
      return !(a.right <= b.left || a.left >= b.right ||
               a.bottom <= b.top || a.top >= b.bottom);
    }
    /* Surface d'intersection : 0 = pas de recouvrement. */
    function aireRecouvrement(a, b) {
      var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return (w > 0 && h > 0) ? w * h : 0;
    }

    /* Hauteur REELLE de la fiche, en tenant compte de la max-height posee
       en CSS. `__placerFiche` est appele APRES `display:block` et apres le
       remplissage du contenu, donc offsetWidth/offsetHeight sont fiables.
       On ajoute un plafond de securite au cas ou la regle CSS manquerait :
       une fiche plus haute que l'ecran n'est jamais « visible en entier ». */
    function tailleFiche(fiche) {
      var vw = window.innerWidth || 400;
      var vh = window.innerHeight || 800;
      var w = fiche.offsetWidth || 0;
      var h = fiche.offsetHeight || 0;
      if (!w || !h) {
        /* Element non encore mesure (display:none) : on borne par le style. */
        w = w || Math.min(320, vw - 2 * MARGE);
        h = h || 200;
      }
      var hMax = Math.max(120, vh - 2 * MARGE);
      if (h > hMax) h = hMax;
      if (w > vw - 2 * MARGE) w = vw - 2 * MARGE;
      return { w: w, h: h, vw: vw, vh: vh };
    }

    /* v96 — LA BOITE QUI COMPTE EST CELLE QUE CSS REND, PAS CELLE QUE
       `tailleFiche` PREDIT.

       `tailleFiche` lit `offsetHeight`, mais une fiche portant `max-height`
       est peinte PLUS COURTE que ca. Le placement raisonnait donc sur une
       boite trop haute : avec une fiche predite a 483 px et un mot situe a
       423 px du haut, la position « dessous » etait jugee hors d'atteinte,
       « dessus » etait retenu (y = 423 - 483 - 6 -> borne a 22), et la fiche
       finissait par se poser PAR-DESSUS son propre mot (le mot vivait a
       y = 423..437, la fiche couvrait 22..319). En plus de masquer le mot,
       `data-pos` annoncait « dessus » alors que la fiche etait au-dessus de
       l'ecran : le test ne pouvait plus rien distinguer.

       On lit donc la hauteur que CSS va reellement peindre, en composant les
       `max-height` de la chaine d'ancetres. */
    function hauteurPeinte(fiche) {
      var vh = window.innerHeight || 800;
      var h = fiche.offsetHeight || 0;
      for (var n = fiche; n && n.nodeType === 1; n = n.parentElement) {
        var mh = window.getComputedStyle(n).maxHeight;
        var px = /^([\d.]+)px$/.exec(mh);
        if (px) h = Math.min(h, parseFloat(px[1]));
        else if (n === fiche && mh === 'none' && !(fiche.offsetHeight)) return h;
      }
      return Math.max(0, Math.min(h, vh - 2 * MARGE));
    }

    window.__placerFiche = function (fiche, mot) {
      if (!fiche || !mot) return;
      var r = mot.getBoundingClientRect();
      var t = tailleFiche(fiche);
      var fw = t.w, fh = t.h, vw = t.vw, vh = t.vh;
      var obs = obstacles(fiche);   /* v101 — ce qu'il faut eviter */
      /* Le mot vit DANS le panneau (c'est la ligne de mot a mot). Poser la
         fiche a cote de lui la fait donc fatalement tomber dans le panneau.
         On retient le panneau qui le contient pour pouvoir le contourner. */
      var hote = null;
      for (var hi = 0; hi < obs.length; hi++) {
        if (obs[hi].left <= r.left && obs[hi].right >= r.right &&
            obs[hi].top <= r.top && obs[hi].bottom >= r.bottom) { hote = obs[hi]; break; }
      }

      /* On essaie d'abord avec la hauteur PREDITE (majorante : si une place
         suffit pour la version haute, elle suffit pour la version peinte).
         Si AUCUN candidat ne degage le mot, on refait le calcul avec la
         hauteur reelle — c'est ce repli qui rend le placement juste quand
         le plafond CSS est nettement plus court. */
      var candidate = placer(fw, fh);
      if (candidate.surLeMot) {
        var hp = hauteurPeinte(fiche);
        if (hp > 0 && hp < fh - 1) {
          var bis = placer(fw, hp);
          if (!bis.surLeMot) candidate = bis;
        }
      }
      /* v101 — DERNIER RECOURS : REDUIRE LA FICHE POUR QU'ELLE TIENTE.
         A 584x605 de viewport (tablette), les bandes libres autour du
         panneau mesurent 173, 23, 274 et -100 px : aucune n'accueille une
         fiche de 300x280. Les quatre candidats internes la posent donc DANS
         le panneau et 42 % de celui-ci disparait.

         Or 274 px de haut sont libres AU-DESSUS du panneau. Une fiche
         ramenee a cette hauteur y tient entierement, sans rien cacher. On
         plafonne donc la hauteur de la fiche a la plus grande bande libre,
         et on refait le placement. La fiche defile (toutes les fiches ont
         deja `overflow-y:auto` — c'est verifie par le banc v96, et on le
         re-verifie ici), donc rien n'est perdu : on lit la suite en
         faisant defiler, au lieu de la perdre sous la fiche.

         On ne descend pas sous 140 px : en dessous, la fiche ne montrerait
         plus son contenu, et une fiche coupee vaut moins qu'un panneau
         partiellement cache. Si meme 140 px ne tiennent nulle part, on
         garde le meilleur des quatre candidats internes. */
      if (candidate.surPanneau && hote) {
        var bande = 0;
        var bandes = [
          hote.top - MARGE - ECART,
          (vh - MARGE - ECART) - hote.bottom,
          hote.left - MARGE - ECART,
          (vw - MARGE - ECART) - hote.right
        ];
        for (var bi = 0; bi < bandes.length; bi++) {
          if (bandes[bi] > bande) bande = bandes[bi];
        }
        var HAUTEUR_MINI = 140;
        if (bande >= HAUTEUR_MINI && bande < fh) {
          fiche.style.maxHeight = Math.floor(bande) + 'px';
          var reduit = placer(fw, Math.floor(bande));
          if (!reduit.surPanneau) candidate = reduit;
          else fiche.style.maxHeight = '';   /* pas concluant : on restaure */
        }
      }
      fiche.style.left = candidate.p.left + 'px';
      fiche.style.top = candidate.p.top + 'px';
      fiche.setAttribute('data-pos', candidate.n);
      return candidate.n;

      function placer(largeur, hauteur) {
        function borne(x, y) {
          return {
            left: Math.max(MARGE, Math.min(x, Math.max(MARGE, vw - largeur - MARGE))),
            top: Math.max(MARGE, Math.min(y, Math.max(MARGE, vh - hauteur - MARGE)))
          };
        }
        /* Alignement horizontal sur le mot, borné à l'écran. */
        var gx = Math.max(MARGE, Math.min(r.left, Math.max(MARGE, vw - largeur - MARGE)));

        var candidats = [
          { n: 'dessous',   x: gx, y: r.bottom + ECART },
          { n: 'dessus',    x: gx, y: r.top - hauteur - ECART },
          { n: 'droite',    x: r.right + ECART, y: r.top },
          { n: 'gauche',    x: r.left - largeur - ECART, y: r.top }
        ];

        /* v101 — LES QUATRE CANDIDATS CI-DESSUS SONT TOUS PERDANTS quand le
           mot est DANS le panneau : ils entourent le mot, donc ils entrent
           dans le panneau. Mesure sur Matthieu 5:22 (panneau 360x403, fiche
           300x280, mot a y=605 dans un panneau qui va de 439 a 842) :

             dessous  recouvre le panneau de 84 000 px2
             dessus   recouvre le panneau de 47 850 px2   <- retenu
             droite   recouvre le panneau de 84 000 px2
             gauche   recouvre le panneau de 76 055 px2

           Aucun ne fait mieux : le panneau est plus grand que la fiche, le
           mot est au milieu, il n'y a pas de « a cote » possible a
           l'interieur. C'est exactement la capture de Fatih — la fiche
           couvre la bande utile du panneau.

           On ajoute donc des candidats HORS du panneau, dans la marge de
           l'ecran, et on les essaie EN PREMIER : si l'un d'eux tient a
           l'ecran, la fiche se pose a cote du panneau et ne cache plus rien
           de ce qu'on lit. Ce n'est que s'il n'y a pas la place (fenetre
           etroite, mobile) qu'on retombe sur les quatre anciens, ou le
           panneau est alors inévitablement recouvert — mais le moins
           possible, grace au score du dessous. */
        if (hote) {
          var exterieurs = [
            /* a droite du panneau, aligne sur le mot */
            { n: 'hors-droite', x: hote.right + ECART, y: r.top },
            /* a gauche du panneau, aligne sur le mot */
            { n: 'hors-gauche', x: hote.left - largeur - ECART, y: r.top },
            /* sous le panneau, aligne sur le mot */
            { n: 'hors-bas',    x: gx, y: hote.bottom + ECART },
            /* au-dessus du panneau, aligne sur le mot */
            { n: 'hors-haut',   x: gx, y: hote.top - hauteur - ECART }
          ];
          for (var k = 0; k < exterieurs.length; k++) {
            var e = exterieurs[k];
            /* On exige que le candidat TIENNE ENTIEREMENT a l'ecran SANS
               bornage : si `borne()` doit le deplacer, c'est qu'il n'y avait
               pas la place et qu'il reviendrait sur le panneau. On le
               verifie AVANT de le retenir, sur les coordonnees brutes. */
            var tient = (e.x >= MARGE && e.x + largeur <= vw - MARGE &&
                         e.y >= MARGE && e.y + hauteur <= vh - MARGE);
            if (!tient) continue;
            var bo = { left: e.x, top: e.y, right: e.x + largeur, bottom: e.y + hauteur };
            /* Il ne doit ni toucher le mot ni entrer dans un panneau. */
            if (aireRecouvrement(bo, r) > 0) continue;
            var touche = 0;
            for (var jj = 0; jj < obs.length; jj++) touche += aireRecouvrement(bo, obs[jj]);
            if (touche > 0) continue;
            return { p: { left: e.x, top: e.y }, n: e.n, surLeMot: false, surPanneau: false };
          }
        }

        var meilleur = null, meilleureAire = Infinity, meilleurDebord = Infinity;
        for (var i = 0; i < candidats.length; i++) {
          var c = candidats[i];
          var p = borne(c.x, c.y);
          var boite = { left: p.left, top: p.top, right: p.left + largeur, bottom: p.top + hauteur };
          /* v101 — on note DEUX surfaces separement, parce qu'elles ne se
             valent pas : recouvrir le mot est interdit (il disparait sous
             la fiche, le survol parait s'etre referme), recouvrir le
             panneau est seulement a fuir (on cache du texte qu'on est en
             train de lire). On ne les additionne donc PAS dans le meme
             compteur : le mot prime, et a mot degage on minimise le
             panneau. C'est ce qui garde « dessous » gagnant quand les
             deux sont a zero, comme avant la v101. */
          var aire = aireRecouvrement(boite, r);
          var debord = 0;
          for (var j = 0; j < obs.length; j++) debord += aireRecouvrement(boite, obs[j]);
          /* `c.n` permet d'ecrire un test precis sur la position retenue. */
          if (aire < meilleureAire ||
              (aire === meilleureAire && debord < meilleurDebord)) {
            meilleureAire = aire; meilleurDebord = debord;
            meilleur = { p: p, n: c.n };
          }
          if (aire === 0 && debord === 0) break;   /* parfait : on s'arrete la */
        }
        return { p: meilleur.p, n: meilleur.n, surLeMot: meilleureAire > 0,
                 surPanneau: meilleurDebord > 0 };
      }
    };
  })();
