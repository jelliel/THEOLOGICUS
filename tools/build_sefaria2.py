#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_sefaria2.py — Talmud (Babylone + Jérusalem), Mishna et Philon en anglais
pour la BIBLIOTHÈQUE hors-ligne de THEOLOGICUS (v178).

Sources : API REST sefaria.org (même accès que build_sefaria.py).
  Bavli            : 1 requête par traité — plage <T>.2a-<N>b (N = schema.lengths[0])
  Yerushalmi       : plage <T>.1-<N> (perakim, N = lengths[0])
  Mishnah          : plage <T>.1-<N> (chapitres, N = lengths[0])
  Philo            : plage clampée <T>.1-99 (l'API rend ce qui existe)

Sorties :
  tradition/talmud/<Slug>.json    {t, seder, coll, units:[{u:'2a', lines:[...]}]}
  tradition/yerushalmi/<Slug>.json
  tradition/mishnah/<Slug>.json
  tradition/philo/<Slug>.json
  tradition/sefaria_lib.json      index des collections pour l'onglet BIBLIOTHÈQUE
Cache disque : sefaria/cache/lib_<Slug>.json (réponse finale) et ix_<Slug>.json (schémas).
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = r'C:\tmp\theoverify'
CACHE = os.path.join(ROOT, 'sefaria', 'cache')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'application/json'}
DELAY = 0.4

COLLS = [
    ('Bavli', 'talmud', 'Talmud de Babylone', 'sef_bavli_works.json', True),
    ('Yerushalmi', 'yerushalmi', 'Talmud de Jérusalem', 'sef_yerushalmi_works.json', False),
    ('Mishnah', 'mishnah', 'Mishna', 'sef_mishnah_works.json', False),
    ('Philo', 'philo', 'Philon d\u2019Alexandrie', 'sef_philo_works.json', False),
]


def slug(t):
    return re.sub(r'[^A-Za-z0-9]+', '_', t).strip('_')[:90]


def api(url, tries=4, timeout=240):
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (404, 400):
                return {'__err': 'HTTP %d' % e.code}
            time.sleep(3 + 3 * a)
        except Exception as e:
            time.sleep(3 + 3 * a)
    return {'__err': 'gave up'}


def save_cache(name, d):
    json.dump(d, open(os.path.join(CACHE, name + '.json'), 'w', encoding='utf-8'),
              ensure_ascii=False)
    time.sleep(DELAY)


def load_cache(name):
    p = os.path.join(CACHE, name + '.json')
    if os.path.exists(p) and os.path.getsize(p) > 5:
        try:
            return json.load(open(p, encoding='utf-8'))
        except Exception:
            pass
    return None


def strip_tags(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    for a, b in [('&nbsp;', ' '), ('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
                 ('&#8217;', "'"), ('&#8216;', "'"), ('&quot;', '"'),
                 ('&#8211;', '-'), ('&#8212;', '-')]:
        s = s.replace(a, b)
    s = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), s)
    return ' '.join(s.split())


def unit_paras(item):
    """Item de texte Sefaria -> liste de paragraphes lisibles."""
    def flat(x):
        if isinstance(x, str):
            return [x]
        out = []
        for c in x:
            out.extend(flat(c))
        return out
    if isinstance(item, str):
        return [item] if item.strip() else []
    if all(isinstance(c, str) for c in item):
        return [strip_tags(c) for c in item if strip_tags(c)]
    out = []
    for c in item:
        if isinstance(c, str):
            t = strip_tags(c)
            if t:
                out.append(t)
        else:
            t = ' '.join(strip_tags(s) for s in flat(c))
            if t.strip():
                out.append(t)
    return out


def talmud_labels(count, start=2):
    labels = []
    daf, side = start, 0
    for _ in range(count):
        labels.append('%d%s' % (daf, 'ab'[side]))
        side += 1
        if side == 2:
            side = 0
            daf += 1
    return labels


