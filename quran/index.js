/* THEOLOGICUS v33 - index du corpus Coran.
   Les sourates sont dans quran/q<p>.js, chargees a la volee par
   window.__ensureQuranSurah(p) quand une reference coranique est survolee. */
(function(){
  if (window.__quranIndexLoaded) return;   /* garde anti double-execution */
  window.__quranIndexLoaded = true;
  window.__quranSurahs = window.__quranSurahs || {};
  window.__corpusReady = window.__corpusReady || {};
  window.__corpusReady.quran = true;   /* signale : corpus pret, sourates a la volee */
  try { document.documentElement.setAttribute('data-quran-index', '1'); } catch(e) {}
})();
