// v441 — Prove-It : (1) le relais est multi-threads (une génération IA en
// cours ne bloque plus les autres requêtes) ; (2) le fournisseur « Ollama
// (local) » répond en chat réel via resolveModelConfig/callLLM ; (3) le
// repli des commentaires atteint Ollama quand le primaire échoue.
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8765;
const MOCK = 8783;
const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  // relais frais multi-threads — journal en fichier (le stdout redirigé est tamponné)
  const LOG = path.join(__dirname, 'bench.log');
  fs.writeFileSync(LOG, 'début\n');
  const log = s => fs.appendFileSync(LOG, s + '\n');
  try { execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"', { timeout: 10000 }); } catch (e) { log('kill port: ' + String(e).slice(0, 80)); }
  const relay = spawn('py', ['-3.12', 'proxy_server.py'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 3500));
  log('relais lancé');

  // serveur de test : la page + une route primaire qui échoue en 401
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    if (rel.startsWith('fail401')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"Rate limit exceeded","code":"1300"}}');
      return;
    }
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(MOCK, '127.0.0.1', r));

  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage();
  await page.addInitScript(() => { localStorage.setItem('theologicus_wizard_skipped', '1'); });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { const line = `  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`; log(line); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${MOCK}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // 1. Registre : Ollama présent, sans clé exigée
    const reg = await page.evaluate(() => {
      const p = PROVIDERS.find(x => x.id === 'ollama');
      const cfg = resolveModelConfig('ollama:qwen2.5:0.5b');
      return { present: !!p, base: p && p.base, cfg: cfg ? { endpoint: cfg.endpoint, apiKey: cfg.apiKey } : null };
    });
    ok('le registre contient « Ollama (local) »', reg.present && /11434/.test(reg.base));
    ok('resolveModelConfig fournit endpoint local et clé fictive', reg.cfg && /11434\/v1\/chat\/completions$/.test(reg.cfg.endpoint) && reg.cfg.apiKey === 'local');

    // 2. Chat réel via Ollama (modèle installé qwen2.5:0.5b)
    const chat = await page.evaluate(async () => {
      const cfg = resolveModelConfig('ollama:qwen2.5:0.5b');
      const t0 = Date.now();
      const r = await callLLM(cfg, [{ role: 'user', content: 'Réponds uniquement par le mot: TOULOUSE' }], { temperature: 0, max_tokens: 20 });
      return { r: (r || '').trim(), ms: Date.now() - t0 };
    });
    ok('appel réel Ollama → réponse non vide en ' + Math.round(chat.ms / 1000) + 's', chat.r.length > 0 && chat.ms < 120000, chat.r.slice(0, 40));

    // 3. Concurrence : deux générations lancées, la page reste servie
    const conc = await page.evaluate(async () => {
      const cfg = resolveModelConfig('ollama:qwen2.5:0.5b');
      const gen1 = callLLM(cfg, [{ role: 'user', content: 'Compte lentement jusquà trois.' }], { max_tokens: 60 });
      const t0 = Date.now();
      const r2 = await fetch('http://127.0.0.1:8765/THEOLOGICUS.html');
      const msPage = Date.now() - t0;
      await gen1;
      return { msPage, ok: r2.ok, octets: (await r2.arrayBuffer()).byteLength };
    });
    ok('relais multi-threads : la page est servie en ' + conc.msPage + 'ms PENDANT une génération', conc.ok && conc.msPage < 2000 && conc.octets > 1000000);

    // 4. Repli des commentaires : primaire 401 → Ollama répond
    const cmt = await page.evaluate(async () => {
      state.model = 'fail401-uid';
      state.customModels = [{ uid: 'fail401-uid', name: 'primaire en échec', model: 'faux', baseUrl: 'http://127.0.0.1:' + location.port + '/fail401/v1', apiKey: 'x', format: 'chat-completions' }];
      const msg = { ts: 't9', role: 'assistant', content: 'Un message de test', annotations: [] };
      state.messages = [msg];
      const ann = { id: 'oll1', text: 'passage de test', a: null, loading: true };
      msg.annotations.push(ann);
      await window.__atcProveIt.runCommentLLM(ann, { text: 'passage de test', msgTs: 't9' }, msg);
      return { a: ann.a, err: ann.error };
    });
    ok('échec primaire → commentaire obtenu via Ollama local', !cmt.err && typeof cmt.a === 'string' && cmt.a.length > 0, (cmt.err || '').slice(0, 80));

    ok('aucune erreur JavaScript', errors.length === 0);
    log(`RESULTAT : ${pass}/6`);
    process.exitCode = pass === 6 ? 0 : 1;
  } catch (e) {
    log('EXCEPTION BANC : ' + String(e).slice(0, 400));
    process.exitCode = 1;
  } finally {
    await browser.close(); server.close(); relay.kill();
  }
})();