def process(coll_key, dirname, coll_name, works, daf_labels):
    lib = []
    for wi, w in enumerate(works, 1):
        T = w['t']
        Tq = urllib.parse.quote(T)
        cname = 'lib_' + slug(T)
        raw = load_cache(cname)
        if raw is None:
            sch = load_cache('ix_' + slug(T))
            if sch is None:
                sch = api('https://www.sefaria.org/api/index/' + Tq)
                if sch is None:
                    sch = {'__err': 'idx'}
                else:
                    save_cache('ix_' + slug(T), sch)
                time.sleep(DELAY)
            schd = sch.get('schema') or {}
            at = (schd.get('addressTypes') or [''])[0]
            lengths = schd.get('lengths') or []
            if at == 'Talmud':
                n = int(lengths[0]) if lengths else 63
                raw = None
                for back in range(5):
                    url = 'https://www.sefaria.org/api/texts/%s.2a-%db?version=english' % (Tq, n - back)
                    d = api(url)
                    if d and d.get('text'):
                        raw = d
                        break
                if raw is None:
                    raw = {'__err': 'no range'}
            else:
                n = int(lengths[0]) if lengths else 99
                url = 'https://www.sefaria.org/api/texts/%s.1-%d?version=english' % (Tq, n)
                raw = api(url)
            save_cache(cname, raw)
        text = raw.get('text')
        if not text:
            lib.append({'t': T, 'seder': w.get('seder', ''), 'f': '', 'n': 0})
            print('%s %3d/%d  --  %-55s (pas d\u2019anglais)' % (coll_key, wi, len(works), T[:55]), flush=True)
            continue
        if daf_labels:
            labels = talmud_labels(len(text))
        else:
            labels = [str(i + 1) for i in range(len(text))]
        units = []
        for i, item in enumerate(text):
            lines = unit_paras(item)
            if lines:
                units.append({'u': labels[i] if i < len(labels) else str(i + 1),
                              'lines': lines})
        if not units:
            lib.append({'t': T, 'seder': w.get('seder', ''), 'f': '', 'n': 0})
            print('%s %3d/%d  --  %-55s (vide)' % (coll_key, wi, len(works), T[:55]), flush=True)
            continue
        f = slug(T) + '.json'
        data = {'t': T, 'seder': w.get('seder', ''), 'coll': coll_name,
                'src': 'sefaria.org', 'units': units}
        od = os.path.join(ROOT, 'tradition', dirname)
        os.makedirs(od, exist_ok=True)
        json.dump(data, open(os.path.join(od, f), 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        lib.append({'t': T, 'seder': w.get('seder', ''), 'f': f, 'n': len(units)})
        size = os.path.getsize(os.path.join(od, f)) / 1e3
        print('%s %3d/%d  EN  %-55s %4d unités (%5.0f Ko)' % (coll_key, wi, len(works), T[:55], len(units), size), flush=True)
    return lib


def main():
    os.makedirs(CACHE, exist_ok=True)
    lib = {'built': time.strftime('%Y-%m-%d %H:%M'), 'src': 'sefaria.org', 'colls': []}
    for key, dirname, coll_name, works_file, daf_labels in COLLS:
        works = json.load(open(os.path.join(CACHE, works_file), encoding='utf-8'))
        works = [w for w in works if isinstance(w.get('t'), str) and w['t'].strip()]
        entries = process(key, dirname, coll_name, works, daf_labels)
        ok = [e for e in entries if e['f']]
        lib['colls'].append({'name': coll_name, 'dir': dirname,
                             'works': ok, 'nworks': len(ok),
                             'nworksTotal': len(entries)})
        print('=== %s : %d/%d œuvres EN' % (coll_name, len(ok), len(entries)), flush=True)
    out = os.path.join(ROOT, 'tradition', 'sefaria_lib.json')
    json.dump(lib, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('OK %s (%.1f Mo)' % (out, os.path.getsize(out) / 1e6), flush=True)


if __name__ == '__main__':
    main()
