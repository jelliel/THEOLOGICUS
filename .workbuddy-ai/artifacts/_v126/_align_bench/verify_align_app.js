// Bench Playwright — vérifie que les annotations restent correctement alignées
// après un round-trip innerHTML (re-render complet du message), en utilisant le
// VRAI code de THEOLOGICUS.html via window.__applyHighlights.
//
// Scénario : message assistant avec liste numérotée (repris du screenshot
// 2026-09-28 132735.png). On annote 3 mots/expressions, on force un re-render,
// on vérifie que la concaténation des spans atc-hl pour chaque hlId correspond
// au texte original.

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
  await page.waitForFunction(() => typeof window.__applyHighlights === 'function' && typeof window.onAddToChat === 'function', null, { timeout: 60000 });

  // Attend que l'init de l'app soit terminée (welcome banner visible)
  await page.waitForSelector('.v12-welcome', { timeout: 30000 });

  // Injecte un message de test directement dans le DOM (imite ce que ferait
  // renderMessages). Le state.messages reste vide mais on n'en a pas besoin :
  // onAddToChat lit window._atcSel + range, et on appelle window.__applyHighlights
  // manuellement après chaque annotation / re-render.

  // Injecte un message de test directement dans state (via la voie légitime :
  // saveChat() + nouveau chat, ou on monkey-patch via la closure. Plus simple :
  // on simule un chat existant en injectant par window si accessible. Sinon on
  // passe par useSuggestion + mock fetch. Pour rester stable on utilise une
  // approche DOM-directe qui imite le rendu interne.
  await page.evaluate(() => {
    // Neutralise l'appel LLM
    window.runCommentLLM = () => {};
    // mdToHtml local minimal (mêmes règles que la v126) pour rendre le texte
    // — on insère dans #chat-container via innerHTML directement, comme le fait
    // renderMessages(), mais en gardant l'identifiant mc-{ts} attendu.
    function mdMini(t) {
      let s = t.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      const lines = s.split('\n');
      const out = []; let inList = false;
      for (const line of lines) {
        const m = line.match(/^(\d+)\.\s+(.*)/);
        if (m) { if (!inList) { out.push('<ol>'); inList = true; } out.push('<li>' + m[2] + '</li>'); }
        else { if (inList) { out.push('</ol>'); inList = false; } out.push(line); }
      }
      if (inList) out.push('</ol>');
      return out.join('\n');
    }
    const ts = 1779091234567;
    const md = [
      "Non, Tertullien n'a jamais écrit que le Livre d'Hénoc fut retiré *à cause des propriétés d'un Messie déjà venu*.",
      "En revanche :",
      "",
      "1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).",
      "2. Il **ne** justifie pas **son** exclusion du canon, **contrairement** à **Athanase** ou Épiphan**e**.",
      "3. La formulation que vous citez ressemble à une **interprétation ultérieure** (peut-être médiévale) de sa pensée.",
    ].join('\n');
    const html = mdMini(md);
    const container = document.getElementById('chat-container');
    container.innerHTML = '<div class="message assistant"><div class="msg-label">▸ THEOLOGICUS</div><div class="message-content" id="mc-' + ts + '">' + html + '</div></div>';
    // Pose les annotations directement dans state via une astuce :
    // state.messages est privé, mais on peut peupler window.state
    // — or state n'est pas exposé. On contourne en stockant l'état d'annotation
    // dans un registre global que applyHighlights ne touche pas, puis on
    // appelle manuellement la machinerie via les helpers internes.
    // Mais comme state est privé, on ne peut pas injecter. Donc on simule
    // l'appel via window.onAddToChat en positionnant window._atcSel + sélection.
    window.__testTs = ts;
  });

  // Attend que le DOM soit prêt
  const ts = await page.evaluate(() => window.__testTs);
  await page.waitForSelector('#mc-' + ts);

  // Helper qui simule "Add to chat" sur un texte ciblé
  async function annotate(target) {
    await page.evaluate((t) => {
      const ts = window.__testTs;
      const box = document.getElementById('mc-' + ts);
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
      let full = ''; const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
      const idx = full.indexOf(t);
      if (idx === -1) throw new Error('target not found: ' + t);
      let sc=null,so=0,ec=null,eo=0;
      for (const {node,start} of nodes) {
        const end = start + node.nodeValue.length;
        if (!sc && idx >= start && idx < end) { sc=node; so=idx-start; }
        if (!ec && (idx + t.length) > start && (idx + t.length) <= end) { ec=node; eo=(idx+t.length)-start; }
      }
      const range = document.createRange();
      range.setStart(sc, so); range.setEnd(ec, eo);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      window._atcSel = { text: t, msgTs: ts, range, rect: range.getBoundingClientRect(), occ: 0 };
      window.onAddToChat();
    }, target);
    await page.waitForTimeout(40);
  }

  // Étape 1-3 : annote les 3 cibles (cf. screenshot)
  await annotate('canonique');
  await annotate('marcionisme');
  await annotate('interprétation ultérieure');

  // Récupère les annotations stockées via le DOM
  const annotations = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#mc-' + window.__testTs + ' [data-hl-id]').forEach(sp => {
      out.push({ id: sp.dataset.hlId, spanText: (sp.textContent || '').trim() });
    });
    return out;
  });

  // Forcer un re-render complet : on lit innerHTML puis on le réapplique
  await page.evaluate(() => {
    const ts = window.__testTs;
    const box = document.getElementById('mc-' + ts);
    const html = box.innerHTML;
    box.innerHTML = '';
    box.innerHTML = html;
    // Déclenche applyHighlights — les annotations viennent d'être perdues car
    // state.messages est privé. On doit donc les réinjecter. Pour ce test on
    // appelle applyHighlights et on regarde si les spans existants (qui sont
    // dans le innerHTML restauré) sont reconnus.
    window.__applyHighlights();
  });

  // Vérifie que pour chaque hlId unique, la concaténation des spans = texte original
  const result = await page.evaluate(() => {
    const ts = window.__testTs;
    const box = document.getElementById('mc-' + ts);
    const spans = Array.from(box.querySelectorAll('[data-hl-id]'));
    const byId = new Map();
    for (const sp of spans) {
      const id = sp.dataset.hlId;
      if (!byId.has(id)) byId.set(id, '');
      byId.set(id, byId.get(id) + sp.textContent);
    }
    return Array.from(byId.entries()).map(([id, text]) => ({ id, text: text.trim() }));
  });

  console.log('---ANNOTATIONS (avant re-render)---');
  for (const a of annotations) console.log(`  ${a.id}  span="${a.spanText}"`);
  console.log('---APRÈS re-render---');
  let failed = 0;
  // Targets originales :
  const targets = ['canonique', 'marcionisme', 'interprétation ultérieure'];
  for (const t of targets) {
    const matching = result.filter(r => r.text === t);
    if (matching.length > 0) {
      console.log(`OK   "${t}"  -> ${matching.length} hlId(s) covering it`);
    } else {
      console.log(`FAIL "${t}"  -> aucun hlId ne couvre ce texte`);
      failed++;
    }
  }
  console.log(`---SUMMARY--- ${targets.length - failed}/${targets.length} passed`);

  if (consoleLines.length) {
    console.log('---CONSOLE (extrait)---');
    for (const l of consoleLines.slice(0, 6)) console.log(l);
  }

  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });