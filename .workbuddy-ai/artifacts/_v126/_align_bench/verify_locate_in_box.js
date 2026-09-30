// Bench : vérifie que window.locateInBox du vrai THEOLOGICUS.html distingue
// correctement une position-frontière entre deux nœuds texte (inclusif pour
// la FIN d'une plage, exclusif pour le DÉBUT). C'est précisément le scénario
// qui produit le bug "cadre décalé sur un autre mot".

const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8791/THEOLOGICUS.html';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.locateInBox === 'function', null, { timeout: 60000 });

  // Construit un mini-DOM contrôlé dans la page, avec deux nœuds texte
  // séparés par un span vide (qui simule un wrap antérieur scindant le texte).
  const result = await page.evaluate(() => {
    const root = document.createElement('div');
    root.innerHTML = 'AAA<span></span>BBB';
    document.body.appendChild(root);

    // Calcule les positions absolues (concaténation des nœuds texte) :
    // "AAA" = 0..3, "BBB" = 3..6. pos=3 est la FRONTIÈRE.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let full = '';
    for (let n = walker.nextNode(); n; n = walker.nextNode()) full += n.nodeValue;

    // Reproductibilité du bug : avant le fix, locateInBox(3) retournait
    // AAA@3 (inclusif). C'est ce qui faisait que wrapByOffset(box, 3, ...)
    // rangeait sur la FIN du nœud AAA et créait un span vide lors du
    // re-wrap. Le fix : locateInBox(3, false) retourne BBB@0.
    const inc = window.locateInBox(root, 3, true);
    const exc = window.locateInBox(root, 3, false);

    // Tests de stabilité : au milieu d'un nœud (pos=1 dans "AAA"),
    // au tout début (pos=0), à la toute fin (pos=6).
    const midAaa = window.locateInBox(root, 1, false); // attendu AAA@1
    const midAaaEnd = window.locateInBox(root, 1, true); // attendu AAA@1
    const start = window.locateInBox(root, 0, false); // attendu AAA@0
    const endExc = window.locateInBox(root, 6, false); // attendu BBB@3 (dernier)
    const endInc = window.locateInBox(root, 6, true);  // attendu BBB@3 (dernier)

    return {
      concatenated: full,
      inc: { tag: inc.node.nodeName, value: inc.node.nodeValue, off: inc.off },
      exc: { tag: exc.node.nodeName, value: exc.node.nodeValue, off: exc.off },
      midAaa: { value: midAaa.node.nodeValue, off: midAaa.off },
      midAaaEnd: { value: midAaaEnd.node.nodeValue, off: midAaaEnd.off },
      start: { value: start.node.nodeValue, off: start.off },
      endExc: { value: endExc.node.nodeValue, off: endExc.off },
      endInc: { value: endInc.node.nodeValue, off: endInc.off },
    };
  });

  console.log('---LOCATE-IN-BOX---');
  console.log('concat:', JSON.stringify(result.concatenated));
  console.log('inclusive(3):', result.inc);
  console.log('exclusive(3):', result.exc);

  const cases = [
    { label: 'inclusive(3) -> AAA@3',  got: result.inc,          expect: ['AAA', 3] },
    { label: 'exclusive(3) -> BBB@0',  got: result.exc,          expect: ['BBB', 0] },
    { label: 'mid(1,exclusive) -> AAA@1', got: result.midAaa,   expect: ['AAA', 1] },
    { label: 'mid(1,inclusive) -> AAA@1', got: result.midAaaEnd, expect: ['AAA', 1] },
    { label: 'start(0) -> AAA@0',       got: result.start,       expect: ['AAA', 0] },
    { label: 'end(6,exclusive) -> BBB@3', got: result.endExc,    expect: ['BBB', 3] },
    { label: 'end(6,inclusive) -> BBB@3', got: result.endInc,    expect: ['BBB', 3] },
  ];

  let failed = 0;
  for (const c of cases) {
    if (c.got.value === c.expect[0] && c.got.off === c.expect[1]) {
      console.log('OK   ' + c.label);
    } else {
      failed++;
      console.log('FAIL ' + c.label + ' got=' + c.got.value + '@' + c.got.off);
    }
  }
  console.log(`---SUMMARY--- ${cases.length - failed}/${cases.length} passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });