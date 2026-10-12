/* sonde v537 v2 — reproduit le banc FIDELEMENT (poll concurrent + corbeille +
   instrumentation des transactions IndexedDB) pour attraper le scénario exact. */
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

  const tours = 15, N = 4;
  const rapport = await page.evaluate(async (cfg) => {
    const J = [];   /* journal global horodaté */
    const t0 = performance.now();
    const log = (m) => J.push(Math.round(performance.now() - t0) + 'ms ' + m);
    /* INSTRUMENTATION : envelopper db.put / db.delete / db.getAll */
    const origPut = db.put.bind(db), origDel = db.delete.bind(db), origAll = db.getAll.bind(db);
    db.put = async (store, data) => {
      try {
        const r = await origPut(store, data);
        log('put ' + store + ':' + (data && data.id));
        return r;
      } catch (e) { log('put!' + store + ':' + (data && data.id) + ' ' + (e && e.name)); throw e; }
    };
    db.delete = async (store, id) => {
      try {
        const r = await origDel(store, id);
        log('del ' + store + ':' + id);
        return r;
      } catch (e) { log('del!' + store + ':' + id + ' ' + (e && e.name || e)); throw e; }
    };
    db.getAll = async (store) => {
      const r = await origAll(store);
      return r;
    };
    const out = [];
    for (let tour = 0; tour < cfg.tours; tour++) {
      log('── tour ' + tour + ' : semis');
      for (let i = 0; i < cfg.N; i++) {
        await db.put('chats', { id: 'sel-test-' + i, title: 'C' + i,
          updated: Date.now() - (cfg.N - i) * 1000,
          messages: [{ role: 'user', content: 'Q' + i }, { role: 'assistant', content: 'R' + i }] });
      }
      /* le POLL CONCURRENT du banc, pendant la suppression */
      const ids = ['sel-test-0', 'sel-test-1', 'sel-test-2', 'sel-test-3'];
      let arrete = false;
      const poll = (async () => {
        while (!arrete) {
          const tous = (await db.getAll('chats')).map(c => c.id);
          if (ids.every(i => tous.indexOf(i) < 0)) { arrete = true; break; }
          await new Promise(r => setTimeout(r, 25));
        }
      })();
      /* la boucle EXACTE de supprimerSelection, corbeille comprise */
      const corb = window.__v521Corbeille;
      for (const id of ids) {
        let chat = null;
        try { chat = await db.get('chats', id); } catch (e) { log(id + ' get!' + e.name); }
        try {
          if (chat && corb && typeof corb.mettre === 'function') corb.mettre(chat);
          await db.delete('chats', id);
        } catch (e) { log(id + ' DEL!' + (e && e.name || e)); }
      }
      await poll;
      const tous = (await db.getAll('chats')).map(c => c.id);
      const restants = ids.filter(i => tous.indexOf(i) >= 0);
      log('── tour ' + tour + ' : restants=' + JSON.stringify(restants));
      out.push({ tour, restants });
      for (const id of ids) { try { await db.delete('chats', id); } catch (e) {} }
    }
    return { out, journal: J.slice(-60) };
  }, { tours, N });

  const mauvais = rapport.out.filter(r => r.restants.length);
  console.log('tours avec persistance : ' + mauvais.length + '/' + tours);
  if (mauvais.length) {
    console.log('JOURNAL (fin) :');
    rapport.journal.forEach(l => console.log('  ' + l));
  }
  await browser.close();
  BHC.killRelay(relais);
  process.exit(mauvais.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(3); });
