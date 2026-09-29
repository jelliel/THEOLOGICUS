# -*- coding: utf-8 -*-
"""Bench REEL : charge THEOLOGICUS.html dans Edge headless (CDP) et mesure
l'ecart d'image (FPS) pour chaque niveau de motion, pour confirmer qu'aucune
regression n'apparait (notamment le fond ambiant infini en mode 'rich').
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

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9224
PROFILE = os.path.join(HERE, "edge_profile_motion")
HTML = r"C:\tmp\theoverify\THEOLOGICUS.html"

JS_PROBE = r"""
new Promise(function(res){
  var d=[],last=performance.now(),n=0;
  function step(){var t=performance.now();d.push(t-last);last=t;n++;
    if(n<90)requestAnimationFrame(step);
    else{var s=d.slice(1).sort(function(a,b){return a-b});
      res(JSON.stringify({mediane:s[Math.floor(s.length/2)],n:s.length}));}}
  requestAnimationFrame(step);
})
"""


def main():
    os.makedirs(PROFILE, exist_ok=True)
    proc = subprocess.Popen(
        [EDGE, "--headless=new", "--remote-debugging-port=%d" % PORT,
         "--user-data-dir=" + PROFILE, "--no-first-run",
         "--no-default-browser-check", "--disable-background-networking", HTML],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws = None
        for _ in range(40):
            try:
                with urllib.request.urlopen(
                        "http://127.0.0.1:%d/json/version" % PORT, timeout=1) as r:
                    ws = json.loads(r.read().decode()).get("webSocketDebuggerUrl")
            except Exception:
                time.sleep(0.5)
            if ws:
                break
        if not ws:
            print("[!] Edge ne repond pas sur le port CDP -> bench annule")
            return 1
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
        time.sleep(2.5)
        info = c.evaluer(
            "(function(){var h=document.documentElement;return JSON.stringify({"
            "dataMotion:h.getAttribute('data-motion'),"
            "ambient:!!document.getElementById('theo-ambient'),"
            "sel:!!document.getElementById('motion-level'),"
            "dur:getComputedStyle(h).getPropertyValue('--motion-dur')});})()")
        print("[init] " + info)
        for lvl in ("off", "subtle", "medium", "rich"):
            c.evaluer(
                "(function(){var h=document.documentElement;"
                "h.setAttribute('data-motion','%s');"
                "h.setAttribute('data-motion-force','%s');})()"
                % (lvl, "1" if lvl != "off" else "0"))
            hz = json.loads(c.evaluer(JS_PROBE, attendre_promesse=True, timeout=30))
            print("[fps %-6s] mediane=%.1f ms  ~%.0f FPS"
                  % (lvl, hz["mediane"], 1000.0 / hz["mediane"]))
        c.fermer()
        return 0
    finally:
        try:
            proc.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
