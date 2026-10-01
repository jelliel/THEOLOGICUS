"""
THEOLOGICUS — Lanceur d'application Windows (pywebview)

Démarre le serveur local (fichiers + proxy IA de proxy_server.py)
puis ouvre THEOLOGICUS.html dans une vraie fenêtre Windows (WebView2).

Modes :
  python app.py                 -> fenêtre native (comportement normal)
  THEOLOGICUS_NO_WINDOW=1       -> serveur seul, sans fenêtre (diagnostic)
  python app.py --port 8900     -> port personnalisé (défaut : 8765)
"""

import os
import socket
import sys
import tempfile
import threading
import time
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer

import proxy_server


def app_dir() -> str:
    """Dossier contenant l'exe (mode figé) ou app.py (mode script)."""
    if getattr(sys, "frozen", False):  # PyInstaller
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


# v117 — POURQUOI CE BLOC EXISTE. L'origine d'une page est scheme://hote:port.
# Deux ports différents = deux origines = deux stockages navigateur distincts
# (localStorage, IndexedDB). L'ancien code faisait bind(("", 0)) : un port
# PSEUDO-ALÉATOIRE à chaque lancement dès que 8765 était occupé. La config
# (clé API, réglages, modèles, conversations) paraissait donc effacée à chaque
# ouverture — exactement le symptôme « je dois tout reconfigurer ».
# Désormais : port DÉTERMINISTE (8765, puis 8766, 8767...) et réutilisation
# d'une instance déjà lancée. Le port est enfin stable d'un lancement à l'autre.
#
# v119 — POURQUOI LE DÉMARRAGE ÉTAIT DEVENU LENT (mesuré : ~10,7 s).
# La v117 sondait CHAQUE port de la plage AVANT de démarrer, et le faisait deux
# fois par port : la sonde d'identité PUIS le contenu de THEOLOGICUS.html. Sur
# cette machine, un port de la plage qui n'est ni ouvert ni refusé (aucun RST)
# coûte le timeout ENTIER : 0,4 s. Mesure : 16 ports × (0,4 + 0,4) = 10,7 s.
# L'ancien code ne payait rien car il se contentait d'un bind (0,0 ms).
#
# Le correctif suit un principe simple : NE SONDER QUE CE QUI PEUT RÉPONDRE.
# Un bind réussi est une preuve INSTANTANÉE que le port est libre — donc on
# teste le bind d'abord et on ne sonde que les ports occupés. Et on ne sonde
# qu'UNE fois : le test HTML redondant censé couvrir « une instance d'une
# ancienne version du exe » coûtait aussi cher que le ping et ne servait que
# le temps d'une transition, désormais révolue (la v117 est publiée).
# Coût résultant : 1 bind (0 ms) + 1 sonde sur le seul port occupé (~20 ms).
PORT_SPAN = 16          # 8765 .. 8780
PING_TIMEOUT = 0.25     # la sonde ne sert qu'en local : inutile d'attendre 0,4 s


def port_range(preferred: int) -> list[int]:
    """Plage de ports candidate, déterministe et stable dans le temps."""
    return [preferred + i for i in range(PORT_SPAN)]


