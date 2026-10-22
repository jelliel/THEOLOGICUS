# Correction des bancs qui retirent encore le nœud setup-wizard-overlay
# (course v629 : initWizardEvents coupé -> chat jamais rendu -> flaky CI).
import io, re, sys

BANCS = [
    '.workbuddy-ai/artifacts/_v624/verify_figures_no_lag.js',
    '.workbuddy-ai/artifacts/_v625/verify_rAF_throttle.js',
    '.workbuddy-ai/artifacts/_v626/verify_nav_mark.js',
    '.workbuddy-ai/artifacts/_v627/verify_fig_layers.js',
    '.workbuddy-ai/artifacts/_v628/verify_lazy_apply.js',
]

REMOVE_OLD = re.compile(
    r'      \["auth-overlay", "setup-wizard-overlay"(, "onboarding-overlay")?\]\.forEach\(function\(id\)\{\r\n'
    r'        const o = document\.getElementById\(id\); if \(o\) o\.remove\(\);\r\n'
    r'      \}\);')

REMOVE_NEW = (
    '      const o = document.getElementById("auth-overlay"); if (o) o.remove();\r\n'
    '      /* v629/v631 — NE PAS retirer setup-wizard-overlay : une course avec\r\n'
    '         initWizardEvents (DOMContentLoaded) coupe l\'init -> chat jamais rendu\r\n'
    '         (flaky CI constate). Desarmement EN BOUCLE : la classe "active" saute\r\n'
    '         sous 300 ms, les retries Playwright passent, le noeud reste en place. */\r\n'
    '      window.__disarmTimer = setInterval(function () {\r\n'
    '        const w = document.getElementById("setup-wizard-overlay");\r\n'
    '        if (w) w.classList.remove("active");\r\n'
    '      }, 300);')

SEED_ANCHOR = 'try { localStorage.setItem("theo_debug", "1"); } catch (e) {}'
SEED_NEW = SEED_ANCHOR + '\r\n    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}'

for path in BANCS:
    raw = io.open(path, 'rb').read().decode('utf-8')
    # Les bancs JS sont en LF (seul THEOLOGICUS.html exige le CRLF) — on suit
    # la convention du fichier.
    nl = '\r\n' if raw.count('\r\n') > (raw.count('\n') - raw.count('\r\n')) else '\n'
    lf_avant = raw.count('\n') - raw.count('\r\n')
    remove_pat = REMOVE_OLD.pattern.replace('\\r\\n', nl)
    remove_re = re.compile(remove_pat)
    n_remove = len(remove_re.findall(raw))
    if n_remove == 0:
        if '__disarmTimer' in raw:
            print('deja corrige :', path)
            continue
        print('MOTIF ABSENT (a traiter a la main) :', path)
        continue
    remove_new = REMOVE_NEW.replace('\r\n', nl)
    raw = remove_re.sub(remove_new, raw)
    seed_anchor = SEED_ANCHOR.replace('\r\n', nl)
    seed_new = SEED_NEW.replace('\r\n', nl)
    if 'theologicus_wizard_skipped' not in raw:
        cnt = raw.count(seed_anchor)
        if cnt == 1:
            raw = raw.replace(seed_anchor, seed_new)
        else:
            print('SEED non unique (%d) dans %s' % (cnt, path))
            sys.exit(2)
    lf = raw.count('\n') - raw.count('\r\n')
    if nl == '\n':
        if '\r' in raw:
            print('ERREUR : CR introduit dans un fichier LF :', path)
            sys.exit(3)
    else:
        if lf > lf_avant:
            print('ERREUR : nouveaux LF nus dans', path)
            sys.exit(3)
    io.open(path, 'wb').write(raw.encode('utf-8'))
    print('corrige :', path)
