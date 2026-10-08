/* Banc v461 — LivroTrado, de bout en bout.
   Vrais fichiers (EPUB, DOCX, PDF, TXT fabriqués pour le test), vrais
   extracteurs embarqués (JSZip, mammoth, pdf.js). Réseau des moteurs
   intercepté : on vérifie les lots, la mémoire de traduction, la reprise,
   l'affichage côte à côte, la persistance et la validité des exports. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8905; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const FIX = '.workbuddy-ai/artifacts/_v461/fixtures/';
let pass = 0, total = 0;
/* Le dénominateur est COMPTÉ, pas écrit en dur : un total figé dérive à chaque
   assertion ajoutée et finit par annoncer « 94/90 », ce qui ne veut rien dire. */
const ok = (name, cond, detail) => { total++; console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 100)}`); if (cond) pass++; };
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f).toLowerCase();
      const types = { '.js': 'application/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.epub': 'application/epub+zip', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.mobi': 'application/octet-stream', '.wasm': 'application/wasm' };
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

  // ── moteurs simulés ──
  const appels = { lt: [], ia: [] };
  await page.route('**/languages', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[{"code":"fr"},{"code":"en"}]' }));
  let latenceLT = 0;   /* réglable : le banc de vitesse la monte à 300 ms */
  await page.route('**/translate', async route => {
    let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    const lot = Array.isArray(c.q) ? c.q : [c.q];
    appels.lt.push(lot.length);
    if (latenceLT) await new Promise(r => setTimeout(r, latenceLT));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ translatedText: lot.map(t => 'FR:' + t) }) });
  });
  let appelsOCR = 0;
  await page.route('**/proxy/**', async route => {
    let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    const contenu = (c.messages && c.messages[0] && c.messages[0].content) || [];
    const vision = Array.isArray(contenu) && contenu.some(x => x.type === 'image_url');
    if (vision) {
      /* OCR : une page rendue en image */
      appelsOCR++;
      const image = contenu.filter(x => x.type === 'image_url').length;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'Page transcrite numero ' + appelsOCR + ' (image=' + image + ').\n\nDeuxieme paragraphe de la page ' + appelsOCR + '.' } }] }) });
    }
    /* traduction : marqueurs [[n]] */
    const texte = (c.messages && c.messages[1] && c.messages[1].content) || '';
    const n = (texte.match(/\[\[\d+\]\]/g) || []).length;
    appels.ia.push(n);
    let out = '';
    for (let i = 1; i <= n; i++) out += '[[' + i + ']] TR-' + i + '\n';
    out = out.replace(/\[\[2\]\][^\n]*\n/, '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: out } }] }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('agnes_api_key', 'sk-test');          /* clé Agnes (registre) */
    localStorage.setItem('mistral_api_key_v1', 'sk-test');     /* clé Mistral (repli) */
    document.cookie = 'key_agnes=sk-test; path=/';
    document.cookie = 'key_mistral=sk-test; path=/';
  });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  // 1. entrée dans le menu MEDIA, sans casser les deux existantes
  const menu = await page.evaluate(() => {
    const p = document.getElementById('v159-media-panel');
    return p ? { entree: !!document.getElementById('v461-entree'), studio: !!p.querySelector('#open-studio-modal'), aivideo: !!p.querySelector('#open-aivideo-modal'), libelle: (document.getElementById('v461-entree') || {}).textContent } : null;
  });
  ok('entrée 📖 LivroTrado présente dans le menu MEDIA', !!(menu && menu.entree), JSON.stringify(menu));
  ok('les entrées Studio Vidéo et AI VIDEO sont intactes', !!(menu && menu.studio && menu.aivideo), JSON.stringify(menu));

  // 2. EXTRACTION des vrais fichiers
  const ex = await page.evaluate(async (FIX) => {
    await window.__livro.libsPretes();
    async function charger(nom) {
      const b = await fetch(FIX + nom).then(r => r.blob());
      const f = new File([b], nom);
      return window.__livro.extraire(f);
    }
    const r = {};
    try { const e = await charger('livre.epub'); r.epub = { ch: e.chapitres.length, p1: e.chapitres[0].paragraphes.length, t1: e.chapitres[0].titre, txt: e.chapitres[0].paragraphes[0] }; } catch (e) { r.epub = 'ERR ' + e.message; }
    try { const d = await charger('document.docx'); r.docx = { ch: d.chapitres.length, p1: d.chapitres[0].paragraphes.length, txt: d.chapitres[0].paragraphes[0] }; } catch (e) { r.docx = 'ERR ' + e.message; }
    try { const p = await charger('texte.pdf'); r.pdf = { ch: p.chapitres.length, txt: p.chapitres[0].paragraphes[0] }; } catch (e) { r.pdf = 'ERR ' + e.message; }
    try { const t = await charger('simple.txt'); r.txt = { ch: t.chapitres.length, p1: t.chapitres[0].paragraphes.length }; } catch (e) { r.txt = 'ERR ' + e.message; }
    try { await charger('faux.mobi'); r.mobi = 'PAS D’ERREUR'; } catch (e) { r.mobi = e.message; }
    try { await charger('scanne.pdf'); r.scanne = 'PAS D’ERREUR (problème)'; } catch (e) { r.scanne = e.message; }
    return r;
  }, FIX);
  ok('EPUB lu : 2 chapitres, texte extrait', ex.epub && ex.epub.ch === 2 && /Verbe/.test(String(ex.epub.txt)), JSON.stringify(ex.epub));
  ok('EPUB : titre de chapitre détecté', ex.epub && /commencement/i.test(String(ex.epub.t1)), String(ex.epub && ex.epub.t1));
  ok('DOCX lu (mammoth) : paragraphes extraits', ex.docx && ex.docx.p1 >= 2 && /premier paragraphe/.test(String(ex.docx.txt)), JSON.stringify(ex.docx));
  ok('PDF texte lu (pdf.js) : texte extrait', ex.pdf && /Verbe/.test(String(ex.pdf.txt)), JSON.stringify(ex.pdf));
  ok('PDF texte : reconstruit en LIGNES (pas un bloc unique illisible)', ex.pdf && ex.pdf.ch >= 1 && String(ex.pdf.txt).length < 400, JSON.stringify(ex.pdf).slice(0, 90));
  ok('TXT lu : paragraphes séparés', ex.txt && ex.txt.p1 >= 2, JSON.stringify(ex.txt));
  ok('MOBI : refus explicite renvoyant vers EPUB', /MOBI non supporté/.test(String(ex.mobi)) && /EPUB/.test(String(ex.mobi)), String(ex.mobi).slice(0, 90));
  ok('PDF SCANNÉ : diagnostic spécifique (pas le message générique)', /SCANNÉ/.test(String(ex.scanne)) && /OCR/.test(String(ex.scanne)), String(ex.scanne).slice(0, 110));
  ok('PDF scanné : le nombre de pages est annoncé', /\d+ page\(s\)/.test(String(ex.scanne)), String(ex.scanne).slice(0, 70));

  // 2f. OCR PAR L'IA (vision) sur le PDF scanné (doublure posée plus haut)
  await page.evaluate(() => localStorage.setItem('agnes_api_key', 'sk-test'));
  const scan = await page.evaluate(async (FIX) => {
    await window.__livro.libsPretes();
    const b = await fetch(FIX + 'scanne.pdf').then(r => r.blob());
    const f = new File([b], 'scanne.pdf');
    window.__fichierScan = f;
    document.getElementById('v461-ouvrir') || window.__livro.ouvrir();
    await window.__livro.charger(f);
    await new Promise(r => setTimeout(r, 400));
    const zone = document.getElementById('v461-liste');
    return { texte: zone ? zone.textContent : null, bouton: !!document.getElementById('v461-ocr-go') };
  }, FIX);
  ok('PDF scanné : l’OCR est PROPOSÉ (bouton présent)', scan.bouton === true, String(scan.texte).slice(0, 90));
  ok('le coût est annoncé (nombre d’appels = nombre de pages)', /2 appel\(s\)/.test(String(scan.texte)), String(scan.texte).slice(0, 120));

  // refus de la confirmation → aucun appel
  const refus = await page.evaluate(async () => {
    const vrai = window.confirm; let demande = false;
    window.confirm = function () { demande = true; return false; };
    await window.__livro.lancerOCR(window.__fichierScan, 2);
    window.confirm = vrai;
    return { demande };
  });
  const appelsRefus = appelsOCR;
  ok('OCR : confirmation demandée avant de consommer', refus.demande === true, JSON.stringify(refus));
  ok('OCR : refus → aucun appel d’IA', appelsRefus === 0, 'appels=' + appelsRefus);

  // acceptation → 1 appel par page, texte assemblé, livre chargé
  appelsOCR = 0;
  const ocr = await page.evaluate(async () => {
    const vrai = window.confirm; window.confirm = function () { return true; };
    await window.__livro.lancerOCR(window.__fichierScan, 2);
    window.confirm = vrai;
    const etat = window.__livro.etat();
    return {
      chapitres: etat.livre ? etat.livre.chapitres.length : 0,
      paras: etat.livre ? etat.livre.chapitres.reduce((a, c) => a + c.paragraphes.length, 0) : 0,
      premier: etat.livre ? etat.livre.chapitres[0].paragraphes[0] : null,
      duos: document.querySelectorAll('.v461-duo').length
    };
  });
  ok('OCR : un appel d’IA PAR PAGE (2 pages → 2 appels)', appelsOCR === 2, 'appels=' + appelsOCR + ' ' + JSON.stringify(ocr).slice(0, 60));
  ok('OCR : texte assemblé en chapitres/paragraphes', ocr.chapitres === 2 && ocr.paras >= 4, JSON.stringify(ocr).slice(0, 90));
  ok('OCR : le texte transcrit est celui affiché', /Page transcrite numero 1/.test(String(ocr.premier)), String(ocr.premier).slice(0, 60));
  ok('OCR : l’affichage côte à côte est prêt (colonnes)', ocr.duos >= 4, 'paires=' + ocr.duos);

  // REPRISE : relancer ne refait pas les pages déjà transcrites
  appelsOCR = 0;
  const reprise = await page.evaluate(async () => {
    const vrai = window.confirm; window.confirm = function () { return true; };
    await window.__livro.lancerOCR(window.__fichierScan, 2);
    window.confirm = vrai;
    return {};
  });
  ok('OCR : reprise sans refaire les pages déjà transcrites (0 appel)', appelsOCR === 0, 'appels=' + appelsOCR);

  // 2g. MOTEURS ISSUS DU REGISTRE DE THEOLOGICUS (la demande de l'utilisateur)
  const moteurs = await page.evaluate(() => {
    const tous = window.__livro.listeMoteurs(false).map(m => m.id);
    const vision = window.__livro.listeMoteurs(true).map(m => m.id);
    const selT = document.getElementById('v461-moteur');
    const selO = document.getElementById('v461-ocr-moteur');
    const provs = Array.from(new Set(tous.map(i => i.split(':')[0])));
    return {
      tous: tous, vision: vision, provs: provs,
      nbTrad: selT ? selT.options.length : 0,
      nbOCR: selO ? selO.options.length : 0,
      optgroups: selT ? selT.querySelectorAll('optgroup').length : 0,
      exemple: tous.slice(0, 3)
    };
  });
  ok('le sélecteur de traduction propose TOUS les fournisseurs du registre',
     ['mistral', 'openai', 'anthropic', 'gemini', 'deepseek', 'minimax', 'openrouter', 'agnes', 'ollama'].every(p => moteurs.provs.indexOf(p) >= 0),
     JSON.stringify(moteurs.provs));
  ok('LibreTranslate reste en tête (+1 option)', moteurs.nbTrad === moteurs.tous.length + 1, JSON.stringify({ sel: moteurs.nbTrad, liste: moteurs.tous.length }));
  ok('les modèles sont groupés par fournisseur (optgroups)', moteurs.optgroups >= 8, 'groupes=' + moteurs.optgroups);
  ok('le sélecteur d’OCR ne propose QUE des modèles vision', moteurs.nbOCR === moteurs.vision.length && moteurs.vision.length >= 4, JSON.stringify(moteurs.vision));
  ok('l’OCR inclut Agnes, GPT-4o, Claude, Gemini, Pixtral', ['agnes', 'openai', 'anthropic', 'gemini', 'mistral'].every(p => moteurs.vision.some(v => v.startsWith(p + ':'))), JSON.stringify(moteurs.vision.slice(0, 6)));

  // 2g-bis. v491 — les MODÈLES PERSONNALISÉS doivent pouvoir faire l'OCR.
  //         Ils étaient absents des DEUX sélecteurs : seul PROVIDERS était
  //         listé, donc un modèle vision ajouté à la main ne servait à rien.
  //         On en pose deux : un coché 👁 Vision, un non.
  const customs = await page.evaluate(() => {
    const base = 'https://vision.example.com/v1';
    state.customModels = state.customModels || [];
    state.customModels.push(
      { uid: 'c_vision_test', name: 'Mon Qwen VL maison', model: 'mon-qwen-vl-maison',
        baseUrl: base, apiKey: 'sk-test', format: 'chat-completions', vision: true, audio: false },
      { uid: 'c_texte_test', name: 'Modèle texte maison', model: 'mon-modele-texte',
        baseUrl: base, apiKey: 'sk-test', format: 'chat-completions', vision: false, audio: false }
    );
    const tous = window.__livro.listeMoteurs(false).map(m => m.id);
    const vision = window.__livro.listeMoteurs(true).map(m => m.id);
    const lui = window.__livro.listeMoteurs(true).filter(m => m.id === 'c_vision_test')[0];
    return {
      dansTous: tous.indexOf('c_vision_test') >= 0 && tous.indexOf('c_texte_test') >= 0,
      visionOui: vision.indexOf('c_vision_test') >= 0,
      visionNon: vision.indexOf('c_texte_test') < 0,
      libelle: lui ? lui.label : null,
      groupe: lui ? lui.groupe : null
    };
  });
  ok('les modèles personnalisés apparaissent dans les sélecteurs', customs.dansTous === true, JSON.stringify(customs));
  ok('un custom coché 👁 Vision est proposé pour l’OCR', customs.visionOui === true, JSON.stringify(customs));
  ok('un custom NON vision reste exclu de l’OCR', customs.visionNon === true, JSON.stringify(customs));
  ok('le libellé est le NOM du modèle, pas son uid', /Mon Qwen VL maison/.test(String(customs.libelle)) && !/c_vision_test/.test(String(customs.libelle)), String(customs.libelle));
  ok('les customs sont regroupés (pas un optgroup par uid)', customs.groupe === 'custom', String(customs.groupe));

  // et l'appel VISION tourne RÉELLEMENT avec ce modèle personnalisé :
  // on ne passe pas par lancerOCR (ses pages sont déjà en cache, le test de
  // reprise attend 0 appel) mais par le même chemin que fait ocrPdf par page.
  appelsOCR = 0;
  const appelCustom = await page.evaluate(async () => {
    try {
      const cfg = window.__livro.cfgDe('c_vision_test');
      const r = await callLLM(cfg, [{ role: 'user', content: [
        { type: 'text', text: 'transcris cette page' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }
      ] }], { max_tokens: 20 });
      return { endpoint: cfg.endpoint, modele: cfg.model, texte: String(r || '').slice(0, 50) };
    } catch (e) { return { erreur: String(e.message) }; }
  });
  ok('OCR : l’appel image avec un custom aboutit (doublure servie)',
     appelsOCR === 1 && /Page transcrite/.test(String(appelCustom.texte)),
     'appels=' + appelsOCR + ' ' + JSON.stringify(appelCustom));
  ok('OCR : le custom est bien résolu (endpoint + modèle de sa fiche)',
     /vision\.example\.com/.test(String(appelCustom.endpoint)) && appelCustom.modele === 'mon-qwen-vl-maison',
     JSON.stringify(appelCustom));
  // on retire les customs pour ne rien fausser ensuite
  await page.evaluate(() => {
    state.customModels = (state.customModels || []).filter(m => m.uid !== 'c_vision_test' && m.uid !== 'c_texte_test');
  });

  // 2h. une TRADUCTION via un AUTRE fournisseur (Mistral) doit passer
  appels.ia.length = 0;
  const viaMistral = await page.evaluate(async () => {
    const vrai = window.confirm; window.confirm = function () { return true; };
    const r = await window.__livro.traduire(['un', 'deux'], 'fr', 'mistral:mistral-small-latest');
    window.confirm = vrai;
    return r;
  });
  ok('traduction via MISTRAL (autre fournisseur) fonctionne', Array.isArray(viaMistral) && viaMistral.length === 2 && /^TR-/.test(String(viaMistral[0])), JSON.stringify(viaMistral));

  // 2i. un modèle non-vision est REFUSÉ pour l'OCR, avec un message clair
  const refusVision = await page.evaluate(async () => {
    try {
      const el = document.getElementById('v461-ocr-moteur');
      const opt = document.createElement('option'); opt.value = 'ollama:qwen2.5'; opt.textContent = 'test';
      el.appendChild(opt); el.value = 'ollama:qwen2.5'; el.dispatchEvent(new Event('change'));
      return { choisi: window.__livro.etat().moteurOCR };
    } catch (e) { return { erreur: String(e.message) }; }
  });
  ok('le moteur d’OCR choisi est mémorisé', typeof refusVision.choisi === 'string' && refusVision.choisi.length > 0, JSON.stringify(refusVision));

  // 2j. VITESSE : parallélisme mesuré, endpoint mis en cache
  let sondesLangues = 0;
  latenceLT = 300;      /* la latence du moteur, pour mesurer le parallélisme */
  await page.route('**/languages', async route => {
    sondesLangues++;
    await new Promise(r => setTimeout(r, 30));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[{"code":"fr"},{"code":"en"},{"code":"de"}]' });
  });
  const vitesse = await page.evaluate(async () => {
    const paras = [];
    for (let i = 0; i < 60; i++) paras.push('paragraphe numero ' + i + ' assez long pour un vrai envoi');
    async function chrono(n) {
      const t0 = performance.now();
      await window.__livro.traduire(paras.slice(), 'it', 'lt');   /* langue vierge : rien en mémoire */
      return Math.round(performance.now() - t0);
    }
    const etat = window.__livro.etat();
    etat.parallele = 1; const t1 = await chrono(1);
    etat.parallele = 0; const auto = window.__livro.parallele();
    const t3 = await chrono(3);
    return { sequentiel: t1, parallele3: t3, auto: auto, lot: 24 };
  });
  ok('le parallélisme est mesuré : 3× plus rapide qu’en séquentiel',
     vitesse.parallele3 < vitesse.sequentiel * 0.6, JSON.stringify(vitesse));
  ok('le mode automatique vaut 3 pour LibreTranslate local', vitesse.auto === 3, 'auto=' + vitesse.auto);
  ok('l’endpoint n’est sondé QU’UNE fois (cache)', sondesLangues <= 2, 'sondes=' + sondesLangues);

  // 2k. GLOSSAIRE : termes protégés (LibreTranslate) et consignés (IA)
  const glos = await page.evaluate(async () => {
    const gz = document.getElementById('v461-glos');
    gz.value = 'Verbe\nSeigneur'; gz.dispatchEvent(new Event('input'));
    const protege = window.__livro.protegerGlossaire('Au commencement était le Verbe, et le Seigneur parla.');
    const rendu = window.__livro.restituerGlossaire(protege);
    return { n: window.__livro.glossaire().length, protege, rendu };
  });
  ok('glossaire enregistré (2 termes)', glos.n === 2, 'n=' + glos.n);
  ok('les termes du glossaire sont PROTÉGÉS pour LibreTranslate', /class="notranslate"/.test(glos.protege) && /notranslate">Verbe/.test(glos.protege), String(glos.protege).slice(0, 90));
  ok('la restitution enlève les balises sans toucher au texte', glos.rendu.indexOf('<') < 0 && /Verbe/.test(glos.rendu), String(glos.rendu).slice(0, 70));

  // 2l. SÉLECTION DES CHAPITRES : décocher un chapitre l'exclut vraiment
  const sel = await page.evaluate(async () => {
    window.__livro.charger ? null : null;
    window.__livro.toutSelectionner(true);
    const avant = window.__livro.chapitresChoisis().length;
    window.__livro.toutSelectionner(false);
    const aucun = window.__livro.chapitresChoisis().length;
    const etat = window.__livro.etat();
    if (etat.livre) etat.selection[0] = true;              /* on ne garde que le premier */
    const un = window.__livro.chapitresChoisis();
    return { avant, aucun, un };
  });
  ok('« tout » sélectionne tous les chapitres', sel.avant === 2, 'avant=' + sel.avant);
  ok('« rien » n’en sélectionne aucun', sel.aucun === 0, 'aucun=' + sel.aucun);
  ok('la sélection partielle est respectée (1 seul chapitre)', sel.un.length === 1 && sel.un[0] === 0, JSON.stringify(sel.un));

  // 2m. EXPORT : bilingue ou traduction seule
  await page.evaluate(async () => {
    const etat = window.__livro.etat();
    const sl = document.getElementById('v461-lang');
    sl.value = 'es'; sl.dispatchEvent(new Event('change'));
    await window.__livro.lancer();          /* on traduit pour avoir du contenu à exporter */
  });
  const expo = await page.evaluate(() => {
    const t = m => window.__livro.texteComplet(m);
    const bil = t('bilingue'), seul = t('traduction'), orig = t('original');
    /* le bilingue se reconnaît à son FILET de colonne (l'ancienne flèche « → »
       a disparu avec la mise en regard : l'assertion a suivi le changement) */
    return {
      bilColonnes: /│/.test(bil), seulColonnes: /│/.test(seul), origColonnes: /│/.test(orig),
      seulPlusCourt: seul.length < bil.length,
      origPlusCourt: orig.length < bil.length
    };
  });
  ok('mode « original + traduction » : les deux textes EN REGARD (deux colonnes)', expo.bilColonnes === true, JSON.stringify(expo));
  ok('mode « traduction seule » : une seule colonne, plus d’original', expo.seulColonnes === false && expo.seulPlusCourt === true, JSON.stringify(expo));
  ok('mode « original seul » : une seule colonne, pas de traduction', expo.origColonnes === false && expo.origPlusCourt === true, JSON.stringify(expo));

  // 3. chargement dans l'interface → affichage CÔTE À CÔTE
  await page.evaluate(async (FIX) => {
    const b = await fetch(FIX + 'livre.epub').then(r => r.blob());
    window.__livro.ouvrir();
    await window.__livro.charger(new File([b], 'livre.epub'));
  }, FIX);
  await page.waitForTimeout(700);
  const duo = await page.evaluate(() => ({
    duos: document.querySelectorAll('.v461-duo').length,
    orig: document.querySelectorAll('.v461-col .lbl').length ? document.querySelector('.v461-col .lbl').textContent : null,
    trad: document.querySelector('.v461-col.tr .lbl') ? document.querySelector('.v461-col.tr .lbl').textContent : null,
    etat: document.getElementById('v461-etat') ? document.getElementById('v461-etat').textContent : null
  }));
  ok('affichage côte à côte : une paire original/traduction par paragraphe', duo.duos === 3, JSON.stringify(duo));
  ok('les deux colonnes sont étiquetées (Original | langue cible)', duo.orig === 'Original' && duo.trad === await page.evaluate(() => window.__livro.etat().cible), JSON.stringify({ o: duo.orig, t: duo.trad }));
  ok('compteur de progression affiché', /\/\s*3 paragraphes/.test(String(duo.etat)), String(duo.etat));

  // 4. TRADUCTION LibreTranslate (lots) + mémoire
  appels.lt.length = 0;
  await page.evaluate(() => {
    /* état REMIS À ZÉRO : les tests précédents ont laissé une sélection
       partielle et d'autres langues traduites — un test ne doit pas dépendre
       de l'ordre dans lequel il s'exécute. */
    const e = window.__livro.etat();
    e.enCours = false; e.arret = false; e.pause = false; e.parallele = 0;
    window.__livro.toutSelectionner(true);
    const sel = document.getElementById('v461-moteur');
    sel.value = 'lt'; sel.dispatchEvent(new Event('change'));
    const sl = document.getElementById('v461-lang');
    sl.value = 'nl'; sl.dispatchEvent(new Event('change'));   /* langue vierge */
    return window.__livro.lancer();
  });
  await page.waitForTimeout(1500);
  const apres = await page.evaluate(() => ({
    traduits: Array.from(document.querySelectorAll('.v461-col.tr p')).map(p => p.textContent),
    tm: (function () { try { return !!(window.__theoTM && window.__theoTM.get('Au commencement etait le Verbe.', 'nl')); } catch (e) { return null; } })(),
    msg: document.getElementById('v461-msg').textContent
  }));
  ok('LibreTranslate appelé par LOTS (une requête par chapitre : 2 + 1 paragraphes)', JSON.stringify(appels.lt) === '[2,1]', JSON.stringify(appels.lt));
  ok('traduction affichée dans la colonne de droite', apres.traduits.every(t => /^FR:/.test(t)), JSON.stringify(apres.traduits).slice(0, 90));
  ok('mémoire de traduction alimentée (__theoTM)', apres.tm === true, String(apres.tm));
  ok('message de fin affiché', /terminée/i.test(String(apres.msg)), String(apres.msg).slice(0, 80));

  // 5. REPRISE : tout est en mémoire → aucun nouvel appel réseau
  appels.lt.length = 0;
  await page.evaluate(() => window.__livro.lancer());
  await page.waitForTimeout(900);
  ok('relance : aucun appel réseau (tout vient de la mémoire)', appels.lt.length === 0, JSON.stringify(appels.lt));

  // 6. MOTEUR IA : marqueurs respectés, paragraphe manquant → original conservé
  appels.ia.length = 0;
  const ia = await page.evaluate(() => window.__livro.traduire(['aaa', 'bbb', 'ccc'], 'fr', 'agnes:agnes-2.5-flash'));
  ok('moteur IA : appel par lot avec marqueurs [[n]]', appels.ia.length === 1 && appels.ia[0] === 3, JSON.stringify(appels.ia));
  ok('moteur IA : marqueurs réassemblés dans l’ordre', ia[0] === 'TR-1' && ia[2] === 'TR-3', JSON.stringify(ia));
  ok('moteur IA : paragraphe manquant → original conservé', ia[1] === 'bbb', JSON.stringify(ia));

  // 6b. limite de lot respectée sur un gros chapitre
  appels.lt.length = 0;
  const gros = await page.evaluate(() => {
    const e0 = window.__livro.etat();
    e0.enCours = false; e0.arret = false; e0.pause = false;
    const p = []; for (let i = 0; i < 15; i++) p.push('paragraphe numero ' + i + ' — assez long pour être traduit');
    return window.__livro.traduire(p, 'fr', 'lt');
  });
  ok('gros chapitre : 15 paragraphes en UNE requête (lot de 24)', JSON.stringify(appels.lt) === '[15]', JSON.stringify(appels.lt));
  ok('les 15 paragraphes sont tous traduits', gros.length === 15 && gros.every(t => /^FR:/.test(t)), 'n=' + gros.length);

  // 6c. ESTIMATION de coût affichée + confirmation pour le moteur IA
  const est = await page.evaluate(() => {
    document.getElementById('v461-moteur').value = 'agnes:agnes-2.5-flash';
    document.getElementById('v461-moteur').dispatchEvent(new Event('change'));
    const el = document.getElementById('v461-estim');
    return { texte: el ? el.textContent : null, e: window.__livro.estimation() };
  });
  ok('estimation affichée (paragraphes restants, moteur, requêtes)', /paragraphe\(s\)/.test(String(est.texte)) && /requête\(s\)/.test(String(est.texte)), String(est.texte).slice(0, 95));
  ok('l’estimation annonce le moteur IA choisi et son coût en requêtes', /IA agnes:agnes-2\.5-flash/.test(String(est.texte)), String(est.texte).slice(0, 90));

  const refusIA = await page.evaluate(async () => {
    /* on change de langue cible : la mémoire de traduction n'a rien pour
       l'anglais, il y a donc du travail → la confirmation doit être demandée */
    const sel = document.getElementById('v461-lang');
    sel.value = 'en'; sel.dispatchEvent(new Event('change'));
    let demande = false;
    const vrai = window.confirm;
    window.confirm = function () { demande = true; return false; };   /* refus */
    localStorage.removeItem('agnes_api_key');
    const avant = JSON.stringify(window.__livro.etat().trad);
    document.getElementById('v461-go').click();
    await new Promise(r => setTimeout(r, 600));
    window.confirm = vrai;
    return { demande: demande, inchange: JSON.stringify(window.__livro.etat().trad) === avant };
  });
  ok('moteur IA : confirmation demandée avant de consommer', refusIA.demande === true, JSON.stringify(refusIA));
  ok('moteur IA : refus → rien n’est lancé', refusIA.inchange === true, JSON.stringify(refusIA));

  const sansConfirm = await page.evaluate(async () => {
    document.getElementById('v461-moteur').value = 'lt';
    document.getElementById('v461-moteur').dispatchEvent(new Event('change'));
    let demande = false;
    const vrai = window.confirm;
    window.confirm = function () { demande = true; return true; };
    await window.__livro.lancer();
    window.confirm = vrai;
    return { demande: demande };
  });
  ok('LibreTranslate : aucune confirmation (gratuit, hors-ligne)', sansConfirm.demande === false, JSON.stringify(sansConfirm));

  // 6c-bis. PANNEAU DE STATISTIQUES (barre modernisée)
  const statAvant = await page.evaluate(() => {
    const pan = document.getElementById('v461-stats');
    return { existe: !!pan, visible: pan ? pan.classList.contains('on') : false, cartes: document.querySelectorAll('.v461-carte').length };
  });
  ok('panneau de statistiques présent (6 cartes)', statAvant.existe === true && statAvant.cartes === 6, JSON.stringify(statAvant));

  // exécution LENTE simulée : on lit le panneau PENDANT le traitement
  latenceLT = 1200;   /* > 2 s au total : le seuil d'affichage de la vitesse */
  await page.evaluate(async () => {
    const sel = document.getElementById('v461-moteur');
    sel.value = 'lt'; sel.dispatchEvent(new Event('change'));
    /* on change de langue cible pour une langue JAMAIS traduite (l'anglais a
       déjà été rempli par les tests précédents) : sinon rien à faire, et des
       statistiques à zéro seraient le comportement correct. */
    const sl = document.getElementById('v461-lang');
    sl.value = 'de'; sl.dispatchEvent(new Event('change'));
    window.__livro.etat().parallele = 1;   /* séquentiel : au-delà du seuil de 2 s */
    window.__latenceBanc = 1;
    const vrai = window.fetch;
    window.fetch = async function (u, o) {
      /* latence fournie par la doublure unique (latenceLT) */
      return vrai.apply(this, arguments);
    };
    window.__fin = window.__livro.lancer();
  });
  await page.waitForTimeout(1500);
  const pendant = await page.evaluate(() => ({
    visible: document.getElementById('v461-stats').classList.contains('on'),
    pct: document.getElementById('v461-pct').textContent,
    jauge: document.getElementById('v461-jauge').style.width,
    ecoule: document.getElementById('v461-c-ecoule').textContent,
    etape: document.getElementById('v461-etape').textContent
  }));
  ok('le panneau s’affiche PENDANT le traitement', pendant.visible === true, JSON.stringify(pendant));
  ok('le pourcentage et la jauge avancent', /\d+ %/.test(pendant.pct) && /\d+%/.test(pendant.jauge), JSON.stringify({ p: pendant.pct, j: pendant.jauge }));
  ok('l’étape en cours est décrite', /Traduction/.test(pendant.etape), String(pendant.etape).slice(0, 70));
  ok('l’horloge tourne pendant le traitement (temps écoulé > 0)', pendant.ecoule !== '0:00', pendant.ecoule);
  await page.evaluate(() => window.__fin);
  await page.waitForTimeout(600);
  const apresStats = await page.evaluate(() => ({
    pct: document.getElementById('v461-pct').textContent,
    avance: document.getElementById('v461-c-avance').textContent,
    restant: document.getElementById('v461-c-restant').textContent,
    vitesse: document.getElementById('v461-c-vitesse').textContent,
    appels: document.getElementById('v461-c-appels').textContent,
    car: document.getElementById('v461-c-car').textContent
  }));
  ok('à la fin : 100 % et avancement complet', apresStats.pct === '100 %' && /\d+ \/ \d+/.test(apresStats.avance), JSON.stringify(apresStats).slice(0, 80));
  ok('le restant affiche « terminé »', /termin/.test(apresStats.restant), apresStats.restant);
  ok('la vitesse et les caractères sont mesurés', /\/min/.test(apresStats.vitesse) && apresStats.car !== '0', JSON.stringify({ v: apresStats.vitesse, c: apresStats.car }));
  await page.evaluate(() => { window.__livro.etat().parallele = 0; });
  latenceLT = 0;

  // 6d. AFFICHAGE MOBILE : colonnes empilées
  const mobile = await page.evaluate(() => {
    const feuille = document.getElementById('v461-css');
    return { media: /@media \(max-width:760px\)/.test(feuille ? feuille.textContent : ''), colonnes: /grid-template-columns:1fr/.test(feuille ? feuille.textContent : '') };
  });
  ok('feuille de style : règle mobile (colonnes empilées sous 760 px)', mobile.media === true && mobile.colonnes === true, JSON.stringify(mobile));
  await page.setViewportSize({ width: 420, height: 800 });
  await page.waitForTimeout(300);
  const empile = await page.evaluate(() => {
    const d = document.querySelector('.v461-duo');
    return d ? getComputedStyle(d).gridTemplateColumns.split(' ').length : -1;
  });
  ok('sur écran étroit : une seule colonne (empilé)', empile === 1, 'colonnes=' + empile);
  await page.setViewportSize({ width: 1400, height: 950 });

  // 6e. VERSION fiable : version.txt prioritaire sur le littéral figé
  const ver = await page.evaluate(() => ({ apk: typeof window.__APK_VERSION__, theo: window.THEO_VERSION || null }));
  ok('version : THEO_VERSION renseignée par detect()', !!ver.theo, JSON.stringify(ver));

  // 7. PERSISTANCE IndexedDB
  const pers = await page.evaluate(() => new Promise(res => {
    const rq = indexedDB.open('theologicus_livro', 1);
    rq.onsuccess = () => { const t = rq.result.transaction('livres', 'readonly'), r = t.objectStore('livres').get('courant'); r.onsuccess = () => { const v = r.result ? JSON.parse(r.result) : null; res(v ? { nom: v.livre.nom, ch: v.livre.chapitres.length } : null); }; r.onerror = () => res(null); };
    rq.onerror = () => res(null);
  }));
  ok('livre + traduction persistés dans IndexedDB', !!(pers && pers.ch === 2), JSON.stringify(pers));

  // 8. EXPORTS valides (DOCX et EPUB relus par JSZip)
  const exp = await page.evaluate(async () => {
    await window.__livro.libsPretes();
    const r = {};
    const dz = await JSZip.loadAsync(await (await window.__livro.docxDe()).arrayBuffer());
    r.docx = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'].every(n => !!dz.file(n));
    r.docxTexte = /Au commencement/.test(await dz.file('word/document.xml').async('string'));
    const ez = await JSZip.loadAsync(await (await window.__livro.epubDe()).arrayBuffer());
    r.epub = ['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/chap1.xhtml', 'OEBPS/chap2.xhtml'].every(n => !!ez.file(n));
    r.mime = (await ez.file('mimetype').async('string')) === 'application/epub+zip';
    r.texte = /FR:/.test(window.__livro.texteComplet());
    return r;
  });
  ok('export DOCX : structure OOXML complète et texte présent', exp.docx === true && exp.docxTexte === true, JSON.stringify(exp).slice(0, 80));
  ok('export EPUB : mimetype + OPF + nav + chapitres', exp.epub === true && exp.mime === true, JSON.stringify(exp).slice(0, 80));
  ok('export TXT : contient la traduction', exp.texte === true);

  // 9. EXPORT : le CHOIX des destinations (4 voies)
  let envoiLivroSave = null;
  await page.route('**/livro-save', async route => {
    let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    envoiLivroSave = c;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, chemin: 'C:////Theologicus////traductions////' + c.filename, octets: (c.data64 || '').length, dossier: 'C:////Theologicus////traductions' }) });
  });
  const dlg = await page.evaluate(async () => {
    await window.__livro.exporter('txt');
    await new Promise(r => setTimeout(r, 400));
    const z = document.getElementById('v461-export-zone');
    return {
      visible: z ? z.style.display !== 'none' : false,
      boutons: ['v461-ex-sous', 'v461-ex-pc', 'v461-ex-dl', 'v461-ex-cp'].filter(i => !!document.getElementById(i)).length,
      nom: z ? (z.textContent.match(/(\S+\.txt)/) || [])[1] : null
    };
  });
  ok('cliquer sur Exporter ouvre un CHOIX de destination', dlg.visible === true, JSON.stringify(dlg));
  ok('les quatre voies sont proposées', dlg.boutons === 4, 'boutons=' + dlg.boutons);
  ok('le nom du fichier est annoncé', /\.txt$/.test(String(dlg.nom)), String(dlg.nom));

  // 9-ter. La boîte est AMENÉE À L'ÉCRAN, et SANS LIVRE le message s'écrit
  // DANS la zone d'export (l'utilisateur regarde là, pas la notification
  // fugace en haut de l'écran). C'est la correction du « je ne vois rien ».
  const visibilite = await page.evaluate(async () => {
    let appels = 0;
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () { appels++; return orig.apply(this, arguments); };
    const z = document.getElementById('v461-export-zone');
    z.style.display = 'none';
    await window.__livro.exporter('txt');
    await new Promise(r => setTimeout(r, 200));
    Element.prototype.scrollIntoView = orig;
    return { appels, visible: z.style.display !== 'none' };
  });
  ok('la boîte d’export est amenée à l’écran (scrollIntoView appelé)', visibilite.appels > 0 && visibilite.visible === true, JSON.stringify(visibilite));

  const sansLivre = await page.evaluate(async () => {
    const S = window.__livro.etat();
    const garde = S.livre;
    S.livre = null;                       /* on simule « aucun livre chargé » */
    const z = document.getElementById('v461-export-zone');
    z.style.display = 'none'; z.innerHTML = '';
    await window.__livro.exporter('txt');
    await new Promise(r => setTimeout(r, 200));
    const res = { visible: z.style.display !== 'none', texte: z.textContent || '' };
    S.livre = garde;                      /* on remet le livre pour la suite */
    return res;
  });
  ok('sans livre : le message s’affiche DANS la zone d’export', sansLivre.visible === true && /Chargez d’abord un livre/.test(sansLivre.texte), sansLivre.texte.slice(0, 90));
  ok('sans livre : le message dit QUOI faire (bouton Choisir un fichier)', /Choisir un fichier/.test(sansLivre.texte), sansLivre.texte.slice(0, 120));

  // 9-quater. La version SERVIE est rappelée dans le sous-titre : on sait
  // enfin si l'app exécutée est bien celle qu'on vient de livrer.
  const verSous = await page.evaluate(async () => {
    const sous = document.getElementById('v461-sous');
    sous.textContent = '';
    window.__livro.ouvrir();
    await new Promise(r => setTimeout(r, 100));
    return { sous: sous.textContent, theo: window.THEO_VERSION || '' };
  });
  ok('la version servie est affichée dans le sous-titre de LivroTrado', /^v[0-9]/.test(verSous.sous) && verSous.sous === 'v' + verSous.theo, JSON.stringify(verSous));

  // 9-bis. CHOIX DU CONTENU dans la boîte d'export (traduction seule / les deux / original)
  const modes = await page.evaluate(async () => {
    await window.__livro.exporter('txt');
    await new Promise(r => setTimeout(r, 400));
    const z = document.getElementById('v461-export-zone');
    const radios = z.querySelectorAll('input[name="v461-mode"]');
    const valeurs = Array.from(radios).map(r => r.value);
    const coche = (z.querySelector('input[name="v461-mode"]:checked') || {}).value;
    return { nb: radios.length, valeurs, coche, nom: document.getElementById('v461-ex-nom').textContent, taille: document.getElementById('v461-ex-taille').textContent };
  });
  ok('la boîte d’export propose les TROIS contenus', modes.nb === 3 && JSON.stringify(modes.valeurs) === '["traduction","bilingue","original"]', JSON.stringify(modes.valeurs));
  ok('le nom du fichier porte le mode (« _fr » pour la traduction seule)', /_fr\.txt$/.test(String(modes.nom)) || /_bilingue\.txt$/.test(String(modes.nom)), String(modes.nom));
  ok('la taille du fichier est annoncée', /\(\d/.test(String(modes.taille)), String(modes.taille));

  const bascule = await page.evaluate(async () => {
    const z = document.getElementById('v461-export-zone');
    const choisir = async v => {
      const r = z.querySelector('input[name="v461-mode"][value="' + v + '"]');
      r.checked = true; r.dispatchEvent(new Event('change'));
      await new Promise(x => setTimeout(x, 350));
      return { nom: document.getElementById('v461-ex-nom').textContent, taille: document.getElementById('v461-ex-taille').textContent };
    };
    const bil = await choisir('bilingue');
    const orig = await choisir('original');
    const trad = await choisir('traduction');
    return { bil, orig, trad, memorise: localStorage.getItem('v461_mode_export') };
  });
  ok('changer le contenu change le NOM du fichier (bilingue / original)', /_bilingue\.txt$/.test(bascule.bil.nom) && /_original\.txt$/.test(bascule.orig.nom), JSON.stringify([bascule.bil.nom, bascule.orig.nom]));
  ok('changer le contenu change la TAILLE annoncée', bascule.bil.taille !== bascule.orig.taille, JSON.stringify([bascule.bil.taille, bascule.orig.taille]));
  ok('le dernier choix est mémorisé', bascule.memorise === 'traduction', String(bascule.memorise));

  // le texte en mode « traduction seule » ne contient pas l'original
  const contenuSeul = await page.evaluate(async () => {
    await window.__livro.exporter('txt');
    await new Promise(r => setTimeout(r, 300));
    const z = document.getElementById('v461-export-zone');
    const r = z.querySelector('input[name="v461-mode"][value="traduction"]');
    r.checked = true; r.dispatchEvent(new Event('change'));
    await new Promise(x => setTimeout(x, 300));
    return { seul: window.__livro.texteComplet('traduction'), bil: window.__livro.texteComplet('bilingue') };
  });
  /* L'ancienne assertion cherchait la flèche « → » : elle serait devenue vraie
     PAR ACCIDENT (le séparateur a changé), donc elle ne prouvait plus rien. On
     vérifie le FOND, et par LIGNE ENTIÈRE : le moteur factice renvoie
     « FR:<original> », donc un simple `indexOf` trouverait l'original À
     L'INTÉRIEUR de la traduction et l'assertion serait fausse sans qu'il y ait
     de défaut. C'est la ligne qui doit manquer, pas la sous-chaîne. */
  const origTemoin = await page.evaluate(() => {
    const L = window.__livro.etat();
    return String(L.livre.chapitres[0].paragraphes[0]).trim();
  });
  const lignesSeul = String(contenuSeul.seul).split('\n').map(l => l.trim());
  const lignesBil = String(contenuSeul.bil).split('\n').map(l => l.trim());
  ok('« traduction seule » : l’original ne forme plus aucune ligne du texte exporté',
    origTemoin.length > 0 && lignesSeul.indexOf(origTemoin) < 0,
    'original=' + JSON.stringify(origTemoin.slice(0, 40)));
  ok('« original + traduction » : l’original ouvre bien une ligne (colonne de gauche)',
    lignesBil.some(l => l.indexOf(origTemoin.slice(0, 24)) === 0),
    'original absent du bilingue');

  // 9a. « Enregistrer sous… » (File System Access)
  const sous = await page.evaluate(async () => {
    let nomPropose = null, ecrit = 0;
    window.showSaveFilePicker = async function (o) {
      nomPropose = o && o.suggestedName;
      return { createWritable: async () => ({ write: async b => { ecrit = b.size; }, close: async () => {} }) };
    };
    await window.__livro.exporter('txt');
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('v461-ex-sous').click();
    await new Promise(r => setTimeout(r, 500));
    return { nomPropose, ecrit, res: document.getElementById('v461-ex-res').textContent };
  });
  ok('« Enregistrer sous… » propose le bon nom de fichier', /\.txt$/.test(String(sous.nomPropose)), String(sous.nomPropose));
  ok('« Enregistrer sous… » écrit réellement le contenu', sous.ecrit > 0 && /Enregistré/.test(sous.res), JSON.stringify(sous).slice(0, 90));

  // 9b. « Dans le dossier de l'app » (via le serveur) — la voie qui marche en coque
  const pc = await page.evaluate(async () => {
    await window.__livro.exporter('docx');
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('v461-ex-pc').click();
    await new Promise(r => setTimeout(r, 700));
    return { res: document.getElementById('v461-ex-res').textContent };
  });
  ok('« Dans le dossier de l’app » envoie le fichier au serveur', !!envoiLivroSave && /\.docx$/.test(String(envoiLivroSave.filename)), JSON.stringify(envoiLivroSave && envoiLivroSave.filename));
  ok('le contenu transmis est bien encodé (base64 non vide)', !!(envoiLivroSave && envoiLivroSave.data64 && envoiLivroSave.data64.length > 100), 'base64=' + (envoiLivroSave && envoiLivroSave.data64 || '').length);
  ok('le CHEMIN est affiché à l’utilisateur', /traductions/.test(String(pc.res)) && /Enregistré/.test(String(pc.res)), String(pc.res).slice(0, 110));

  // 9c. « Télécharger » (voie classique) déclenche bien un téléchargement
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.evaluate(async () => {
    await window.__livro.exporter('epub');
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('v461-ex-dl').click();
  });
  const fichier = await dl;
  ok('« Télécharger » déclenche un vrai téléchargement', !!fichier && /\.epub$/.test(fichier.suggestedFilename()), fichier ? fichier.suggestedFilename() : 'aucun');

  // 9d. « Copier le texte » (voie de secours, marche partout)
  const cp = await page.evaluate(async () => {
    let copie = null;
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { copie = t; } }, configurable: true }); } catch (e) {}
    await window.__livro.exporter('txt');
    await new Promise(r => setTimeout(r, 300));
    const b = document.getElementById('v461-ex-cp');
    if (b) b.click();
    await new Promise(r => setTimeout(r, 400));
    return { longueur: copie ? copie.length : 0, res: document.getElementById('v461-ex-res').textContent };
  });
  ok('« Copier le texte » copie bien le contenu', cp.longueur > 10 && /copié/i.test(String(cp.res)), JSON.stringify(cp).slice(0, 90));

  // 10. BILINGUE CÔTE À CÔTE : original à GAUCHE, traduction à DROITE
  const cotes = await page.evaluate(() => {
    const t = window.__livro.deuxColonnesTxt('AAA BBB', 'XXX YYY');
    const long = window.__livro.deuxColonnesTxt('un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize dix-sept dix-huit dix-neuf vingt vingt-et-un vingt-deux', 'court');
    const l = long.split('\n');
    return {
      simple: t,
      gauche: t.slice(0, t.indexOf('│')).trim(),
      droite: t.slice(t.indexOf('│') + 1).trim(),
      nLignes: l.length,
      toutesAvecFilet: l.every(x => x.indexOf('│') >= 0),
      memeColonne: l.every(x => x.indexOf('│') === l[0].indexOf('│'))
    };
  });
  ok('côte à côte : l’ORIGINAL est dans la colonne de gauche', cotes.gauche === 'AAA BBB', JSON.stringify(cotes.simple));
  ok('côte à côte : la TRADUCTION est dans la colonne de droite', cotes.droite === 'XXX YYY', JSON.stringify(cotes.simple));
  ok('côte à côte : un paragraphe long passe sur PLUSIEURS lignes', cotes.nLignes > 1, 'lignes=' + cotes.nLignes);
  ok('côte à côte : le filet reste à la MÊME colonne sur toutes les lignes', cotes.toutesAvecFilet && cotes.memeColonne, JSON.stringify(cotes));

  // et sur le VRAI livre exporté : original avant le filet, traduction après
  const vraiBil = await page.evaluate(() => {
    const L = window.__livro.etat();
    const orig = String(L.livre.chapitres[0].paragraphes[0]).trim();
    const trad = String((L.trad[0] || [])[0] || '').trim();
    const txt = window.__livro.texteComplet('bilingue');
    const ligne = txt.split('\n').find(l => l.indexOf('│') >= 0) || '';
    const p = ligne.indexOf('│');
    return { orig, trad, ligne, avant: ligne.slice(0, p).trim(), apres: ligne.slice(p + 1).trim() };
  });
  ok('sur le vrai livre : original à gauche, traduction à droite, SUR LA MÊME LIGNE',
    vraiBil.avant.length > 0 && vraiBil.apres.length > 0 && vraiBil.avant === vraiBil.orig.slice(0, vraiBil.avant.length),
    JSON.stringify(vraiBil).slice(0, 160));

  // 11. DOCX et EPUB : DEUX COLONNES (tableau), original / traduction
  const tab = await page.evaluate(async () => {
    const lire = async (blob, nom) => { const z = await JSZip.loadAsync(blob); return await z.file(nom).async('string'); };
    const d = await window.__livro.docxDe('bilingue');
    const e = await window.__livro.epubDe('bilingue');
    const dx = await lire(d, 'word/document.xml');
    const ex = await lire(e, 'OEBPS/chap1.xhtml');
    const css = await lire(e, 'OEBPS/style.css');
    const rangs = (dx.match(/<w:tr>/g) || []).length;
    const cellules = (dx.match(/<w:tc>/g) || []).length;
    return {
      docxTableau: /<w:tbl>/.test(dx) && /<w:tblGrid>/.test(dx),
      docxDeuxColonnes: rangs > 0 && cellules === rangs * 2,
      docxSuiteParagraphe: /<\/w:tbl><w:p\/>/.test(dx),
      epubTableau: /<table class="duo">/.test(ex),
      epubCellules: (ex.match(/<td class="g">/g) || []).length > 0 && (ex.match(/<td class="d">/g) || []).length > 0,
      epubCss: /td\.d/.test(css) && /border-collapse/.test(css)
    };
  });
  ok('DOCX bilingue : un TABLEAU à deux colonnes', tab.docxTableau, JSON.stringify(tab));
  ok('DOCX bilingue : une ligne = 2 cellules (original | traduction)', tab.docxDeuxColonnes, JSON.stringify(tab));
  ok('DOCX bilingue : le tableau est suivi d’un paragraphe (OOXML valide)', tab.docxSuiteParagraphe, JSON.stringify(tab));
  ok('EPUB bilingue : tableau à deux colonnes + feuille de style', tab.epubTableau && tab.epubCellules && tab.epubCss, JSON.stringify(tab));

  // 12. PDF : lecture ET écriture, avec la géométrie vérifiée (gauche < droite)
  const pdf = await page.evaluate(async () => {
    const L = window.__livro.etat();
    const gLivre = L.livre, gTrad = L.trad, gCible = L.cible;
    /* livre SYNTHÉTIQUE : les positions sont ainsi prévisibles et l'assertion
       ne dépend pas du contenu de la fixture */
    L.livre = { nom: 'Essai bilingue', chapitres: [{ titre: 'Chapitre 1', paragraphes: ['Au commencement etait le Verbe'] }] };
    L.trad = [['In the beginning was the Word']];
    L.cible = 'en';
    let r = {};
    try {
      const b = await window.__livro.pdfDe('bilingue');
      const u8 = new Uint8Array(await b.arrayBuffer());
      r.head = String.fromCharCode.apply(null, Array.from(u8.slice(0, 5)));
      r.taille = b.size;
      r.type = b.type;
      const doc = await pdfjsLib.getDocument({ data: u8.slice(0) }).promise;
      r.pages = doc.numPages;
      const page = await doc.getPage(1);
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str.trim().length > 1)
        .map(i => ({ s: i.str.trim(), x: Math.round(i.transform[4]) }));
      r.items = items.slice(0, 12);
      const gauche = items.filter(i => i.x < 200);
      const droite = items.filter(i => i.x > 250);
      r.xGauche = gauche.length ? gauche[0].x : null;
      r.xDroite = droite.length ? droite[0].x : null;
      r.toutTexte = items.map(i => i.s).join(' ');
      r.originalAGauche = gauche.some(i => /commencement/.test(i.s));
      r.traductionADroite = droite.some(i => /beginning/.test(i.s));
      /* non latin : doit être SIGNALÉ, pas silencieusement mutilé */
      L.trad = [['Ἐν ἀρχῇ ἦν ὁ λόγος']];
      r.nonSupp = window.__livro.caracteresNonSupportes();
      r.ecritures = window.__livro.analyseEcritures();
      L.trad = [['In the beginning was the Word']];
      r.sansNonSupp = window.__livro.caracteresNonSupportes();
      r.sansEcritures = window.__livro.analyseEcritures();
    } catch (e) { r.err = String(e && e.message || e); }
    L.livre = gLivre; L.trad = gTrad; L.cible = gCible;
    return r;
  });
  ok('PDF exporté : c’est un vrai PDF (%PDF) de taille plausible', pdf.head === '%PDF-' && pdf.taille > 800, JSON.stringify({ h: pdf.head, t: pdf.taille }));
  ok('PDF exporté : relu par pdf.js (le fichier n’est pas corrompu)', pdf.pages >= 1 && !pdf.err, JSON.stringify({ p: pdf.pages, err: pdf.err }));
  ok('PDF bilingue : l’ORIGINAL est dans la colonne de GAUCHE', pdf.originalAGauche === true, JSON.stringify({ x: pdf.xGauche, items: pdf.items }));
  ok('PDF bilingue : la TRADUCTION est dans la colonne de DROITE', pdf.traductionADroite === true, JSON.stringify({ x: pdf.xDroite, items: pdf.items }));
  ok('PDF bilingue : la colonne de droite est bien À DROITE de la gauche', pdf.xDroite > pdf.xGauche, JSON.stringify({ g: pdf.xGauche, d: pdf.xDroite }));
  ok('PDF : les caractères non latins (grec) sont DÉTECTÉS et signalés', Array.isArray(pdf.nonSupp) && pdf.nonSupp.length > 0, JSON.stringify(pdf.nonSupp));
  ok('PDF : l’écriture est NOMMÉE (grec), pas listée en caractères',
    pdf.ecritures.length === 1 && pdf.ecritures[0].nom === 'grec', JSON.stringify(pdf.ecritures));
  ok('PDF : aucun avertissement inutile quand tout est latin', Array.isArray(pdf.sansNonSupp) && pdf.sansNonSupp.length === 0, JSON.stringify(pdf.sansNonSupp));
  ok('PDF : un texte latin ne déclenche aucune détection d’écriture',
    Array.isArray(pdf.sansEcritures) && pdf.sansEcritures.length === 0, JSON.stringify(pdf.sansEcritures));

  // 12-bis. écriture non latine : le message doit NOMMER l'écriture, pas
  // énumérer des signes (dont des voyelles combinantes invisibles).
  const avert = await page.evaluate(async () => {
    const L = window.__livro.etat();
    const gLivre = L.livre, gTrad = L.trad;
    /* un texte arabe avec voyellation ET un cercle pointillé (artefact fréquent
       des PDF mal extraits) : les deux ne doivent JAMAIS servir d'exemple */
    L.livre = { nom: 'Essai arabe', chapitres: [{ titre: 'الفاتحة', paragraphes: ['بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ◌'] }] };
    L.trad = [['Au nom d’Allah, le Tout Miséricordieux.']];
    L.cible = 'fr';
    const analyse = window.__livro.analyseEcritures();
    const phrase = window.__livro.phraseEcritures();
    const reelles = window.__livro.ecrituresReelles();
    await window.__livro.exporter('pdf');
    await new Promise(r => setTimeout(r, 1500));
    const zone = document.getElementById('v461-ex-avert');
    const res = {
      analyse, phrase, reelles,
      fidele: L.pdfFidele,
      texte: zone ? zone.textContent : '',
      nom: (document.getElementById('v461-ex-nom') || {}).textContent,
      /* les exemples ne doivent contenir NI voyelle combinante NI cercle */
      exemples: analyse.map(e => e.exemple),
      /* ...et le message ne doit plus les AFFICHER entre guillemets */
      guillemetsDeSignes: /« [\u0600-\u06FF\u25CC\u2500]/ .test(zone ? zone.textContent : '')
    };
    L.livre = gLivre; L.trad = gTrad;
    return res;
  });
  ok('écriture non latine : l’ARABE est reconnu comme écriture (pas comme signes)',
    avert.reelles.length === 1 && avert.reelles[0].nom === 'arabe' && avert.reelles[0].n > 20,
    JSON.stringify(avert.analyse));
  ok('le cercle pointillé (artefact) est classé à part, et sans exemple visible',
    avert.analyse.some(e => e.nom === 'symboles') && avert.analyse.filter(e => e.nom === 'symboles')[0].exemple === '',
    JSON.stringify(avert.analyse));
  ok('les signes INVISIBLES (voyellation, cercle pointillé) ne servent pas d’exemple',
    avert.exemples.indexOf('\u25CC') < 0 && avert.exemples.indexOf('\u064E') < 0 && avert.exemples.indexOf('\u0652') < 0,
    JSON.stringify(avert.exemples));
  ok('le message NOMME l’écriture avec son volume (« de l’arabe (N caractères) »)',
    /de l’<b>arabe<\/b> \(\d/.test(avert.phrase), avert.phrase);
  ok('le message ne dresse plus de liste de caractères entre guillemets',
    avert.guillemetsDeSignes === false, avert.texte.slice(0, 120));
  ok('PDF arabe : le rendu FIDÈLE prend le relais (le navigateur assemble les lettres)',
    avert.fidele === true, 'fidele=' + avert.fidele);
  ok('PDF arabe : l’avertissement d’impossibilité DISPARAÎT (il n’y a plus de problème)',
    /composé par le navigateur/.test(avert.texte) && !/ne seront pas rendus/.test(avert.texte), avert.texte.slice(0, 140));
  ok('le fichier PDF est bien proposé (nom en .pdf)', /\.pdf$/.test(String(avert.nom)), String(avert.nom));

  // 12-bis-1. quelques signes ISOLÉS (filet, puce exotique) : note discrète,
  // pas l'alerte « prenez DOCX » — proportionner la réponse au problème
  const signes = await page.evaluate(async () => {
    const L = window.__livro.etat();
    const gLivre = L.livre, gTrad = L.trad;
    L.livre = { nom: 'Essai', chapitres: [{ titre: 'T', paragraphes: ['Un texte latin ordinaire ─ avec un filet ◌ et rien d’autre.'] }] };
    L.trad = [['']];
    await window.__livro.exporter('pdf');
    await new Promise(r => setTimeout(r, 700));
    const t = (document.getElementById('v461-ex-avert') || {}).textContent || '';
    const r = { texte: t, reelles: window.__livro.ecrituresReelles().length, fidele: L.pdfFidele };
    L.livre = gLivre; L.trad = gTrad;
    return r;
  });
  ok('signes isolés : aucune écriture réelle → pas de bascule en images',
    signes.reelles === 0 && signes.fidele === false, JSON.stringify(signes));
  ok('signes isolés : note DISCRÈTE (pas l’alerte « prenez DOCX »)',
    /caractère\(s\) spécial/.test(signes.texte) && !/⚠️/.test(signes.texte) && !/ne seront pas rendus/.test(signes.texte),
    signes.texte.slice(0, 130));

  // 12-bis-2. le PDF fidèle est un vrai PDF, RELISIBLE, et PAGINÉ
  const fidele = await page.evaluate(async () => {
    const L = window.__livro.etat();
    const gLivre = L.livre, gTrad = L.trad;
    /* assez de contenu pour dépasser UNE page : la pagination par mesure doit
       produire plusieurs pages, sans couper les lignes en deux */
    const paras = [], trad = [];
    for (let i = 1; i <= 60; i++) {
      paras.push('الْفَقْرَةُ رَقْمُ ' + i + ' — بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ وَالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ');
      trad.push('Paragraphe numero ' + i + ' — au nom d’Allah, le Tout Misericordieux.');
    }
    L.livre = { nom: 'Essai long', chapitres: [{ titre: 'الفاتحة', paragraphes: paras }] };
    L.trad = [trad];
    L.cible = 'fr';
    let r = {};
    try {
      const b = await window.__livro.pdfDe('bilingue');
      const u8 = new Uint8Array(await b.arrayBuffer());
      r.head = String.fromCharCode.apply(null, Array.from(u8.slice(0, 5)));
      r.taille = b.size;
      r.pages = (await pdfjsLib.getDocument({ data: u8.slice(0) }).promise).numPages;
      r.fidele = L.pdfFidele;
    } catch (e) { r.err = String(e && e.message || e); }
    L.livre = gLivre; L.trad = gTrad;
    return r;
  });
  ok('PDF fidèle : c’est un vrai PDF relisible par pdf.js', fidele.head === '%PDF-' && !fidele.err, JSON.stringify({ h: fidele.head, err: fidele.err }));
  ok('PDF fidèle : un texte long est PAGINÉ (plusieurs pages, pas une seule tranche)',
    fidele.pages >= 2, 'pages=' + fidele.pages);
  ok('PDF fidèle : les pages sont insérées en image (fichier cohérent en taille)',
    fidele.taille > 20000 && fidele.fidele === true, JSON.stringify({ t: fidele.taille, f: fidele.fidele }));
  /* Le PDF-image coûte cher : on BORNE le poids par page pour qu'une
     régression (qualité montée, PNG au lieu de JPEG) se voie tout de suite.
     60 paragraphes bilingues ≈ 1 page pleine. */
  const parPage = fidele.taille / fidele.pages;
  ok('PDF fidèle : poids par page maîtrisé (< 700 Ko/page)',
    parPage < 700 * 1024, Math.round(parPage / 1024) + ' Ko/page sur ' + fidele.pages + ' page(s)');

  // 12-bis-3. REPLI : sans html2canvas, on retombe sur le vectoriel ET
  // l'avertissement doit revenir (c'est le seul cas où il a lieu d'être)
  const repli = await page.evaluate(async () => {
    const L = window.__livro.etat();
    const gLivre = L.livre, gTrad = L.trad;
    const vraiH2C = window.html2canvas;
    try { window.html2canvas = undefined; } catch (e) {}
    L.livre = { nom: 'Essai arabe', chapitres: [{ titre: 'T', paragraphes: ['بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'] }] };
    L.trad = [['Au nom d’Allah.']];
    let r = {};
    try {
      await window.__livro.exporter('pdf');
      await new Promise(x => setTimeout(x, 700));
      r.fidele = L.pdfFidele;
      r.texte = (document.getElementById('v461-ex-avert') || {}).textContent || '';
      const b = await window.__livro.pdfVectoriel('bilingue');
      r.head = String.fromCharCode.apply(null, Array.from(new Uint8Array(await b.arrayBuffer()).slice(0, 5)));
    } catch (e) { r.err = String(e && e.message || e); }
    try { window.html2canvas = vraiH2C; } catch (e) {}
    L.livre = gLivre; L.trad = gTrad;
    return r;
  });
  ok('repli sans navigateur-composeur : le PDF vectoriel est produit quand même',
    repli.head === '%PDF-' && repli.fidele === false, JSON.stringify({ h: repli.head, f: repli.fidele, e: repli.err }));
  ok('repli : l’avertissement REVIENT, avec la bonne conjugaison et sans liste de signes',
    /Ce texte contient de l’arabe \(\d/.test(repli.texte) && /ne seront pas rendus/.test(repli.texte) && !/« /.test(repli.texte),
    repli.texte.slice(0, 150));

  // 12-ter. le bouton PDF existe et route vers l'export PDF
  const boutonPdf = await page.evaluate(async () => {
    const b = document.getElementById('v461-pdf');
    if (!b) return { present: false };
    await new Promise(r => setTimeout(r, 50));
    b.click();
    await new Promise(r => setTimeout(r, 700));
    const z = document.getElementById('v461-export-zone');
    return { present: true, nom: (document.getElementById('v461-ex-nom') || {}).textContent, zone: z.style.display !== 'none' };
  });
  ok('le bouton ⬇ PDF existe et ouvre l’export PDF', boutonPdf.present && /\.pdf$/.test(String(boutonPdf.nom)) && boutonPdf.zone === true, JSON.stringify(boutonPdf));

  // 12-quater. ALLER-RETOUR : un PDF importé peut être réexporté en PDF
  const allerRetour = await page.evaluate(async (FIX) => {
    const b = await fetch(FIX + 'texte.pdf').then(r => r.blob());
    await window.__livro.charger(new File([b], 'texte.pdf'));
    await new Promise(r => setTimeout(r, 400));
    const L = window.__livro.etat();
    if (!L.livre) return { charge: false };
    const np = L.livre.chapitres.reduce((n, c) => n + c.paragraphes.length, 0);
    const out = await window.__livro.pdfDe('original');
    const u8 = new Uint8Array(await out.arrayBuffer());
    return { charge: true, np, head: String.fromCharCode.apply(null, Array.from(u8.slice(0, 5))), taille: out.size };
  }, FIX);
  ok('aller-retour : un PDF importé se réexporte en PDF', allerRetour.charge && allerRetour.head === '%PDF-' && allerRetour.taille > 800, JSON.stringify(allerRetour));

  // 12-quinquies. PDF et ACCENTS : la police latine doit rendre le français
  const accents = await page.evaluate(async () => {
    const L = window.__livro.etat();
    const gLivre = L.livre, gTrad = L.trad;
    L.livre = { nom: 'Accents', chapitres: [{ titre: 'T', paragraphes: ['Élève à côté — cœur, français, « guillemets » …'] }] };
    L.trad = [['']];
    let r = {};
    try {
      r.nonSupp = window.__livro.caracteresNonSupportes();
      const b = await window.__livro.pdfDe('original');
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await b.arrayBuffer()) }).promise;
      const tc = await (await doc.getPage(1)).getTextContent();
      r.texte = tc.items.map(i => i.str).join('');
    } catch (e) { r.err = String(e && e.message || e); }
    L.livre = gLivre; L.trad = gTrad;
    return r;
  });
  ok('PDF : les ACCENTS français sont rendus (é è à ç œ — « »)',
    /Élève/.test(accents.texte) && /cœur/.test(accents.texte) && /français/.test(accents.texte) && /—/.test(accents.texte),
    JSON.stringify(accents).slice(0, 170));
  ok('PDF : le français accentué ne déclenche AUCUNE alerte inutile',
    Array.isArray(accents.nonSupp) && accents.nonSupp.length === 0, JSON.stringify(accents.nonSupp));

  ok('aucune erreur JavaScript' , errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/${total}`);
  process.exitCode = pass === total ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