def _port_libre(port: int) -> bool:
    """Vrai si l'on peut s'y lier. Preuve instantanée : aucun délai réseau."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _est_notre_serveur(port: int) -> bool:
    """Vrai si un serveur THEOLOGICUS écoute déjà sur ce port.

    Appelée UNIQUEMENT sur un port occupé (donc un serveur répond : le coût
    est de quelques millisecondes, jamais un timeout). Un serveur étranger
    ne connaît pas la sonde et répond 404 → False.
    """
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/__theologicus_ping", timeout=PING_TIMEOUT
        ) as r:
            return r.status == 200 and b"theologicus" in r.read(64)
    except Exception:
        return False


def resoudre_port(ports: list[int]):
    """Rend (port, instance_existante). Ne sonde QUE les ports occupés.

    Parcours de la plage dans l'ordre : au premier port libre on s'arrête
    immédiatement (0 ms). Un port occupé est sondé une seule fois — s'il est
    à nous, on réutilise l'instance (même origine, donc même configuration) ;
    sinon on continue. Coût typique : ~20 ms, contre ~10 700 ms en v117.
    """
    for p in ports:
        if _port_libre(p):
            return p, False
        if _est_notre_serveur(p):
            return p, True
    return None, False


def wait_up(port: int, timeout: float = 5.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


# v129 — GPU. POURQUOI CE BLOC EXISTE, ET CE QU'IL NE FAIT PAS.
#
# D'abord un constat qui evite de chercher au mauvais endroit : pywebview
# N'DESACTIVE PAS le GPU. Son seul argument Chromium est
# `--disable-features=ElasticOverscroll` (edgechromium.py) ; aucun
# `--disable-gpu`, aucun `--disable-gpu-compositing`. Une application WebView2
# rend donc deja sur le GPU des que le pilote le permet.
#
# Ce bloc ne « active » donc pas le GPU : il LEVE LES DERNIERES RESERVES que
# Chromium pourrait opposer a une carte donnee (liste de blocage des pilotes)
# et force trois accélérations qui sont actives par defaut sur Windows mais
# qu'une politique d'entreprise ou un profil de flotte peut avoir coupees.
#
# POURQUOI ON INTERCEPTE L'AFFECTATION. pywebview ecrit :
#     props.AdditionalBrowserArguments = '--disable-features=ElasticOverscroll'
# C'est une AFFECTATION, pas un ajout. La variable d'environnement documentee
# par Microsoft (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS) est donc ecrasee et
# sans effet — verifie. Il faut se placer DANS le setter.
#
# Le setter AJOUTE au lieu d'ecraser : les arguments de pywebview
# (ElasticOverscroll, --allow-file-access-from-files, --remote-debugging-port)
# restent intacts, et une seconde affectation ne duplique rien.
#
# Reglages :
#   THEOLOGICUS_GPU=0            -> aucun drapeau (retour au comportement d'origine)
#   THEOLOGICUS_GPU_MODE=standard|ultra -> niveau (defaut : ultra)
#   THEOLOGICUS_GPU_ARGS=...     -> remplace la liste ci-dessous
#   THEOLOGICUS_GPU_VULKAN=1     -> ajoute --enable-features=Vulkan (ultra uniquement)
#
# ULTRA ajoute au standard :
#   --enable-gpu-compositing  force la composition GPU (deja active par defaut
#                             sur Windows, mais une politique fleet/entreprise
#                             peut l'avoir coupee) ;
#   --disable-gpu-vsync       supprime la synchronisation verticale -> latence
#                             d'entree plus faible (drag/resize plus "colle" a
#                             la souris). Risque mineur : leger tearing possible
#                             et conso GPU un peu plus haute. Revenir a `standard`
#                             si gene.
DRAPEAUX_GPU = (
    "--ignore-gpu-blocklist "
    "--enable-gpu-rasterization "
    "--enable-zero-copy "
    "--enable-accelerated-2d-canvas"
)
DRAPEAUX_GPU_ULTRA = (
    "--ignore-gpu-blocklist "
    "--enable-gpu-rasterization "
    "--enable-zero-copy "
    "--enable-accelerated-2d-canvas "
    "--enable-gpu-compositing "
    "--disable-gpu-vsync"
)


def _version_webview2() -> str | None:
    """Version du moteur WebView2 installe, lue dans le registre.

    Utile au diagnostic : « le GPU n'est pas utilise » n'a pas le meme sens
    selon la version du moteur. Renvoie None si la cle est absente.
    """
    try:
        import winreg
    except ImportError:
        return None
    cle = (r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients"
           r"\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}")
    for ruche, chemin in ((winreg.HKEY_LOCAL_MACHINE, cle),
                          (winreg.HKEY_CURRENT_USER, cle),
                          (winreg.HKEY_LOCAL_MACHINE,
                           cle.replace(r"WOW6432Node\\", ""))):
        try:
            with winreg.OpenKey(ruche, chemin) as k:
                valeur, _ = winreg.QueryValueEx(k, "pv")
                if valeur:
                    return str(valeur)
        except OSError:
            continue
    return None


def activer_drapeaux_gpu() -> str | None:
    """Ajoute nos drapeaux Chromium a ceux de pywebview.

    Renvoie la liste appliquee, ou None si l'on n'a rien fait. Ne leve jamais :
    un echec ici ne doit pas empecher l'application de s'ouvrir.
    """
    desactive = os.environ.get("THEOLOGICUS_GPU", "1").strip().lower() in (
        "0", "non", "false", "off", "no")

    try:
        import webview.platforms.edgechromium as ec
    except Exception as exc:
        if not desactive:
            print(f"[!] GPU : plateforme edgechromium indisponible ({exc})",
                  file=sys.stderr)
        return None

    if desactive:
        # La desactivation doit etre effective MEME si le patch a deja ete pose
        # dans ce processus : on retire la sous-classe au lieu de la laisser en
        # place avec ses anciens drapeaux (verifie : sans ce retrait, remettre
        # THEOLOGICUS_GPU=0 ne retirait rien).
        base = ec.CoreWebView2CreationProperties
        if getattr(base, "_theo_gpu", False):
            ec.CoreWebView2CreationProperties = base._theo_base
        return None

    drapeaux = os.environ.get("THEOLOGICUS_GPU_ARGS")
    if drapeaux is None:
        # Par defaut on applique le niveau ULTRA (voir DRAPEAUX_GPU_ULTRA).
        # `THEOLOGICUS_GPU_MODE=standard` retombe sur le niveau conservateur.
        mode = os.environ.get("THEOLOGICUS_GPU_MODE", "ultra").strip().lower()
        drapeaux = (DRAPEAUX_GPU_ULTRA if mode == "ultra" else DRAPEAUX_GPU)
        if mode == "ultra" and os.environ.get(
                "THEOLOGICUS_GPU_VULKAN", "0").strip().lower() in (
                "1", "oui", "true", "on", "yes"):
            drapeaux = (drapeaux + " --enable-features=Vulkan").strip()
    drapeaux = drapeaux.strip()
    if not drapeaux:
        return None

    # Le premier jeton de la liste sert de sentinelle : si les drapeaux sont
    # deja la, on n'ajoute rien. On ne peut pas tester "ignore-gpu-blocklist" en
    # dur, car THEOLOGICUS_GPU_ARGS peut fournir une autre liste.
    base = ec.CoreWebView2CreationProperties

    # IDEMPOTENCE. Sans ce garde-fou, un second appel EMPILE une sous-classe
    # sur la precedente : les drapeaux du premier appel restent alors actifs et
    # la nouvelle liste n'a plus d'effet (verifie). On met donc a jour la liste
    # portee par la classe deja installee au lieu d'en creer une autre.
    if getattr(base, "_theo_gpu", False):
        base._theo_drapeaux = drapeaux
        return drapeaux

    class _PropsGPU(base):
        _theo_gpu = True
        _theo_base = base
        _theo_drapeaux = drapeaux

        def __setattr__(self, nom, valeur):
            if nom == "AdditionalBrowserArguments" and isinstance(valeur, str):
                actifs = _PropsGPU._theo_drapeaux
                if actifs and actifs.split()[0] not in valeur:
                    valeur = (valeur + " " + actifs).strip()
            return super().__setattr__(nom, valeur)

    ec.CoreWebView2CreationProperties = _PropsGPU
    return drapeaux


# v199 — barre flottante injectee dans les fenetres natives apres CHAQUE
# chargement de page. WebView2 ExecuteScriptAsync n'est pas soumis a la CSP
# de la page : l'injection passe meme sur les sites stricts. La barre donne
# aux fenetres natives ce que les extensions Edge ne peuvent pas y apporter
# (traduction instantanee, copie d'URL) ; elle se re-injecte apres chaque
# navigation (translate.google.com inclus).
NAV_BAR_JS = """
(function(){
  function inject(){
    try {
      if (window.__theoNativeBar) return;
      if (!document.body) { setTimeout(inject, 200); return; }
      window.__theoNativeBar = true;
      var d = document.createElement('div');
      d.id = 'theo-nbar';
      d.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;display:flex;gap:6px;align-items:center;background:#0d1626;border:1px solid rgba(79,142,247,.55);border-radius:12px;padding:6px 8px;box-shadow:0 10px 34px rgba(0,0,0,.5);font:600 12px Consolas,monospace;color:#bfd4ff';
      function btn(label, title, fn){
        var b = document.createElement('button');
        b.textContent = label; b.title = title;
        b.style.cssText = 'background:rgba(28,58,120,.55);color:#bfd4ff;border:1px solid rgba(79,142,247,.35);border-radius:8px;padding:5px 9px;font:700 11px Consolas,monospace;cursor:pointer;white-space:nowrap';
        b.addEventListener('mouseenter', function(){ b.style.borderColor = '#4f8ef7'; b.style.color = '#fff'; });
        b.addEventListener('mouseleave', function(){ b.style.borderColor = 'rgba(79,142,247,.35)'; b.style.color = '#bfd4ff'; });
        b.addEventListener('click', function(ev){ ev.stopPropagation(); fn(b); });
        return b;
      }
      d.appendChild(btn('\\ud83c\\udf10 FR', 'Traduire cette page en français (Google Traduction)', function(){
        location.href = 'https://translate.google.com/translate?sl=auto&tl=fr&u=' + encodeURIComponent(location.href);
      }));
      d.appendChild(btn('\\u21bb', 'Recharger la page', function(){ location.reload(); }));
      d.appendChild(btn('\\ud83d\\udccb URL', "Copier l'adresse de la page", function(b){
        var url = location.href;
        function ok(){ b.textContent = '\\u2713 copié'; setTimeout(function(){ b.textContent = '\\ud83d\\udccb URL'; }, 1200); }
        function fallback(){
          var t = document.createElement('textarea');
          t.value = url; t.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(t); t.select();
          try { document.execCommand('copy'); ok(); } catch (e) {}
          t.remove();
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(ok, fallback);
        } else { fallback(); }
      }));
      /* v200 — recherche dans la page (window.find natif Chromium) */
      d.appendChild(btn('\\ud83d\\udd0d', 'Rechercher dans la page', function(){
        var f = document.getElementById('theo-nfind');
        if (f) { f.remove(); return; }
        f = document.createElement('div');
        f.id = 'theo-nfind';
        f.style.cssText = 'position:fixed;right:14px;bottom:58px;z-index:2147483647;display:flex;gap:6px;align-items:center;background:#0d1626;border:1px solid rgba(79,142,247,.55);border-radius:10px;padding:6px 8px;box-shadow:0 10px 34px rgba(0,0,0,.5)';
        var inp = document.createElement('input');
        inp.placeholder = 'Chercher dans la page…';
        inp.style.cssText = 'width:180px;background:rgba(10,16,28,.9);color:#eaf4ff;border:1px solid rgba(79,142,247,.35);border-radius:6px;padding:5px 8px;font:12px Consolas,monospace;outline:none';
        function doFind(back){
          var q = inp.value;
          if (!q) return;
          try { window.find(q, false, !!back, true, false, false, false); } catch (e) {}
        }
        inp.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') { ev.preventDefault(); doFind(ev.shiftKey); } });
        f.appendChild(inp);
        f.appendChild(btn('\\u2191', 'Occurrence précédente (Maj+Entrée)', function(){ doFind(true); }));
        f.appendChild(btn('\\u2193', 'Occurrence suivante (Entrée)', function(){ doFind(false); }));
        f.appendChild(btn('\\u2715', 'Fermer la recherche', function(){ f.remove(); }));
        document.body.appendChild(f);
        inp.focus();
      }));
      /* v200 — mode lecture : extrait le texte (article/main/p), overlay épuré */
      d.appendChild(btn('\\ud83d\\udcd6', 'Mode lecture — texte épuré, police ajustable', function(){
        var o = document.getElementById('theo-nread');
        if (o) { o.remove(); return; }
        var root = document.querySelector('article') || document.querySelector('main') || document.body;
        var parts = [];
        root.querySelectorAll('h1,h2,h3,p,li,blockquote').forEach(function(el){
          var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!t) return;
          var isH = /^H[123]$/.test(el.tagName);
          if (t.length < 40 && !isH) return;
          parts.push([isH ? 'h' : 'p', t]);
        });
        if (parts.length < 3) {
          parts = [['p', (root.innerText || '').replace(/\\n{3,}/g, '\\n\\n')]];
        }
        if (parts.length < 1) return;
        o = document.createElement('div');
        o.id = 'theo-nread';
        o.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#101828;color:#dce6f5;overflow:auto;padding:36px 0;font:17px/1.75 Georgia,serif';
        var inner = document.createElement('div');
        inner.style.cssText = 'max-width:720px;margin:0 auto;padding:0 24px;box-sizing:border-box;font-size:17px';
        var top = document.createElement('div');
        top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:18px';
        var ttl = document.createElement('b');
        ttl.textContent = '\\ud83d\\udcd6 Lecture';
        ttl.style.cssText = 'font-size:14px;color:#9cc0ff;font-family:Consolas,monospace';
        var ctl = document.createElement('div');
        function mkb(l, fn){
          var b = document.createElement('button');
          b.textContent = l;
          b.style.cssText = 'background:rgba(28,58,120,.55);color:#bfd4ff;border:1px solid rgba(79,142,247,.35);border-radius:8px;padding:4px 9px;margin-left:6px;cursor:pointer;font:700 11px Consolas,monospace';
          b.addEventListener('click', fn);
          return b;
        }
        ctl.appendChild(mkb('A\\u2212', function(){ var s = parseInt(inner.style.fontSize) || 17; inner.style.fontSize = Math.max(12, s - 2) + 'px'; }));
        ctl.appendChild(mkb('A+', function(){ var s = parseInt(inner.style.fontSize) || 17; inner.style.fontSize = Math.min(26, s + 2) + 'px'; }));
        ctl.appendChild(mkb('\\u2715 Fermer', function(){ o.remove(); }));
        top.appendChild(ttl); top.appendChild(ctl);
        inner.appendChild(top);
        parts.forEach(function(pr){
          var el = document.createElement(pr[0] === 'h' ? 'h2' : 'p');
          el.textContent = pr[1];
          if (pr[0] === 'h') { el.style.cssText = 'font-size:20px;color:#9cc0ff;margin:26px 0 12px;line-height:1.4'; }
          else { el.style.cssText = 'margin:0 0 14px'; }
          inner.appendChild(el);
        });
        o.appendChild(inner);
        document.body.appendChild(o);
      }));
      /* v200 — fermer la fenêtre native = retour à l'app (close_current via js_api) */
      d.appendChild(btn('\\u2715', 'Fermer cette fenêtre — retour à THEOLOGICUS', function(){
        try {
          var a = window.pywebview && window.pywebview.api;
          if (a && typeof a.close_current === 'function') { a.close_current(); return; }
        } catch (e) {}
        window.close();
      }));
      document.body.appendChild(d);
    } catch (e) {}
  }
  inject();
})();
"""


class DesktopApi:
    """API exposee au JavaScript sous `window.pywebview.api` (v74).

    Une seule methode pour l'instant : installer une mise a jour. Le
    JavaScript ne peut pas ecrire de fichier ni lancer de programme ; c'est
    donc Python qui telecharge l'installeur puis le lance, avant de fermer
    l'application pour que l'installation puisse ecraser les fichiers.
    """

    def install_update(self, url):
        """Telecharge l'installeur Windows et le lance.

        Leve une exception en cas d'echec : le JavaScript retombe alors sur
        l'ouverture de la page de telechargement dans le navigateur.
        """
        url = str(url or "").strip()
        if not url.startswith("https://"):
            raise ValueError("URL de mise a jour refusee : " + url[:80])

        name = os.path.basename(url.split("?")[0]) or "THEOLOGICUS-Setup-x64.exe"
        if not name.lower().endswith(".exe"):
            raise ValueError("Livrable inattendu : " + name)
        dest = os.path.join(tempfile.gettempdir(), name)

        with urllib.request.urlopen(url, timeout=120) as r:
            data = r.read()
        if len(data) < 1_000_000:
            raise ValueError("Fichier trop petit (%d octets)" % len(data))
        with open(dest, "wb") as f:
            f.write(data)

        # os.startfile est propre a Windows, ce qui est le cas ici.
        os.startfile(dest)  # noqa: S606 - lanceur d'installateur voulu

        # On ferme l'application juste apres : l'installeur doit pouvoir
        # ecraser les fichiers en cours d'utilisation.
        def fermer():
            try:
                import webview
                if webview.windows:
                    webview.windows[0].destroy()
            except Exception:
                pass

        threading.Timer(2.0, fermer).start()
        return {"ok": True, "bytes": len(data), "path": dest}

    def renderer_info(self):
        """Ce que Python sait du moteur de rendu, pour la fiche « Performances ».

        Le JavaScript lit lui-meme le moteur WebGL (WEBGL_debug_renderer_info).
        Il ne peut PAS lire les arguments de navigateur ni la version du moteur :
        ce sont des donnees de processus, pas de page. C'est ce complement que
        cette methode fournit — les deux moities forment le diagnostic complet.
        """
        try:
            import webview
            version_pywebview = getattr(webview, "__version__", None)
        except Exception:
            version_pywebview = None
        return {
            "drapeaux": DRAPEAUX_GPU if os.environ.get(
                "THEOLOGICUS_GPU", "1").strip().lower() not in
                ("0", "non", "false", "off", "no") else "",
            "webview2": _version_webview2(),
            "pywebview": version_pywebview,
            "hote": "exe" if getattr(sys, "frozen", False) else "script",
        }

    # ── v179 — navigateur interne ─────────────────────────────────────────
    # La fenetre principale reste sur l'application ; les liens externes
    # s'ouvrent dans une DEUXIEME fenetre native (meme moteur WebView2, donc
    # tous les sites passent, meme ceux qui refusent l'iframe). Le JavaScript
    # retombe sur le navigateur systeme si cette API est absente (mode script,
    # Android, exe anterieur a v179).

    def open_browser(self, url, titre=""):
        """Ouvre une fenetre native WebView2 dediee au site demande."""
        u = str(url or "").strip()
        if not u.startswith(("http://", "https://")):
            raise ValueError("URL refusee : " + u[:100])
        t = (str(titre or "").strip() or "Navigateur").replace("\n", " ")[:70]
        try:
            import webview
        except ImportError:
            raise RuntimeError("pywebview manquant")
        if not webview.windows:
            raise RuntimeError("pas de fenetre principale")
        # v200 — js_api dédié à cette fenêtre : bouton ✕ de la barre flottante.
        # La fenêtre n'existe pas encore au moment de créer l'api : on passe
        # par un conteneur rempli juste après create_window.
        holder = {}

        class _ChildApi:
            def close_current(self):
                w = holder.get("win")
                if w is not None:
                    try:
                        w.destroy()
                        return {"ok": True}
                    except Exception as e:  # fenêtre déjà détruite, etc.
                        return {"ok": False, "error": str(e)}
                return {"ok": False, "error": "fenetre inconnue"}

        try:
            win = webview.create_window(
                "THEOLOGICUS — " + t,
                u,
                width=1200,
                height=860,
                min_size=(700, 500),
                text_select=True,
                js_api=_ChildApi(),
            )
        except Exception as e:  # fenetre impossible : le JS retombera sur l'externe
            raise RuntimeError("fenetre impossible : %s" % e)
        holder["win"] = win
        # v199 — barre flottante (traduire / recharger / copier l'URL) injectee
        # a chaque chargement de page de cette fenetre native. Re-injectee
        # apres chaque navigation (le drapeau __theoNativeBar est par page).
        try:
            def _inject(*_a, **_k):
                try:
                    win.evaluate_js(NAV_BAR_JS)
                except Exception:
                    pass
            win.events.loaded += _inject
        except Exception:
            pass  # pywebview ancien : barre absente, sans crash
        return {"ok": True}

    def browser_external(self, url):
        """Ouvre l'URL dans le navigateur systeme (repli explicite)."""
        u = str(url or "").strip()
        if not u.startswith(("http://", "https://")):
            raise ValueError("URL refusee : " + u[:100])
        os.startfile(u)  # noqa: S606 - ouverture navigateur voulu
        return {"ok": True}


