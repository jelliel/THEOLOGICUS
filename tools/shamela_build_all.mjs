import fs from 'fs';
import path from 'path';

const RAW = 'C:\\tmp\\theo_tests\\shamela_raw';
const APP = 'C:\\tmp\\theoverify';
const OUT = path.join(APP, 'tradition', 'asbab');

/* Les sept recueils d'asbab al-nuzul de la categorie « علوم القرآن » de Shamela.
   Les deux editions d'al-Wahidi portent la MEME etiquette de source : elles
   disent la meme chose, on ne veut pas afficher deux fois le meme recit. */
const LIVRES = [
  { id: 11314, src: 'الواحدي',       nom: "الواحدي — أسباب النزول (ت الحميدان)" },
  { id: 11456, src: 'الواحدي',       nom: "الواحدي — أسباب النزول (ت زغلول)" },
  { id: 2247,  src: 'السيوطي',       nom: "السيوطي — لباب النقول في أسباب النزول" },
  { id: 2102,  src: 'ابن حجر',       nom: "ابن حجر — العجاب في بيان الأسباب" },
  { id: 95559, src: 'المحرر',        nom: "المحرر في أسباب نزول القرآن (الكتب التسعة)" },
  { id: 11547, src: 'الصحيح المسند', nom: "الصحيح المسند من أسباب النزول" },
  { id: 14582, src: 'الاستيعاب',     nom: "الاستيعاب في بيان الأسباب" }
];

const SURA = {
  'الفاتحة':1,'البقرة':2,'آل عمران':3,'النساء':4,'المائدة':5,'الأنعام':6,'الأعراف':7,'الأنفال':8,'التوبة':9,'يونس':10,
  'هود':11,'يوسف':12,'الرعد':13,'إبراهيم':14,'الحجر':15,'النحل':16,'الإسراء':17,'الكهف':18,'مريم':19,'طه':20,
  'الأنبياء':21,'الحج':22,'المؤمنون':23,'النور':24,'الفرقان':25,'الشعراء':26,'النمل':27,'القصص':28,'العنكبوت':29,'الروم':30,
  'لقمان':31,'السجدة':32,'الأحزاب':33,'سبأ':34,'فاطر':35,'يس':36,'الصافات':37,'ص':38,'الزمر':39,'غافر':40,
  'فصلت':41,'الشورى':42,'الزخرف':43,'الدخان':44,'الجاثية':45,'الأحقاف':46,'محمد':47,'الفتح':48,'الحجرات':49,'ق':50,
  'الذاريات':51,'الطور':52,'النجم':53,'القمر':54,'الرحمن':55,'الواقعة':56,'الحديد':57,'المجادلة':58,'الحشر':59,'الممتحنة':60,
  'الصف':61,'الجمعة':62,'المنافقون':63,'التغابن':64,'الطلاق':65,'التحريم':66,'الملك':67,'القلم':68,'الحاقة':69,'المعارج':70,
  'نوح':71,'الجن':72,'المزمل':73,'المدثر':74,'القيامة':75,'الإنسان':76,'المرسلات':77,'النبأ':78,'النازعات':79,'عبس':80,
  'التكوير':81,'الانفطار':82,'المطففين':83,'الانشقاق':84,'البروج':85,'الطارق':86,'الأعلى':87,'الغاشية':88,'الفجر':89,'البلد':90,
  'الشمس':91,'الليل':92,'الضحى':93,'الشرح':94,'الانشراح':94,'التين':95,'العلق':96,'القدر':97,'البينة':98,'الزلزلة':99,'الزلزال':99,
  'العاديات':100,'القارعة':101,'التكاثر':102,'العصر':103,'الهمزة':104,'الفيل':105,'قريش':106,'الماعون':107,'الكوثر':108,'الكافرون':109,
  'النصر':110,'المسد':111,'اللهب':111,'الإخلاص':112,'الفلق':113,'الناس':114
};

