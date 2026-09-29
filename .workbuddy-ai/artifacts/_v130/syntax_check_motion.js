// Extrait du controleur de motion (v130) -> validation de syntaxe seule.
(function () {
  var LV = 'theologicus_motion', LF = 'theologicus_motion_force';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
  function syncUI(lvl, force){
    var sel = document.getElementById('motion-level');
    var chk = document.getElementById('motion-force');
    if (sel) sel.value = lvl;
    if (chk) chk.checked = !!force;
  }
  function apply(){
    var lvl = lsGet(LV);
    if (!lvl) lvl = mq.matches ? 'off' : 'subtle';
    var force = (lsGet(LF) === '1') || (lvl !== 'off');
    document.documentElement.setAttribute('data-motion', lvl);
    document.documentElement.toggleAttribute('data-motion-force', force);
    syncUI(lvl, force);
  }
  function setLevel(lvl){
    lsSet(LV, lvl);
    var force = (lvl !== 'off');
    document.documentElement.setAttribute('data-motion', lvl);
    document.documentElement.toggleAttribute('data-motion-force', force);
    syncUI(lvl, force);
  }
  function setForce(on){
    lsSet(LF, on ? '1' : '0');
    document.documentElement.toggleAttribute('data-motion-force', on);
    syncUI(document.documentElement.getAttribute('data-motion'), on);
  }
  var sel = document.getElementById('motion-level');
  if (sel) sel.addEventListener('change', function () { setLevel(sel.value); });
  var chk = document.getElementById('motion-force');
  if (chk) chk.addEventListener('change', function () { setForce(chk.checked); });
  if (mq.addEventListener) mq.addEventListener('change', apply);
  apply();
  window.__setMotion = setLevel;
})();