def main() -> int:
    base = app_dir()
    os.chdir(base)  # répertoire courant = dossier de l'exe / du script

    if getattr(sys, "frozen", False):
        # Mode exe sans console : les erreurs partent dans THEOLOGICUS.log
        try:
            logf = open(os.path.join(base, "THEOLOGICUS.log"), "a", encoding="utf-8")
            logf.reconfigure(line_buffering=True)
            sys.stdout = logf
            sys.stderr = logf
        except Exception:
            pass

    ports = port_range(proxy_server.PORT)
    httpd = None

    # v117 — réutiliser l'instance déjà lancée GARANTIT la même origine, donc
    # la même clé API et la même configuration. Deux fenêtres sur deux ports
    # donnaient deux stockages distincts : c'était le bug.
    # v119 — et le faire SANS sonder les ports libres : voir resoudre_port().
    port, deja_lancee = resoudre_port(ports)
    if port is None:
        print(f"[X] Aucun port libre entre {ports[0]} et {ports[-1]}. "
              f"Fermez l'application ou libérez un port.", file=sys.stderr)
        return 1

    url = f"http://127.0.0.1:{port}/THEOLOGICUS.html"
    if deja_lancee:
        print(f"[OK] Instance THEOLOGICUS déjà en écoute sur le port {port} "
              f"— réutilisée (même origine, même configuration).")
    else:
        proxy_server.SERVE_DIR = base  # les fichiers statiques sont à côté de l'exe
        handler = partial(proxy_server.CORSProxyHandler, directory=base)
        httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
        httpd.daemon_threads = True

        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        server_thread.start()

        # v117 — tracer le port : sans lui, le symptôme était indiagnosticable.
        print(f"[OK] Serveur local démarré sur le port {port} — origine {url}")
        if port != ports[0]:
            print(f"[!] Le port {ports[0]} était occupé : repli sur {port}. "
                  f"Ce repli est déterministe, il sera le même au prochain "
                  f"lancement — mais si l'occupant change, l'origine changera "
                  f"et la configuration du navigateur (pas les clés, elles sont "
                  f"hors installation) sera perdue.", file=sys.stderr)
        if not wait_up(port):
            print("[X] Le serveur local n'a pas démarré.", file=sys.stderr)
            return 1

    if os.environ.get("THEOLOGICUS_NO_WINDOW"):
        print(f"[OK] Serveur prêt : {url}  (Ctrl+C pour arrêter)")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
        finally:
            if httpd is not None:
                httpd.shutdown()
        return 0

    try:
        import webview  # pywebview
    except ImportError:
        print("[X] pywebview manquant : pip install pywebview", file=sys.stderr)
        if httpd is not None:
            httpd.shutdown()
        return 1

    # v129 — a poser AVANT create_window : pywebview lit les proprietes au
    # moment ou il construit le controle WebView2.
    drapeaux = activer_drapeaux_gpu()
    if drapeaux:
        print(f"[OK] Drapeaux GPU transmis a WebView2 : {drapeaux}")
    else:
        print("[info] Drapeaux GPU non appliques (THEOLOGICUS_GPU=0 ou echec).")
    v2 = _version_webview2()
    if v2:
        print(f"[info] Moteur WebView2 : {v2}")

    # Icône : fichier à côté du script ; en mode exe, pywebview extrait
    # automatiquement l'icône embarquée dans l'exécutable.
    icon_path = os.path.join(base, "THEOLOGICUS.ico")
    window = webview.create_window(
        "THEOLOGICUS",
        url,
        width=1400,
        height=900,
        min_size=(1100, 700),
        js_api=DesktopApi(),  # v74 : mise a jour depuis l'application
        confirm_close=False,
        text_select=True,  # indispensable : sinon pywebview injecte body{user-select:none}
                           # et la sélection de texte (bulle AddToChat, surlignage) est morte.
    )
    # private_mode=False : WebView2 persiste ses données (cache, etc.)
    webview.start(
        private_mode=False,
        icon=icon_path if os.path.isfile(icon_path) else None,
    )
    # v117 : ne rien arrêter si l'on a réutilisé une instance déjà lancée.
    if httpd is not None:
        httpd.shutdown()
    return 0


if __name__ == "__main__":
    if "--port" in sys.argv:
        try:
            proxy_server.PORT = int(sys.argv[sys.argv.index("--port") + 1])
        except (IndexError, ValueError):
            pass
    sys.exit(main())
