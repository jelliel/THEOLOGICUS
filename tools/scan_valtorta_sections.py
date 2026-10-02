# -*- coding: utf-8 -*-
"""v205 — Moisson des AUTRES sections de maria-valtorta.org.

Regle de droits, comme pour l'Evangile (choix utilisateur valide) :
  - Encyclopedie valtortienne (Personnages, Lieux, Themes, Memo, Calendrier,
    Concordances) : le site declare ces contenus propriete de
    www.maria-valtorta.org « qui en autorise l'usage a titre individuel »
    -> texte conserve.
  - Oeuvres sous droits CEV (Cahiers, Azarias, Epitre aux Romains) : on ne
    conserve que les ENTREES (date + intitule) et le lien vers la page
    officielle ; jamais le texte.
Acces via le relais r.jina.ai (le site bloque l'acces direct), 20 req/min.
"""
import json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tradition", "valtorta_sec.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
PAUSE = 3.3
MAXP = int(os.environ.get("VLT_MAX", "240"))   # plafond de pages par section
B = "https://www.maria-valtorta.org"

SECTIONS = [
    {"id": "calendrier", "nom": "Calendrier de la vie de Jésus", "kind": "texte",
     "note": "Chronologie reconstituee d'apres l'oeuvre (an -53 a +80).",
     "idx": [B + "/Calendrier/index.htm"],
     "follow": [r"/Calendrier/[^)\s]+\.htm"]},
    {"id": "personnages", "nom": "Personnages", "kind": "texte",
     "note": "Biographies des personnages rencontres dans l'oeuvre.",
     "idx": [B + "/Personnages/index.htm", B + "/Personnages/Groupes.htm"],
     "follow": [r"/wiki/(?!Sp%C3%A9cial|Aide|Main_Page|Fichier|Cat%C3%A9gorie|Discussion)[^)\s]+"]},
    {"id": "lieux", "nom": "Lieux", "kind": "texte",
     "note": "Descriptif des lieux cites dans l'oeuvre.",
     "idx": [B + "/Lieux/index.htm"],
     "follow": [r"/wiki/(?!Sp%C3%A9cial|Aide|Main_Page|Fichier|Cat%C3%A9gorie|Discussion)[^)\s]+"]},
    {"id": "themes", "nom": "Thèmes d'enseignement", "kind": "texte",
     "note": "Themes tires de l'oeuvre (wiki Maria Valtorta).",
     "idx": [B + "/Thematiques/index.htm"],
     "follow": [r"/wiki/(?!Sp%C3%A9cial|Aide|Main_Page|Fichier|Cat%C3%A9gorie|Discussion)[^)\s]+"]},
    {"id": "memo", "nom": "Contexte socioculturel", "kind": "texte",
     "note": "Fiches pratiques sur le contexte historique et socioculturel.",
     "idx": [B + "/Memo/index.htm"],
     "follow": [r"/Memo/[^)\s]+\.htm"]},
    {"id": "prieres", "nom": "Spiritualité et prières", "kind": "texte",
     "note": "Florilege de prieres extraites de l'oeuvre.",
     "idx": [B + "/Concordances/index.htm"],
     "follow": [r"/Concordances/[^)\s]+\.htm"]},
    {"id": "cartes", "nom": "Cartes géographiques", "kind": "index",
     "note": "Cartes reconstituees des lieux cites.",
     "idx": [B + "/Cartes/index.htm"], "follow": []},
    {"id": "cahiers", "nom": "Les Cahiers (1943-1950)", "kind": "index",
     "note": "Dictees et visions 1943-1950. Texte sous droits CEV : entrees + lien.",
     "idx": [B + "/Quaderni/index.htm", B + "/Quaderni/index02.htm",
             B + "/Quaderni/index03.htm"],
     "follow": [r"/Quaderni/[^)\s]+\.htm"]},
    {"id": "azarias", "nom": "Livre d'Azarias", "kind": "index",
     "note": "Commentaires liturgiques dictees par l'ange. Droits CEV : entrees + lien.",
     "idx": [B + "/Azarias/Index.htm"],
     "follow": [r"/Azarias/[^)\s]+\.htm"]},
    {"id": "romains", "nom": "Leçons sur l'épître aux Romains", "kind": "index",
     "note": "Commentaires dictees par l'Esprit-Saint. Droits CEV : entrees + lien.",
     "idx": [B + "/Epitre/index.htm"],
     "follow": [r"/Epitre/[^)\s]+\.htm"]},
    {"id": "essentiel", "nom": "L'essentiel en résumé", "kind": "texte",
     "note": "Résumé de chaque tome de l'œuvre.",
     "idx": [B + "/ValtortaWeb/introduction0%d.htm" % i for i in range(6)],
     "follow": []},
    {"id": "mystiques", "nom": "Autres mystiques", "kind": "texte",
     "note": "Marie d'Agréda, Anne-Catherine Emmerich, Brigitte de Suède.",
     "idx": [B + "/ValtortaWeb/MariaAgreda.htm", B + "/ValtortaWeb/ACEmmerich.htm",
             B + "/ValtortaWeb/Brigitte.htm"],
     "follow": []},
    {"id": "dossiers", "nom": "Dossiers", "kind": "texte",
     "note": "Dossiers thématiques de maria-valtorta.org.",
     "idx": [B + "/ValtortaWeb/Dossiers.htm"],
     "follow": [r"/ValtortaWeb/(?!MariaAgreda|ACEmmerich|Brigitte|Plan|RSI|Boutique|Oeuvre|Ressources|MariaValtorta|SeReperer)[^)\s]+\.htm"]},
    {"id": "travaux", "nom": "Travaux de lecteurs", "kind": "index",
     "note": "Études et travaux téléchargeables.",
     "idx": [B + "/Travaux/Experts.htm"],
     "follow": []},
]

