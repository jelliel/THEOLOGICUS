/* Banc v483 — « PARAMÈTRES → ➕ Modèles custom » doit MONTRER un formulaire.
   Le défaut : le raccourci ouvrait l'onglet « Fournisseurs », dont la section
   « MODÈLES PERSONNALISÉS » était un conteneur VIDE, tandis que le formulaire
   vivait dans un autre onglet (« Sauvegarde ») — donc invisible là où on le
   cherche. On vérifie que le champ est là, VISIBLE, qu'on peut enregistrer,
   que le modèle persiste et qu'il rejoint le sélecteur de modèles. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8907; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0, total = 0;
const ok = (name, cond, detail) => { total++; console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 110)}`); if (cond) pass++; };

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f).toLowerCase();
      const types = { '.js': 'application/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 110)));
  /* L'écran d'accueil (assistant de première ouverture) COUVRE tout et
     intercepte les clics : on le neutralise par le chemin de l'application
     (« PLUS TARD »), avant même le chargement. Sans cela, un test peut
     déclarer « visible » un champ qu'un voile recouvre. */
  await page.addInitScript(() => { try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  /* L'overlay d'auth intercepte les vrais clics : on masque, puis on clique en
     synthétique (clics directs, pas de souris). */
  await page.evaluate(() => { const o = document.getElementById('auth-overlay'); if (o) o.classList.add('hidden'); });
  await page.waitForTimeout(300);

  // 0. PRÉCONDITION : si un voile couvre encore l'écran, tout le reste est faux
  const voile = await page.evaluate(() => {
    const o = document.getElementById('auth-overlay');
    if (!o) return { present: false, visible: false };
    const b = o.getBoundingClientRect();
    return { present: true, visible: getComputedStyle(o).display !== 'none' && b.width > 0 && b.height > 0 };
  });
  ok('PRÉCONDITION : aucun voile ne couvre les paramètres', voile.visible === false, JSON.stringify(voile));

  // 1. structure : le formulaire doit vivre DANS l'onglet « Fournisseurs »
  const structure = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const panneauProviders = document.getElementById('settings-panneau-providers');
    const panneauKeys = document.getElementById('settings-panneau-keys');
    const conteneur = document.getElementById('settings-tab-providers-custom');
    const champs = ['cm-name', 'cm-model', 'cm-baseurl', 'cm-apikey', 'cm-format', 'cm-save'];
    return {
      conteneurExiste: !!conteneur,
      dansProviders: !!(conteneur && panneauProviders && panneauProviders.contains(conteneur)),
      horsKeys: !(conteneur && panneauKeys && panneauKeys.contains(conteneur)),
      champsPresents: champs.filter(id => !!document.getElementById(id)).length,
      nbChamps: champs.length,
      listeDedans: !!(conteneur && conteneur.querySelector('#custom-models-list')),
      /* le conteneur ne doit pas être un décor vide */
      contenuReel: !!(conteneur && conteneur.querySelector('input, select, button'))
    };
  });
  ok('le conteneur « MODÈLES PERSONNALISÉS » existe', structure.conteneurExiste, JSON.stringify(structure));
  ok('il vit dans l’onglet FOURNISSEURS (là où mène le raccourci)', structure.dansProviders, JSON.stringify(structure));
  ok('il n’est plus caché dans l’onglet « Sauvegarde »', structure.horsKeys, JSON.stringify(structure));
  ok('il n’est plus un conteneur VIDE (il porte de vrais champs)', structure.contenuReel, JSON.stringify(structure));
  ok('les 6 champs du modèle sont présents', structure.champsPresents === structure.nbChamps, structure.champsPresents + '/' + structure.nbChamps);
  ok('la liste des modèles enregistrés est dans le même conteneur', structure.listeDedans, JSON.stringify(structure));

  // 2. le raccourci « ➕ Modèles custom » ouvre le bon onglet
  const raccourci = await page.evaluate(async () => {
    const b = document.querySelector('[data-act="param-models"]');
    if (!b) return { present: false };
    b.click();
    await new Promise(r => setTimeout(r, 700));
    const panneau = document.getElementById('settings-panneau-providers');
    const onglet = document.getElementById('settings-tab-providers');
    return {
      present: true,
      ongletActif: window.__settingsOnglet,
      panneauVisible: !!(panneau && !panneau.hidden),
      boutonActif: !!(onglet && onglet.classList.contains('active'))
    };
  });
  ok('le raccourci « Modèles custom » existe', raccourci.present, JSON.stringify(raccourci));
  ok('il ouvre l’onglet Fournisseurs', raccourci.ongletActif === 'providers' && raccourci.panneauVisible === true, JSON.stringify(raccourci));

  // 3. VISIBILITÉ RÉELLE du champ (pas seulement sa présence dans le DOM).
  //    Piège connu : offsetParent vaut TOUJOURS null en position:fixed → on
  //    mesure le rectangle et le style calculé, jamais offsetParent.
  const visibilite = await page.evaluate(() => {
    const r = id => {
      const e = document.getElementById(id);
      if (!e) return { present: false };
      const b = e.getBoundingClientRect();
      const st = getComputedStyle(e);
      /* remonte la chaîne des ancêtres : un parent [hidden] ou display:none
         rend l'enfant invisible même si lui-même est « visible » */
      let cache = false, n = e;
      while (n && n !== document.body) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden' || n.hidden) { cache = true; break; }
        n = n.parentElement;
      }
      return { present: true, w: Math.round(b.width), h: Math.round(b.height), cache, display: st.display };
    };
    return { nom: r('cm-name'), model: r('cm-model'), url: r('cm-baseurl'), save: r('cm-save') };
  });
  const visibles = Object.keys(visibilite).every(k => visibilite[k].present && !visibilite[k].cache && visibilite[k].w > 40 && visibilite[k].h > 8);
  ok('les champs ne sont pas dans une branche cachée (rect + style, pas offsetParent)', visibles, JSON.stringify(visibilite));

  // 3-bis. HIT-TEST : la question n'est pas « est-il dans le DOM » mais « puis-je
  //        cliquer dedans ». On demande au navigateur QUEL élément se trouve au
  //        centre du champ. Un voile, même transparent, répondrait autre chose.
  const hit = await page.evaluate(() => {
    const cible = id => {
      const e = document.getElementById(id);
      if (!e) return { id, ok: false, raison: 'absent' };
      const b = e.getBoundingClientRect();
      if (b.width < 5 || b.height < 5) return { id, ok: false, raison: 'taille nulle', rect: [b.width, b.height] };
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      if (cy < 0 || cy > innerHeight) return { id, ok: false, raison: 'hors écran', cy: Math.round(cy) };
      const dessus = document.elementFromPoint(cx, cy);
      return { id, ok: !!(dessus && (dessus === e || e.contains(dessus) || dessus.contains(e))), dessus: dessus ? (dessus.id || dessus.tagName) : null };
    };
    return { nom: cible('cm-name'), url: cible('cm-baseurl'), save: cible('cm-save') };
  });
  const cliquables = Object.keys(hit).every(k => hit[k].ok);
  ok('les champs sont CLAIQUABLES (hit-test : rien ne les recouvre)', cliquables, JSON.stringify(hit));

  // 4. enregistrer un modèle custom
  const ajout = await page.evaluate(async () => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('cm-name', 'Mon GPT local');
    set('cm-model', 'gpt-4o-mini');
    set('cm-baseurl', 'https://api.exemple.test/v1');
    set('cm-apikey', 'sk-test-123');
    document.getElementById('cm-save').click();
    await new Promise(r => setTimeout(r, 700));
    const liste = document.getElementById('custom-models-list');
    /* la persistance passe par un COOKIE (insensible au port), pas par
       localStorage — c'est le choix fait pour « se souvenir » dans l'app */
    let stocke = null;
    const m = document.cookie.match(/(?:^|;\s*)customModels=([^;]*)/);
    try { stocke = m ? JSON.parse(decodeURIComponent(m[1])) : null; } catch (e) { stocke = null; }
    return {
      texteListe: liste ? liste.textContent.replace(/\s+/g, ' ').trim() : '',
      stocke: stocke,
      dansLocalStorage: !!localStorage.getItem('theologicus_custom_models'),
      /* le formulaire doit se vider après enregistrement */
      champVide: document.getElementById('cm-name').value === ''
    };
  });
  ok('le modèle est AJOUTÉ à la liste affichée', /Mon GPT local/.test(ajout.texteListe), ajout.texteListe.slice(0, 120));
  ok('il est PERSISTÉ (cookie) avec son ID et sa Base URL',
    Array.isArray(ajout.stocke) && ajout.stocke.some(m => m.model === 'gpt-4o-mini' && /api\.exemple\.test/.test(m.baseUrl)),
    JSON.stringify(ajout.stocke).slice(0, 160));
  ok('le formulaire se vide après enregistrement', ajout.champVide === true, String(ajout.champVide));

  // 5. le modèle rejoint le SÉLECTEUR de modèles (sinon il ne sert à rien)
  const selecteur = await page.evaluate(() => {
    const sel = document.getElementById('model-select') || document.querySelector('select[id*="model"]');
    if (!sel) return { trouve: false };
    const opts = Array.from(sel.options).map(o => o.value + '|' + o.textContent);
    return { trouve: true, id: sel.id, contient: opts.some(o => /gpt-4o-mini/.test(o)), n: opts.length };
  });
  ok('le modèle apparaît dans le sélecteur de modèles', selecteur.trouve && selecteur.contient, JSON.stringify(selecteur).slice(0, 160));

  // 6. suppression
  const suppr = await page.evaluate(async () => {
    const b = document.querySelector('#custom-models-list .cm-del, #custom-models-list [data-uid]');
    /* on cherche le bouton de suppression du premier modèle */
    const btn = Array.from(document.querySelectorAll('#custom-models-list button')).find(x => /🗑|SUPPR|Suppr/.test(x.textContent));
    if (!btn) return { bouton: false };
    btn.click();
    await new Promise(r => setTimeout(r, 500));
    const liste = document.getElementById('custom-models-list');
    return { bouton: true, texte: liste ? liste.textContent.replace(/\s+/g, ' ').trim() : '' };
  });
  ok('un modèle enregistré peut être SUPPRIMÉ', suppr.bouton && !/Mon GPT local/.test(suppr.texte), JSON.stringify(suppr).slice(0, 130));

  // 7. l'état vide doit GUIDER vers le formulaire (sinon on ne le trouve pas)
  const vide = await page.evaluate(async () => {
    const liste = document.getElementById('custom-models-list');
    await new Promise(r => setTimeout(r, 300));
    return liste ? liste.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  ok('l’état vide renvoie au formulaire (Nom / ID / Base URL)', /formulaire/i.test(vide) && /Base URL/i.test(vide), vide.slice(0, 140));

  // 8. VOIE UNIQUE : le raccourci du menu et le lien « configurer la clé API »
  //    doivent passer par le même chemin. Deux chemins qui divergent mènent
  //    toujours à deux endroits différents — c'est la cause du défaut.
  const unique = await page.evaluate(async () => {
    if (typeof window.__ouvrirModelesCustom !== 'function') return { existe: false };
    /* on repart d'un état DÉFAVORABLE : modal fermé, dernier onglet = « Modèle IA » */
    document.getElementById('settings-modal').classList.remove('active');
    localStorage.setItem('theologicus-settings-onglet', 'model');
    window.__ouvrirModelesCustom();
    await new Promise(r => setTimeout(r, 900));
    const panneau = document.getElementById('settings-panneau-providers');
    const e = document.getElementById('cm-name');
    const b = e.getBoundingClientRect();
    return {
      existe: true,
      onglet: window.__settingsOnglet,
      panneauVisible: !!(panneau && !panneau.hidden),
      champSurEcran: b.height > 8 && b.top >= 0 && b.top < window.innerHeight,
      haut: Math.round(b.top),
      hFenetre: window.innerHeight
    };
  });
  ok('une voie UNIQUE existe pour ouvrir les modèles custom', unique.existe === true, JSON.stringify(unique));
  ok('depuis un état défavorable, elle ouvre l’onglet Fournisseurs', unique.onglet === 'providers' && unique.panneauVisible === true, JSON.stringify(unique));
  ok('et elle AMÈNE le champ à l’écran (sans que l’utilisateur cherche)', unique.champSurEcran === true, JSON.stringify(unique));

  // le lien « configurer la clé API » doit router par cette même voie
  const lien = await page.evaluate(async () => {
    const t = await fetch('THEOLOGICUS.html').then(r => r.text());
    const i = t.indexOf('tt-open-settings-link');
    return { trouve: i >= 0, extrait: i >= 0 ? t.slice(i, i + 700) : '' };
  });
  ok('le lien « configurer la clé API » route par la MÊME voie',
    lien.trouve && /__ouvrirModelesCustom/.test(lien.extrait), lien.extrait.slice(0, 160));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/${total}`);
  process.exitCode = pass === total ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
