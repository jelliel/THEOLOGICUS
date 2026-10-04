// v443 — Prove-It : la bibliothèque « 📚 BIBLIO » agrège les annotations de
// TOUTES les conversations (commentaires IA + notes personnelles), filtre,
// et produit un export Markdown fidèle.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8784;
const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.addInitScript(() => { localStorage.setItem('theologicus_wizard_skipped', '1'); });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // amorce : 2 conversations, annotations variées
    await page.evaluate(async () => {
      await db.put('chats', {
        id: 'chatA', title: 'Grâce et liberté', updatedAt: 5000,
        messages: [
          { ts: 1, role: 'user', content: 'q1', annotations: [{ id: 'a1', text: 'La liberté chrétienne', a: 'Commentaire sur la grâce.', loading: false }] },
          { ts: 2, role: 'user', content: 'q2', annotations: [{ id: 'a2', text: 'Passage sans réponse', a: null, loading: false, error: 'rate limit' }] },
        ]
      });
      await db.put('chats', {
        id: 'chatB', title: 'Étude coranique', updatedAt: 6000,
        messages: [
          { ts: 3, role: 'user', content: 'q3', annotations: [{ id: 'a3', text: 'Verset de la lumière', a: 'Commentaire sur Ayat an-Nur.', loading: false }] },
          { ts: 4, role: 'user', content: 'q4', annotations: [{ id: 'a4', text: 'Ma remarque', a: null, loading: false, personal: true, note: 'À creuser avec le tafsir.' }] },
        ]
      });
    });

    // 1. le bouton HUD existe
    const btn = await page.evaluate(() => !!document.getElementById('v443-biblio-btn'));
    ok('le bouton « 📚 BIBLIO » existe dans le HUD', btn);

    // 2. ouverture : agrégation des 2 conversations
    await page.evaluate(() => window.__v443Biblio.ouvre());
    await page.waitForTimeout(400);
    const r1 = await page.evaluate(() => ({
      count: document.getElementById('v443-biblio-count').textContent,
      groupes: Array.from(document.querySelectorAll('#v443-biblio-body > div')).filter(d => d.textContent.startsWith('💬')).length,
      passages: (document.getElementById('v443-biblio-body').textContent.match(/La liberté chrétienne|Verset de la lumière|Ma remarque/g) || []).length,
    }));
    ok('les 2 conversations sont agrégées (groupes 💬)', r1.groupes === 2, 'trouvés : ' + r1.groupes);
    ok('les 3 annotations valides apparaissent (échec exclue)', r1.passages === 3, 'trouvées : ' + r1.passages);

    // 3. filtre
    await page.evaluate(() => { document.getElementById('v443-biblio-q').value = 'lumière'; document.getElementById('v443-biblio-q').dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(200);
    const r2 = await page.evaluate(() => document.getElementById('v443-biblio-count').textContent);
    ok('le filtre « lumière » isole 1/3', r2.startsWith('1 / 3'), r2);

    // 4. markdown fidèle
    await page.evaluate(() => window.__v443Biblio.filtre(''));
    const md = await page.evaluate(() => window.__v443Biblio.markdown());
    ok('l’export Markdown contient titres, citations et notes', md.includes('# MES ANNOTATIONS') && md.includes('## Grâce et liberté') && md.includes('> La liberté chrétienne') && md.includes('**📝 Note personnelle :** À creuser') && !md.includes('Passage sans réponse'));

    ok('aucune erreur JavaScript', errors.length === 0);
    console.log(`RESULTAT : ${pass}/6`);
    process.exitCode = pass === 6 ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close(); server.close();
  }
})();