function depouille(s) {
  let out = ''; const idx = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/[\u064B-\u0652\u0670\u06D6-\u06ED\u0640]/.test(c)) continue;
    out += c; idx.push(i);
  }
  idx.push(s.length);
  return { out, idx };
}
function norm(s) {
  return String(s || '')
    .replace(/\u0670/g, '\u0627')
    .replace(/[\u064B-\u065F\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647')
    .replace(/[\u0624\u0626]/g, '\u0621')
    .replace(/[^\u0621-\u064A\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const nu = s => norm(s).replace(/\s/g, '').replace(/\u0621/g, '');

function chargerCoran() {
  const coran = {};
  for (const f of fs.readdirSync(path.join(APP, 'quran')).filter(x => /^q\d+\.js$/.test(x))) {
    const s = fs.readFileSync(path.join(APP, 'quran', f), 'utf8');
    const n = +f.match(/^q(\d+)\.js$/)[1]; const v = {};
    const re = /"(\d+)":\{"text":"(?:[^"\\]|\\.)*","arabe":"((?:[^"\\]|\\.)*)"/g;
    let m; while ((m = re.exec(s)) !== null) v[+m[1]] = nu(m[2].replace(/\\"/g, '"'));
    coran[n] = v;
  }
  return coran;
}
function htmlVersTexte(h) {
  return h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}
function blocNass(h) {
  const i = h.indexOf('class="nass'); if (i < 0) return '';
  const d = h.indexOf('>', i) + 1;
  let f = h.indexOf('<div id="appended_pages"', d);
  if (f < 0) f = h.indexOf('<div id="prepended_pages"', d);
  return h.slice(d, f < 0 ? h.length : f);
}
function suraDePage(h) {
  const m = h.match(/book\/\d+\/\d+"><span class="text-black">([^<]+)<\/span>/g);
  if (m) for (const seg of m) {
    const nom = seg.replace(/[\s\S]*>([^<]+)<\/span>$/, '$1').trim().replace(/^سورة\s*/, '').trim();
    if (SURA[nom]) return { n: SURA[nom], nom, noms: nomsDeSegment(nom) };
    /* v3 — segment composite (« المعوذتين: الفلق والناس ») : ni clé exacte ni
       sourate unique, mais plusieurs sourates connues dedans. */
    const noms2 = nomsDeSegment(nom);
    if (noms2) return { n: noms2[0], nom, noms: noms2 };
  }
  return null;
}
/* v3 — un segment de fil d'Ariane peut nommer PLUSIEURS sourates
   (« سورة المعوذتين: الفلق والناس ») : on rend chaque sourate connue du
   segment, sinon les pages المعوذتين (113 + 114) n'aboutissaient nulle part. */
function nomsDeSegment(seg) {
  const out = [];
  const mots = seg.replace(/^سورة\s*/, '').split(/[\s:،,\-]+/);
  for (let mot of mots) {
    while (mot.startsWith('و') && mot.length > 3 && !SURA[mot]) mot = mot.slice(1);
    if (SURA[mot] !== undefined && !out.includes(SURA[mot])) out.push(SURA[mot]);
  }
  return out.length ? out : null;
}
function suraDansTexte(orig) {
  const m = orig.match(/سُورَةُ\s+([^\s]{2,20})/) || orig.match(/سورة\s+([^\s]{2,20})/);
  if (m) { const c = m[1].replace(/[^\u0621-\u064A]/g, ''); if (SURA[c]) return { n: SURA[c], nom: c }; }
  return null;
}

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar2n = s => +String(s).replace(/[٠-٩]/g, d => AR.indexOf(d));

const coran = chargerCoran();

function versetParTexte(suraN, citation) {
  const mots = norm(citation).split(' ').filter(Boolean);
  const suras = suraN ? [String(suraN)] : Object.keys(coran);
  for (const n of [10, 8, 6, 5, 4, 3]) {
    if (mots.length < n) continue;
    /* décalages 0..3 : selon les éditions la citation commence par le nom de
       la sourate, ou par un mot d'introduction resté collé. */
    for (const off of [0, 1, 2, 3]) {
      if (mots.length < n + off) continue;
      const tete = nu(mots.slice(off, off + n).join(' '));
      if (tete.length < 10) continue;
      for (const s of suras) {
        for (const [v, t] of Object.entries(coran[s] || {})) if (t.includes(tete)) return { s: +s, v: +v };
      }
    }
  }
  return null;
}

const RE_ANCRE = /(?<![\u0621-\u064A])قوله/g;
const RE_QUOTE = /\{([^}]{2,700})\}/;
const RE_NUM = /^\s*(?:الآية|الآيات|إلى\s+آخره|الى\s+اخره)?\s*\{([٠-٩0-9][٠-٩0-9،,\s\-–]*)\}/;

const parSura = {};
const stats = {};

/* ---- v2 : format « puces » (الاستيعاب، لباب النقول…) ----
   Ces livres structurent leurs récits en « • عن فلان قال : … » avec la
   citation coranique entre ﴿…(٥)…﴾, SANS l'ancre « قوله » : le parseur
   principal ne captait rien d'eux, et 20 sourates restaient sans notice.
   On n'applique ce parseur qu'aux sourates que le passage principal n'a PAS
   couvertes (MANQUANTES) : zéro risque de doublon ou de fausse attribution
   sur les 94 sourates déjà correctes. Une puce sans citation coranique
   (ex. « أنزلت سورة النمل بمكة ») est rattachée au verset 1, convention
   classique des rapports portant sur la sourate entière ; une puce qui suit
   une citation hérite de ses numéros (portés aussi d'une page sur l'autre). */
const MANQUANTES = new Set([27, 34, 35, 71, 73, 78, 82, 84, 87, 88, 90, 91, 94, 98, 100, 101, 103, 104, 113, 114]);
let pendingPairs = [];        // dernière citation ﴿…﴾ RÉSOLUE (sourate, verset), reportée d'une page à l'autre
let pendingSuras = [];
const reBraces = /﴿([^﴿]*)﴾/g;
function epureRecit(seg) {
  let corps = seg;
  const coupures = [
    /\([٠-٩]+\)\s*[-–]/,
    /\([٠-٩]+\)\s*\.\s*\([٠-٩]+\)/,
    /\([٠-٩]+\)\s+(?:ذكره|ذكرهما|أخرجه|أخرجهما|رواه|رواهما|انظر|وذكره)/,
  ];
  for (const re of coupures) { const m = corps.match(re); if (m) { corps = corps.slice(0, m.index); break; } }
  return corps.replace(/^سورة\s+[^\s.:،]+[.:،]?\s*/, '')
              .replace(/^﴿[^﴿]*﴾\s*/, '')
              .replace(/^«[^»]*»\s*/, '')
              .replace(/\s+/g, ' ').trim();
}
/* Chaque citation ﴿…﴾ est confrontée au TEXTE CORANIQUE (versetParTexte) :
   attribution précise (sourate, verset) — indispensable pour les pages
   المعوذتين qui mêlent les versets de الفلق et de الناس. */
function pairesDe(t) {
  const out = []; let qm; reBraces.lastIndex = 0;
  while ((qm = reBraces.exec(t)) !== null) {
    const r = versetParTexte(null, qm[1]);
    if (r && !out.some(c => c.s === r.s && c.v === r.v)) out.push({ s: r.s, v: r.v });
  }
  return out;
}
function bulletPage(orig, suras, src) {
  if (!suras.some(sn => pendingSuras.includes(sn))) pendingPairs = [];
  pendingSuras = suras;
  const segs = orig.split('•');
  for (let i = 1; i < segs.length; i++) {
    const brut = segs[i].trim();
    if (!brut || /قوله/.test(brut)) continue;
    const corps = epureRecit(brut);
    if (corps.length < 40) continue;
    let cibles = pairesDe(brut);
    if (!cibles.length) cibles = pendingPairs.filter(p => suras.includes(p.s));
    if (!cibles.length) cibles = suras.map(sn => ({ s: sn, v: 1 }));
    cibles.forEach(c => (parSura[c.s] = parSura[c.s] || []).push({ v: c.v, src, t: corps }));
  }
  const paires = pairesDe(orig);
  if (paires.length) pendingPairs = paires;
}

for (const L of LIVRES) {
  const dir = path.join(RAW, String(L.id));
  if (!fs.existsSync(dir)) { console.log('ABSENT : ' + L.id + ' ' + L.nom); continue; }
  const fichiers = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
  let n = 0, avecNum = 0, resolus = 0, sansNum = 0, sansSura = 0, courts = 0;

  for (const f of fichiers) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const orig = htmlVersTexte(blocNass(html));
    if (!orig || orig.length < 60) continue;
    const sura = suraDePage(html) || suraDansTexte(orig);
    const { out, idx } = depouille(orig);

    const ancres = []; RE_ANCRE.lastIndex = 0; let m;
    while ((m = RE_ANCRE.exec(out)) !== null) ancres.push(m.index);

    ancres.forEach((a, k) => {
      const finA = k + 1 < ancres.length ? ancres[k + 1] : out.length;
      /* On retire l'amorce « قوله تعالى : » — mais sur le texte DÉPOUILLÉ :
         dans l'original elle porte les harakat (`قَوْلُهُ تَعَالَى:`) et un
         motif littéral ne la reconnaîtrait pas. Sans ce retrait, la citation
         ne commence pas le corps et n'est plus reconnue. */
      const pref = out.slice(a, Math.min(a + 44, out.length))
        .match(/^قوله\s*(?:تعالى|عز\s*وجل|عزوجل)?\s*[-–:]?\s*/);
      const deb = a + (pref ? pref[0].length : 0);
      let corps = orig.slice(idx[deb], idx[finA]).trim();

      /* numero de verset : format a accolades quand il existe */
      let numero = null;
      const q = corps.match(RE_QUOTE);
      if (q && q.index < 30) {
        const apres = corps.slice(q.index + q[0].length);
        const nn = apres.match(RE_NUM);
        if (nn) { const d = nn[1].match(/[٠-٩0-9]+/); if (d) numero = ar2n(d[0]); corps = apres.slice(nn[0].length).trim(); }
      }
      /* coupe a la premiere note de bas de page de l'editeur */
      const mf = corps.match(/\([٠-٩]+\)\s*[-–]/);
      if (mf) corps = corps.slice(0, mf.index).trim();
      if (corps.length < 40) { courts++; return; }

      let s = sura ? sura.n : null;
      let noms = sura ? (sura.noms || [sura.n]) : null;
      if (numero === null) {
        const r = versetParTexte(s, corps.slice(0, 220));
        if (r) { numero = r.v; if (!s) { s = r.s; noms = [r.s]; } resolus++; }
      }
      if (numero === null) { sansNum++; return; }
      const cibles = noms || (s ? [s] : null);
      if (!cibles) { sansSura++; return; }
      avecNum++; n++;
      /* v3 — page à sourates multiples (المعوذتين = 113 + 114) : le récit est
         porté par chacune des sourates nommées. */
      cibles.forEach(sn => (parSura[sn] = parSura[sn] || []).push({ v: numero, src: L.src, t: corps }));
    });

    /* v2/v3 — récits en puces, uniquement pour les sourates non couvertes.
       Le garde « pas d'ancre قوله » est levé : ces pages-là n'ont rien produit
       par le passage principal (sansNum/sansSura), aucun doublon possible. */
    const manq = sura ? (sura.noms || [sura.n]).filter(sn => MANQUANTES.has(sn)) : [];
    if (manq.length) bulletPage(orig, manq, L.src);
  }
  stats[L.id] = { nom: L.nom, pages: fichiers.length, notices: n, avecNum, resolus, sansNum, courts };
  console.log(L.id + '  ' + String(n).padStart(5) + ' notices  (' + fichiers.length + ' pages)  ' + L.nom);
}

/* ---- dedoublonnage ----
   Deux niveaux, parce que les deux éditions d'al-Wahidi disent la MEME chose
   avec une présentation différente (isnād ponctué autrement) :
   1. clé exacte (verset + 120 premiers caractères normalisés) ;
   2. similarité de Jaccard sur les mots, À L'INTÉRIEUR d'une même source :
      deux récits qui partagent plus de 60 % de leur vocabulaire sont le même
      récit — on garde le plus long. En revanche deux récits DIFFÉRENTS du même
      auteur pour le même verset sont conservés : c'est le fond de ces recueils. */
const CLE = t => nu(t).slice(0, 120);
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  A.forEach(w => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter || 1);
}
let avant = 0;
for (const s of Object.keys(parSura)) {
  const parV = {};
  for (const e of parSura[s]) {
    avant++;
    const k = e.v + '|' + CLE(e.t);
    if (!parV[k]) parV[k] = e;
    else if (e.t.length > parV[k].t.length) parV[k].t = e.t;
  }
  const liste = Object.values(parV);
  const parGroupe = {};
  liste.forEach(e => (parGroupe[e.v + '|' + e.src] = parGroupe[e.v + '|' + e.src] || []).push(e));
  const gardes = [];
  Object.values(parGroupe).forEach(g => {
    const mots = g.map(e => nu(e.t).split(' ').filter(Boolean));
    const pris = [];
    g.forEach((e, i) => {
      for (const j of pris) if (jaccard(mots[i], mots[j]) > 0.6) {
        if (e.t.length > g[j].t.length) g[j].t = e.t;   /* on garde la version la plus complete */
        return;
      }
      pris.push(i);
    });
    pris.forEach(i => gardes.push(g[i]));
  });
  parSura[s] = gardes;
}

/* ---- ecriture ---- */
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^s\d+\.json$/.test(f)) fs.unlinkSync(path.join(OUT, f));
let octets = 0, suras = 0, couverts = 0, notices = 0;
for (const s of Object.keys(parSura).sort((a, b) => a - b)) {
  const arr = parSura[s].sort((a, b) => a.v - b.v);
  couverts += new Set(arr.map(e => e.v)).size;
  notices += arr.length;
  const js = JSON.stringify({ s: +s, e: arr.map(e => ({ v: e.v, src: e.src, t: e.t })) });
  fs.writeFileSync(path.join(OUT, 's' + String(s).padStart(3, '0') + '.json'), js);
  octets += Buffer.byteLength(js); suras++;
}
const legend = {};
LIVRES.forEach(L => legend[L.src] = L.nom);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ src: legend }));

console.log('\n--- PAR OUVRAGE ---');
Object.values(stats).forEach(x => console.log('  ' + String(x.notices).padStart(5) + ' notices | ' + x.pages + ' pages | ' + x.nom));
console.log('\nTOTAL : ' + notices + ' notices (' + avant + ' avant dedoublonnage) | ' + suras + ' sourates | ' + couverts + ' versets couverts | ' + (octets / 1024).toFixed(0) + ' Ko');
