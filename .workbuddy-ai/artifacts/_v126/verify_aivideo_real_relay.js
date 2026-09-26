// Test du CHEMIN COMPLET avec le serveur style-exe (ThreadingHTTPServer 127.0.0.1)
// et le RELAI REEL vers l'API Agnes reelle. Cle factice -> on attend
// « Clé invalide » (401). Si « Erreur réseau », le bug est dans le relais/chemin.
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8781';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\toshr\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErr = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text()); });

  await page.addInitScript(() => { try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {} });
  await page.goto(BASE + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { const b = document.getElementById('open-aivideo-modal'); if (b) b.click(); });
  await page.waitForTimeout(2000);

  const fl = page.frameLocator('#aivideo-frame');
  await fl.locator('#api-key-input').waitFor({ timeout: 8000 });
  await fl.locator('#api-key-input').fill('sk-fictif-pour-test-401');
  await fl.locator('#api-verify-btn').evaluate((b) => b.click());
  await page.waitForTimeout(6000); // laisse le relai parler a Agnes reelle

  const status = (await fl.locator('#api-status-text').textContent())?.trim();
  console.log('STATUT      : ' + status);
  console.log('console.err : ' + JSON.stringify(consoleErr));
  await ctx.close();
  await browser.close();
  const ok = status && (status.includes('invalide') || status.includes('valide'));
  console.log(ok ? 'RESULT: chemin relai reel OK (statut lisible)' : 'RESULT: BUG — statut « Erreur réseau » ou indefini');
  process.exit(ok ? 0 : 1);
})();
