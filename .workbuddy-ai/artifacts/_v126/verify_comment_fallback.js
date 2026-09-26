// v126l — Prove-It : le commentaire doit retenter via Agnes quand le
// fournisseur primaire (Mistral) échoue — quota 429, 401, etc.
// On sert le VRAI THEOLOGICUS.html et on intercepte /proxy/ : Mistral → 401
// (échec rapide, comme le 429 quota mais sans attendre 105 s de relance),
// Agnes → 200 chat completion. Le parcours callLLM/fetchLLMResponse/
// readLLMJson + repli est donc réel, seul le réseau est mocké.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8771;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/THEOLOGICUS.html') || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(path.join(ROOT, 'THEOLOGICUS.html')).pipe(res);
      return;
    }
    if (req.url.startsWith('/proxy/https://api.mistral.ai/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"object":"error","message":"Rate limit exceeded","type":"rate_limited","code":"1300"}');
      return;
    }
    if (req.url.startsWith('/proxy/https://apihub.agnes-ai.com/')) {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Commentaire de secours via Agnes' } }] }));
      });
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  server.on('request', (req) => {
    if (req.url.startsWith('/proxy/') || req.url.endsWith('.xyz-inconnu')) console.log('  [MOCK] ' + req.method + ' ' + req.url.slice(0, 110));
  });
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.addInitScript(() => { localStorage.setItem('theologicus_wizard_skipped', '1'); });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let pass = 0; const total = 7;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!window.__atcProveIt && !!window.callLLM, null, { timeout: 60000 });

    // 1-3 : la configuration de secours
    const cfgChecks = await page.evaluate(() => {
      const f = window.__atcProveIt.cfgCommentaireSecours;
      const out = {};
      state.keys.agnes = 'cle-agnes-test';
      out.avecCle = !!(f({ endpoint: 'https://api.mistral.ai/v1/chat/completions' }));
      out.dejaAgnes = f({ endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions' }) === null;
      delete state.keys.agnes;
      delete localStorage.removeItem; // no-op garde-fou
      localStorage.setItem('agnes_api_key', 'cle-iframe-ai-video');
      out.viaIframe = !!(f({ endpoint: 'https://api.mistral.ai/v1/chat/completions' }));
      localStorage.removeItem('agnes_api_key');
      out.sansCle = f({ endpoint: 'https://api.mistral.ai/v1/chat/completions' }) === null;
      return out;
    });
    for (const [name, ok] of Object.entries(cfgChecks)) {
      console.log(`  ${ok ? '[OK]  ' : '[ECHEC]'}${name}`);
      if (ok) pass++;
    }

    // 4 : parcours complet runCommentLLM — primaire 401 → repli Agnes → réponse
    const run = await page.evaluate(async () => {
      state.model = 'mistral-small-latest';
      state.apiKey = 'cle-mistral-limitee';
      state.agent = null;
      state.keys.agnes = 'cle-agnes-test';
      state.customModels = [];
      state.messages = [{ ts: 't1', role: 'assistant', content: 'Un message de test', annotations: [] }];
      const msg = state.messages[0];
      const ann = { id: 'banc1', text: 'passage de test', a: null, loading: true };
      msg.annotations.push(ann);
      const cfgDiag = resolveModelConfig('mistral-small-latest');
      console.log('[BANC] cfg primaire endpoint=' + cfgDiag.endpoint + ' apiKey=' + cfgDiag.apiKey);
      await window.__atcProveIt.runCommentLLM(ann, { text: 'passage de test', msgTs: 't1' }, msg);
      return { a: ann.a, err: ann.error, loading: ann.loading };
    });
    const okRepli = !run.loading && run.a === 'Commentaire de secours via Agnes' && !run.err;
    console.log(`  ${okRepli ? '[OK]  ' : '[ECHEC]'}échec primaire → commentaire obtenu via Agnes (${JSON.stringify(run).slice(0, 120)})`);
    if (okRepli) pass++;

    // 5 : sans repli possible, l'erreur primaire est bien propagée
    const run2 = await page.evaluate(async () => {
      delete state.keys.agnes;
      state.messages = [{ ts: 't2', role: 'assistant', content: 'Un message de test', annotations: [] }];
      const msg = state.messages[0];
      const ann = { id: 'banc2', text: 'passage de test', a: null, loading: true };
      msg.annotations.push(ann);
      await window.__atcProveIt.runCommentLLM(ann, { text: 'passage de test', msgTs: 't2' }, msg);
      return { err: ann.error, loading: ann.loading };
    });
    const okErreur = !run2.loading && !!run2.err;
    console.log(`  ${okErreur ? '[OK]  ' : '[ECHEC]'}sans clé Agnes, l'erreur primaire est affichée (${String(run2.err).slice(0, 90)})`);
    if (okErreur) pass++;

    const okJs = errors.length === 0;
    console.log(`  ${okJs ? '[OK]  ' : '[ECHEC]'}aucune erreur JavaScript non interceptée`);
    if (okJs) pass++;

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
