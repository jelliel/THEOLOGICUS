/* sonde v537 — reproduit la boucle de suppression groupée à grande échelle
   et journalise tout rejet/réapparition. */
const path = require('path');
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const { chromium } = require('playwright');
const BHC = require('../../../tools/bench_common.js');

(async () => {
  const port = await BHC.pickFreePort();
  const relais = await BHC.spawnRelay({ port });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await BHC.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theologicus_wizard_skipped', '1');
      localStorage.setItem('theo_sync_on_v1', '0');
    } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  const tours = 12, N = 8;
  const rapport = await page.evaluate(async (cfg) => {
    const out = [];
    for (let tour = 0; tour < cfg.tours; tour++) {
      /* semer */
      for (let i = 0; i < cfg.N; i++) {
        await db.put('chats', {
          id: 'probe-' + tour + '-' + i, title: 'P' + i,
          updated: Date.now() - (cfg.N - i) * 1000,
          messages: [{ role: 'user', content: 'Q' }]
        });
      }
      const ids = [];
      for (let i = 0; i < cfg.N; i++) ids.push('probe-' + tour + '-' + i);
      /* la boucle EXACTE de supprimerSelection (v537), sans corbeille */
      const journal = [];
      for (const id of ids) {
        let chat = null;
        try { chat = await db.get('chats', id); } catch (e) { journal.push(id + ':get!' + e.name); }
        try { await db.delete('chats', id); journal.push(id + ':ok'); }
        catch (e) { journal.push(id + ':del!' + (e && e.name || e)); }
      }
      /* poll : la disparition effective */
      let restants = [];
      for (let essai = 0; essai < 40; essai++) {
        const tous = (await db.getAll('chats')).map(c => c.id);
        restants = ids.filter(i => tous.indexOf(i) >= 0);
        if (!restants.length) break;
        await new Promise(r => setTimeout(r, 100));
      }
      out.push({ tour, restants, journal: journal.filter(j => j.indexOf(':ok') < 0) });
      /* nettoyage */
      for (const id of ids) { try { await db.delete('chats', id); } catch (e) {} }
    }
    return out;
  }, { tours, N });

  const mauvais = rapport.filter(r => r.restants.length);
  console.log('tours avec réapparition/persistance : ' + mauvais.length + '/' + tours);
  mauvais.slice(0, 3).forEach(r => console.log(JSON.stringify(r).slice(0, 300)));
  const rejets = rapport.filter(r => r.journal.length);
  console.log('tours avec rejets db : ' + rejets.length);
  rejets.slice(0, 3).forEach(r => console.log(JSON.stringify(r.journal)));
  await browser.close();
  BHC.killRelay(relais);
  process.exit(mauvais.length || rejets.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(3); });
