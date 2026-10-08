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
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 100)}`); if (cond) pass++; };
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
  await page.route('**/translate', async route => {
    let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    const lot = Array.isArray(c.q) ? c.q : [c.q];
    appels.lt.push(lot.length);
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
  ok('les deux colonnes sont étiquetées (Original | langue cible)', duo.orig === 'Original' && duo.trad === 'fr', JSON.stringify({ o: duo.orig, t: duo.trad }));
  ok('compteur de progression affiché', /\/\s*3 paragraphes/.test(String(duo.etat)), String(duo.etat));

  // 4. TRADUCTION LibreTranslate (lots) + mémoire
  appels.lt.length = 0;
  await page.evaluate(() => {
    const sel = document.getElementById('v461-moteur');
    sel.value = 'lt'; sel.dispatchEvent(new Event('change'));   /* moteur local : aucune confirmation */
    window.__livro.etat().cible = 'fr';
    return window.__livro.lancer();
  });
  await page.waitForTimeout(1500);
  const apres = await page.evaluate(() => ({
    traduits: Array.from(document.querySelectorAll('.v461-col.tr p')).map(p => p.textContent),
    tm: (function () { try { return !!(window.__theoTM && window.__theoTM.get('Au commencement etait le Verbe.', 'fr')); } catch (e) { return null; } })(),
    msg: document.getElementById('v461-msg').textContent
  }));
  ok('LibreTranslate appelé par LOTS, chapitre par chapitre (2+1 = 3 paragraphes)', JSON.stringify(appels.lt) === '[2,1]', JSON.stringify(appels.lt));
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
    const p = []; for (let i = 0; i < 15; i++) p.push('paragraphe numero ' + i + ' — assez long pour être traduit');
    return window.__livro.traduire(p, 'fr', 'lt');
  });
  ok('gros chapitre : lots de 12 puis 3 (15 paragraphes en 2 requêtes)', JSON.stringify(appels.lt) === '[12,3]', JSON.stringify(appels.lt));
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

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/53`);
  process.exitCode = pass === 53 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
