/* THEOLOGICUS v33 - index du corpus Bible.
   Les livres sont dans bible/b<p>.js, charges a la volee par
   window.__ensureBibleBook(p) quand une reference biblique est survolee. */
(function(){
  if (window.__bibleIndexLoaded) return;   /* garde anti double-execution */
  window.__bibleIndexLoaded = true;
  window.__bibleBooks = window.__bibleBooks || {};
  window.__corpusReady = window.__corpusReady || {};
  window.__corpusReady.bible = true;   /* signale : corpus pret, livres a la volee */
  try { document.documentElement.setAttribute('data-bible-index', '1'); } catch(e) {}
})();
