// v126m — Prove-It : la prévisualisation de verset (#verse-mini-tip) ouverte au
// survol d'une .atc-vref DANS l'infobulle de commentaire #atc-tip doit se
// peindre DEVANT son hôte (avant le fix : --z-panneau 9000 < 100001).
//
// Tout est réel sauf le réseau fournisseurs : on sert le VRAI THEOLOGICUS.html,
// la vraie annotation est rendue par renderMessages + applyHighlights (observer),
// le vrai survol souris (page.hover) déclenche les vrais gestionnaires
// mouseover (cc → showTipFor, document → mini-tip), et le texte du verset
// vient du VRAI corpus local bible/b43.js chargé par __ensureBibleBook.
// L'écran de login est neutralisé par le mécanisme maison « theologicus_remember »
// (THEOLOGICUS.html:24585), pas par une force brute sur le DOM.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8773;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const send = (code, type, stream) => {
      res.writeHead(code, { 'Content-Type': type });
      if (stream) stream.pipe(res); else res.end();
    };
    if (url === '/THEOLOGICUS.html' || url === '/') {
      return send(200, 'text/html; charset=utf-8', fs.createReadStream(path.join(ROOT, 'THEOLOGICUS.html')));
    }
    // Corpus local : bible/b<p>.js — le SEUL asset externe que le parcours touche.
    if (url.startsWith('/bible/')) {
      const p = path.normalize(path.join(ROOT, url));
      if (!p.startsWith(path.join(ROOT, 'bible')) || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
        console.log('  [404] ' + url);
        return send(404, 'text/plain');
      }
      return send(200, 'application/javascript', fs.createReadStream(p));
    }
    console.log('  [404] ' + url);
    send(404, 'text/plain');
  });
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

  const browser = await chromium.launch({
    executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  // Wizard passé + session déverrouillée par le chemin maison « session OK »
  // (THEOLOGICUS.html:25295 → unlock → classList.add('hidden')) : l'app masque
  // elle-même #auth-overlay (z 999999) qui faussait elementFromPoint. Le
  // theologicus_remember est inutilisable ici : readRemember (24728) exige un
  // tok = sha256('remember:'+AUTH_HASH) qu'un banc ne peut pas forger.
  await page.addInitScript(() => {
    localStorage.setItem('theologicus_wizard_skipped', '1');
    sessionStorage.setItem('theologicus_auth', 'true');
    sessionStorage.setItem('theologicus_auth_mode', 'verse');
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // Aucune requête réseau vers les fournisseurs : tout host non local est noté.
  const requetesExternes = [];
  page.on('request', r => {
    const h = new URL(r.url()).hostname;
    if (h !== '127.0.0.1' && h !== 'localhost') requetesExternes.push(r.url().slice(0, 120));
  });

  let pass = 0; const total = 11;
  const check = (name, ok, detail) => {
    console.log(`  ${ok ? '[OK]  ' : '[ECHEC]'}${name}${detail ? ' (' + detail + ')' : ''}`);
    if (ok) pass++;
  };

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!window.renderMessages && typeof state === 'object' && !!window.fetchVerse, null, { timeout: 60000 });

    // ── 1. L'écran de login ne doit plus intercepter le pointeur ──
    const authOk = await page.evaluate(() => {
      const ov = document.getElementById('auth-overlay');
      const cs = ov ? getComputedStyle(ov).display : 'absent';
      return cs === 'none' || cs === 'absent';
    });
    check('écran de login neutralisé (session theologicus_auth → unlock maison)', authOk);

    // L'init asynchrone de l'app (checkFirstRun, memory, loadAgents, puis
    // newChat/loadChat en IndexedDB) doit se terminer AVANT le seed, sinon
    // newChat() écrase state.messages et l'annotation disparaît en cours de
    // banc. state.chatId n'existe qu'après newChat (18706) ou loadChat (18731)
    // — c'est le signal déterministe de fin de restauration du chat.
    await page.waitForFunction(() => !!state.chatId, null, { timeout: 30000 });

    // ── 2. Création de l'annotation : state.messages puis rendu réel ──
    // Le commentaire (a.a) cite Jean 3:16 → buildTipHTML → renderVerseRefs
    // enveloppe la référence dans span.atc-vref.
    await page.evaluate(() => {
      state.messages = [{
        ts: 1770000000000,
        role: 'assistant',
        content: 'Voici un passage annote pour le banc de verification.',
        annotations: [{
          id: 'banc-z1',
          text: 'passage annote',
          a: 'Ce passage renvoie a Jean 3:16 comme le souligne la tradition.',
          loading: false,
        }],
      }];
      window.renderMessages();
    });
    // applyHighlights est posé 60 ms après le rendu (window.__applyHighlights,
    // programmé par renderMessages ligne 15104)
    await page.waitForSelector('.atc-hl[data-hl-id="banc-z1"]', { timeout: 15000 });
    check('annotation rendue en .atc-hl par renderMessages + __applyHighlights', true);

    // ── 3. Survol RÉEL du passage surligné → le vrai #atc-tip s'ouvre ──
    await page.hover('.atc-hl[data-hl-id="banc-z1"]');
    await page.waitForSelector('#atc-tip', { timeout: 10000 });
    const tipState = await page.evaluate(() => {
      const t = document.getElementById('atc-tip');
      const vref = t ? t.querySelector('.atc-vref') : null;
      return {
        existe: !!t,
        vref: vref ? vref.dataset.vref : null,
        z: t ? getComputedStyle(t).zIndex : null,
        position: t ? getComputedStyle(t).position : null,
        parentBody: !!t && t.parentElement === document.body,
      };
    });
    check('survol du .atc-hl ouvre le vrai #atc-tip avec la .atc-vref « Jean 3:16 »',
      tipState.existe && tipState.vref === 'Jean 3:16',
      'vref=' + tipState.vref);
    check('#atc-tip : fixed, premier niveau, z = calc(--z-bulle+1) = 100001',
      tipState.position === 'fixed' && tipState.parentBody && parseInt(tipState.z, 10) === 100001,
      'position=' + tipState.position + ' z=' + tipState.z + ' body=' + tipState.parentBody);

    // ── 4. Survol RÉEL de la .atc-vref DANS le tip → mini-tip + corpus local ──
    await page.hover('.atc-tip-a .atc-vref');
    // __ensureBibleBook charge bible/b43.js (serveur local) puis re-rend le texte.
    await page.waitForFunction(() => {
      const t = document.getElementById('verse-mini-tip');
      return t && t.style.display === 'block' && t.textContent.includes('Dieu a tant aim');
    }, null, { timeout: 15000 });
    const miniState = await page.evaluate(() => {
      const t = document.getElementById('verse-mini-tip');
      const cs = getComputedStyle(t);
      return { z: cs.zIndex, position: cs.position, parentBody: t.parentElement === document.body, txt: t.textContent.slice(0, 60) };
    });
    check('survol de la .atc-vref ouvre #verse-mini-tip avec le VRAI texte de bible/b43.js',
      miniState.position === 'fixed' && miniState.parentBody,
      '« ' + miniState.txt.trim().replace(/\s+/g, ' ') + '… »');
    check('#verse-mini-tip : z = calc(--z-bulle+2) = 100002 > 100001 (le fix v126m)',
      parseInt(miniState.z, 10) === 100002 && parseInt(miniState.z, 10) > parseInt(tipState.z, 10),
      'mini=' + miniState.z + ' tip=' + tipState.z);

    // ── 5. Empilement EFFECTIF : elementFromPoint au centre de la mini-tip ──
    // Pas deux z-index comparés sur le papier : on demande au moteur de
    // peinture qui est VRAIMENT au point central de la prévisualisation.
    const devant = await page.evaluate(() => {
      const t = document.getElementById('verse-mini-tip');
      const r = t.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const el = document.elementFromPoint(x, y);
      return { auPoint: el ? (el.tagName + '#' + el.id + '.' + el.className) : 'null', dansMini: !!el && (el === t || t.contains(el)), xy: [x | 0, y | 0] };
    });
    check('elementFromPoint au centre de la mini-tip retombe DANS la mini-tip (elle peint devant)',
      devant.dansMini, 'point(' + devant.xy.join(',') + ') -> ' + devant.auPoint);

    // ── 6. Pas de régression : quitter la .atc-vref referme la mini-tip ──
    // La souris sort de la citation vers un élément réel non couvert (le champ
    // #user-input) : mouse.move BRUT (téléportation — le hover de Playwright
    // refuserait si un panneau recouvrait encore la cible). Le mouseleave de
    // #atc-tip le referme proprement AVANT tout nouveau survol (sinon son
    // closeAtcTip, qui vise par id, tuerait le tip suivant), et le minuteur
    // v97 (250 ms) referme la mini-tip car elle n'est plus survolée.
    const ui = await page.locator('#user-input').boundingBox();
    await page.mouse.move(ui.x + ui.width / 2, ui.y + ui.height / 2);
    await page.waitForFunction(() => {
      const t = document.getElementById('verse-mini-tip');
      return !t || t.style.display !== 'block';
    }, null, { timeout: 5000 });
    // Course interne de l'app : la sortie du .atc-hl (vers la vref) a armé le
    // minuteur de fermeture de 350 ms (THEOLOGICUS.html:27854) ; s'il expire
    // APRÈS le re-survol, son closeAtcTip tue le tip fraîchement recréé
    // (:hover faux — le pointeur est sur le passage, pas dans le tip).
    // On attend l'expiration pour un résultat déterministe.
    await page.waitForTimeout(450);
    check('la mini-tip se referme quand la souris quitte la .atc-vref (minuteur v97 intact)', true);

    // ── 7. #atc-tip reste DEVANT hors mini-tip : elementFromPoint au centre du tip ──
    // Resurvol RÉEL du passage : le gestionnaire mouseover de #chat-container
    // recrée le tip (plus rien ne masque le span ni ne le referme).
    await page.hover('.atc-hl[data-hl-id="banc-z1"]');
    await page.waitForSelector('#atc-tip', { timeout: 10000 });
    const tipDevant = await page.evaluate(() => {
      const t = document.getElementById('atc-tip');
      const mini = document.getElementById('verse-mini-tip');
      const miniVisible = mini && mini.style.display === 'block';
      const r = t.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const el = document.elementFromPoint(x, y);
      return {
        miniVisible,
        auPoint: el ? (el.tagName + '#' + el.id + '.' + el.className) : 'null',
        dansTip: !!el && (el === t || t.contains(el)),
        xy: [x | 0, y | 0],
      };
    });
    check('#atc-tip peint devant hors mini-tip : elementFromPoint à son centre retombe dans #atc-tip',
      tipDevant.dansTip && !tipDevant.miniVisible,
      'point(' + tipDevant.xy.join(',') + ') -> ' + tipDevant.auPoint);

    // ── 8. Aucune requête réseau vers les fournisseurs ──
    check('aucune requête vers un fournisseur (tout est resté sur 127.0.0.1)',
      requetesExternes.length === 0,
      requetesExternes.length ? requetesExternes[0] : '');

    // ── 9. Aucune erreur JavaScript non interceptée ──
    check('aucune erreur JavaScript non interceptée', errors.length === 0,
      errors.length ? String(errors[0]).slice(0, 90) : '');

    console.log(`RESULTAT : ${pass}/${total}`);
    process.exitCode = pass === total ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
