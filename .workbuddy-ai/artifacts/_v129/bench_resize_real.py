# -*- coding: utf-8 -*-
"""Bench REEL : mesure l'ecart d'image (FPS) pendant un drag d'un
`.atc-figbox`, OLD (synchrone) vs NEW (coalescing rAF). Moteur = Edge
systeme en headless, pilote via CDP (cdp_ws.py, connexion Python OK).

On cree deux boites et on envoie un burst d'evenements espaces de 8,3 ms
(=> ~120 Hz, cadence souris haute frequence) pendant ~5 s. Un sondage rAF
independant mesure l'ecart median d'image. Le handler NEW ne doit provoquer
qu'UNE mutation de style par image -> moins de reflow -> FPS plus stable.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "_v126", "_perf_bench"))
from cdp_ws import CDP  # noqa: E402

TEST_HTML = r"""<!doctype html><html><head><meta charset=utf-8><style>
.atc-figbox{position:absolute;box-sizing:border-box;border:2px solid #4f8ef7;
  contain:layout style;will-change:width,height,left,top;background:rgba(79,142,247,.08)}
#host{position:relative;width:100vw;height:100vh}
</style></head><body><div id=host></div><script>
window.__bench = async function(variant){
  var host=document.getElementById('host'); host.innerHTML='';
  var fb=document.createElement('div'); fb.className='atc-figbox';
  fb.style.left='10px'; fb.style.top='10px';
  fb.style.width='150px'; fb.style.height='90px';
  if(variant==='new') fb.classList.add('dragging');
  host.appendChild(fb);
  var batches=0, frames=[], last=performance.now(), n=0, done=false;
  function probe(){ if(done) return; var t=performance.now();
    frames.push(t-last); last=t; n++; if(n<240) requestAnimationFrame(probe); }
  requestAnimationFrame(probe);
  var N=600, _ev=null,_raf=0;
  function apply(){ _raf=0; var ev=_ev; _ev=null; if(!ev) return;
    batches++; fb.style.width=(150+ev.x)+'px'; fb.style.height=(90+ev.y)+'px';
    fb.style.left=(10-ev.x)+'px'; }
  // envoi espacé de 8,3 ms (~120 Hz)
  function fire(i){
    if(i>=N){ done=true; return; }
    setTimeout(function(){
      var ev={x:i,y:i};
      if(variant==='old'){ batches++; fb.style.width=(150+i)+'px';
        fb.style.height=(90+i)+'px'; fb.style.left=(10-i)+'px'; }
      else { _ev=ev; if(!_raf) _raf=requestAnimationFrame(apply); }
      fire(i+1);
    }, 8.3);
  }
  fire(0);
  // attendre la fin + 400 ms de marge
  await new Promise(function(res){ var w=setInterval(function(){
    if(done){ clearInterval(w); setTimeout(res,400); } },50); });
  var s=frames.slice(1).sort(function(a,b){return a-b;});
  var med=s[Math.floor(s.length/2)]||0;
  return JSON.stringify({variant:variant, batches:batches,
    images:frames.length, median_ms:+med.toFixed(2),
    fps:+(1000/med).toFixed(1)});
};
</script></body></html>"""

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9223
PROFILE = os.path.join(HERE, "edge_profile")


def main():
    os.makedirs(PROFILE, exist_ok=True)
    test_path = os.path.join(HERE, "bench_resize_test.html")
    with open(test_path, "w", encoding="utf-8") as fh:
        fh.write(TEST_HTML)
    proc = subprocess.Popen(
        [EDGE, "--headless=new", "--remote-debugging-port=%d" % PORT,
         "--user-data-dir=" + PROFILE, "--no-first-run",
         "--no-default-browser-check", "--disable-background-networking",
         "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws = None
        for _ in range(40):
            try:
                with urllib.request.urlopen(
                        "http://127.0.0.1:%d/json/version" % PORT, timeout=1) as r:
                    ws = json.loads(r.read().decode()).get("webSocketDebuggerUrl")
                    if ws:
                        break
            except Exception:
                time.sleep(0.5)
        if not ws:
            print("[!] Edge ne repond pas sur le port CDP -> bench annule")
            return 1
        # On recupere la cible page deja lancee (pas l'endpoint navigateur).
        page_ws = None
        for _ in range(30):
            try:
                with urllib.request.urlopen(
                        "http://127.0.0.1:%d/json/list" % PORT, timeout=1) as r:
                    for t in json.loads(r.read().decode()):
                        if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                            page_ws = t["webSocketDebuggerUrl"]
                            break
            except Exception:
                pass
            if page_ws:
                break
            time.sleep(0.3)
        if not page_ws:
            print("[!] Aucune cible page -> bench annule")
            return 1
        c = CDP(page_ws, timeout=30.0)
        c.connecter()
        c.appeler("Page.enable")
        c.appeler("Runtime.enable")
        c.appeler("Page.navigate", {"url": "file://" + test_path})
        time.sleep(2.0)
        for variant in ("old", "new"):
            out = c.evaluer("window.__bench('%s')" % variant,
                            attendre_promesse=True, timeout=30)
            d = json.loads(out)
            print("[bench %-3s] batches=%d  images=%d  ecart median=%.2f ms  ~%.1f FPS"
                  % (variant, d["batches"], d["images"], d["median_ms"], d["fps"]))
        c.fermer()
        return 0
    finally:
        try:
            proc.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
