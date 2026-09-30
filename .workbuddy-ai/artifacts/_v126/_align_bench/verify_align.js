// Bench Playwright — reproduction du bug d'alignement des annotations
// Scénario : message assistant avec liste numérotée, on annote "canonique"
// puis on re-render et on vérifie que le span atc-hl contient EXACTEMENT
// le mot attendu (ni trop court, ni décalé sur un autre mot).

const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8791/THEOLOGICUS.html';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const consoleLines = [];
  page.on('console', m => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLines.push(`[pageerror] ${e.message}`));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Attend que state soit défini (window.state) — peut prendre du temps
  await page.waitForFunction(() => typeof window.state === 'object' && window.state !== null, null, { timeout: 60000 });

  // Injecte un faux message assistant avec liste numérotée (comme le screenshot)
  // Reproduit le texte exact observé dans Screenshot 2026-09-28 132735.png
  await page.evaluate(() => {
    const msgText = [
      'Non, Tertullien n\'a jamais écrit que le Livre d\'Hénoc fut retiré *à cause des propriétés d\'un Messie déjà venu*.',
      'En revanche :',
      '',
      '1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).',
      '2. Il **ne** justifie pas **son** exclusion du canon, **contrairement** à **Athanase** ou Épiphan**e**.',
      '3. La formulation que vous citez ressemble à une **interprétation ultérieure** (peut-être médiévale) de sa pensée.',
    ].join('\n');
    const ts = Date.now();
    window.state.messages = [{
      ts: ts,
      role: 'assistant',
      content: msgText,
      agent: window.state.agent || null,
      annotations: [],
      marks: [],
    }];
    // Astuce : neutraliser runCommentLLM / callLLM pour ne pas dépendre d'un LLM
    window.runCommentLLM = async function () { /* no-op */ };
    if (typeof window.renderMessages === 'function') window.renderMessages(true);
  });

  // Attend que la box de message soit rendue
  await page.waitForSelector('[id^="mc-"]');
  const ts = await page.evaluate(() => window.state.messages[0].ts);

  // — Étape 1 : annote "canonique" (mot n°1)
  const target1 = 'canonique';
  await selectAndAnnotate(page, ts, target1);

  // — Étape 2 : annote "marcionisme" (mot n°2, plus loin)
  const target2 = 'marcionisme';
  await selectAndAnnotate(page, ts, target2);

  // — Étape 3 : annote "interprétation ultérieure" (expression n°3)
  const target3 = 'interprétation ultérieure';
  await selectAndAnnotate(page, ts, target3);

  // — Étape 4 : force un re-render complet (comme si une autre action le déclenchait)
  await page.evaluate(() => window.renderMessages(true));
  await page.waitForTimeout(150);

  // Vérification : pour chaque annotation, le span atc-hl doit contenir
  // EXACTEMENT le texte attendu (après trim).
  const result = await page.evaluate((ts) => {
    const box = document.getElementById('mc-' + ts);
    if (!box) return { error: 'box not found' };
    const anns = window.state.messages[0].annotations || [];
    const rows = [];
    for (const a of anns) {
      const sp = box.querySelector(`[data-hl-id="${a.id}"]`);
      const visibleText = sp ? (sp.textContent || '').trim() : null;
      const sameWords = sp ? (sp.textContent || '').trim() === (a.text || '').trim() : false;
      // L'index dans box.textContent doit aussi correspondre à a.start
      const boxText = box.textContent || '';
      const expectedStart = (typeof a.start === 'number') ? a.start : null;
      let computedStart = null;
      if (sp) {
        // Récupère l'offset réel du span dans le box
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
        let pos = 0, found = -1;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n === sp.firstChild || (sp.firstChild && n === sp.firstChild) || (n.parentNode === sp)) {
            found = pos;
            break;
          }
          pos += n.nodeValue.length;
        }
        computedStart = found;
      }
      rows.push({
        id: a.id,
        text: a.text,
        storedStart: a.start,
        storedEnd: a.end,
        spanText: visibleText,
        exactMatch: sameWords,
        spanOffsetInBox: computedStart,
      });
    }
    return { rows, boxTextLen: (box.textContent || '').length };
  }, ts);

  console.log('RESULT_JSON_BEGIN');
  console.log(JSON.stringify(result, null, 2));
  console.log('RESULT_JSON_END');

  // Évaluation : on compte les mismatches
  let passed = 0, failed = 0;
  for (const r of result.rows) {
    if (r.exactMatch) { passed++; console.log(`OK   ${r.id}  "${r.text}" -> span "${r.spanText}"`); }
    else { failed++; console.log(`FAIL ${r.id}  stored="${r.text}" span="${r.spanText}"`); }
  }
  console.log(`---SUMMARY--- ${passed} passed, ${failed} failed`);

  // Dump des erreurs console / pageerror
  if (consoleLines.length) {
    console.log('---CONSOLE---');
    for (const l of consoleLines.slice(0, 20)) console.log(l);
  }

  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

// — Sélectionne target dans box[id="mc-ts"] et appelle window.onAddToChat()
async function selectAndAnnotate(page, ts, target) {
  await page.evaluate(({ ts, target }) => {
    const box = document.getElementById('mc-' + ts);
    if (!box) throw new Error('box not found');
    // TreeWalker texte
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    let full = '';
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push({ node: n, start: full.length });
      full += n.nodeValue;
    }
    const idx = full.indexOf(target);
    if (idx === -1) throw new Error(`target "${target}" not in box; full="${full.slice(0, 200)}…"`);
    // Trouve les nœuds contenant idx et idx+target.length
    let startNode = null, startOff = 0, endNode = null, endOff = 0;
    for (const { node, start } of nodes) {
      const end = start + node.nodeValue.length;
      if (!startNode && idx >= start && idx < end) {
        startNode = node;
        startOff = idx - start;
      }
      if (!endNode && (idx + target.length) > start && (idx + target.length) <= end) {
        endNode = node;
        endOff = (idx + target.length) - start;
      }
    }
    if (!startNode || !endNode) throw new Error('could not locate nodes');
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // Prépare _atcSel comme le fait l'app avant d'appeler onAddToChat
    window._atcSel = {
      text: target,
      msgTs: ts,
      range: range,
      rect: range.getBoundingClientRect(),
      occ: 0,
    };
    if (typeof window.onAddToChat === 'function') window.onAddToChat();
    else throw new Error('window.onAddToChat is not a function');
  }, { ts, target });
  await page.waitForTimeout(50);
}