DATE_RE = re.compile(
    r"(\d{1,2}\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|"
    r"octobre|novembre|d[ée]cembre)\s+\d{4})", re.I)
# navigation du site (en-tete et pied de page) a retirer des textes
NAV_RE = re.compile(
    r"(L'Évangile tel qu'il m'a été révélé|Centro Editoriale Valtortiano|"
    r"Se repérer|Consulter la Bible en ligne|Aller sur le forum|Qui sommes-nous|Haut de page|"
    r"aucun accent|Plan du [Ss]ite|Sommaire du Tome|Sommaire du site|Page d'accueil|"
    r"Dossier Maria Valtorta|encyclopédie valtortienne|Sélection de liens|"
    r"Les différentes rubriques|Dernière modification|Fiche mise à jour)", re.I)


def nettoie(t):
    """Retire la navigation du site (phrases, ou qu'elles soient)."""
    t = NAV_RE.sub(" ", t)          # les libelles de navigation sont souvent
    out = []                        # sur une seule longue ligne -> global
    for ln in t.split("\n"):
        s = ln.strip()
        if not s:
            out.append("")
            continue
        out.append(ln.rstrip())
    t = "\n".join(out)
    t = t.replace("**", "").replace("__", "")     # marques markdown
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request("https://r.jina.ai/" + url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(6 * (i + 1))


def body(md):
    """Retire l'entete Jina, les images et la navigation du site."""
    i = md.find("Markdown Content:")
    t = md[i + 17:] if i >= 0 else md
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
    t = re.sub(r"\[\s*\]\([^)]*\)", " ", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)      # liens -> texte
    return nettoie(t)


def titre(md, url):
    m = re.search(r"^Title:\s*(.+)$", md, re.M)
    t = (m.group(1) if m else "").strip()
    if t and t.lower() not in ("", "not found"):
        return t
    return url.rsplit("/", 1)[-1].replace("_", " ").replace("%C3%A9", "é")


def entries(txt, url, maxn=400):
    """Decoupe un index en entrees datees (pour les oeuvres sous droits CEV)."""
    out = []
    for m in DATE_RE.finditer(txt):
        seg = re.sub(r"\s+", " ", txt[m.start():m.start() + 240]).strip()
        seg = re.sub(r"^" + re.escape(m.group(1)), "", seg).strip(" .-–—:|")
        out.append({"d": m.group(1), "t": seg[:150], "u": url})
        if len(out) >= maxn:
            break
    return out


def main():
    only = sys.argv[1:] or None
    data = {"meta": {"source": "maria-valtorta.org", "genere": time.strftime("%Y-%m-%d"),
                     "droits": "Encyclopedie : usage individuel autorise par le site. "
                               "Oeuvres CEV (Cahiers, Azarias, Romains) : entrees + lien seulement."},
            "sections": []}
    if os.path.isfile(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
            data["sections"] = [s for s in old.get("sections", [])
                                if only and s["id"] not in only]
        except Exception:
            pass

    t0 = time.time()
    for sec in SECTIONS:
        if only and sec["id"] not in only:
            continue
        print("=== %s (%s)" % (sec["id"], sec["kind"]), flush=True)
        pages, seen = [], set()
        for iu in sec["idx"]:
            try:
                md = fetch(iu)
            except Exception as ex:
                print("   index KO %s" % str(ex)[:60], flush=True)
                continue
            txt = body(md)
            if sec["kind"] == "texte":
                pages.append({"t": sec["nom"] + " — sommaire", "u": iu, "x": txt[:20000]})
            else:
                pages.append({"t": sec["nom"] + " — sommaire", "u": iu,
                              "e": entries(txt, iu), "x": txt[:2500]})
            seen.add(iu)
            # pages liees
            if sec["follow"]:
                links = []
                for pat in sec["follow"]:
                    # le lien peut porter un attribut title : ](url "titre")
                    links += re.findall(
                        r"\]\((https?://www\.maria-valtorta\.org" + pat +
                        r")(?:\s+\"[^\"]*\")?\)", md)
                for u in dict.fromkeys(links):
                    if u in seen:
                        continue
                    seen.add(u)
                    if len(pages) > MAXP:
                        break
                    try:
                        m2 = fetch(u)
                    except Exception:
                        continue
                    tx = body(m2)
                    if len(tx) < 120:
                        continue
                    if sec["kind"] == "texte":
                        pages.append({"t": titre(m2, u), "u": u, "x": tx[:60000]})
                    else:
                        # oeuvre sous droits CEV : entrees datees + lien seulement
                        e = entries(tx, u)
                        pages.append({"t": titre(m2, u), "u": u, "e": e,
                                      "x": tx[:200] if not e else ""})
                    print("   + %-58s %6d c" % (u.split("/")[-1][:58], len(tx)), flush=True)
                    time.sleep(PAUSE)
            time.sleep(PAUSE)
        sec["pages"] = pages
        sec.pop("idx", None)
        sec.pop("follow", None)
        data["sections"] = [s for s in data["sections"] if s["id"] != sec["id"]] + [sec]
        data["sections"].sort(key=lambda s: [x["id"] for x in SECTIONS].index(s["id"]))
        json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("   -> %d pages, total %d sections (%.0fs)"
              % (len(pages), len(data["sections"]), time.time() - t0), flush=True)
    print("OK %s — %.0fs" % (OUT, time.time() - t0))


if __name__ == "__main__":
    main()
