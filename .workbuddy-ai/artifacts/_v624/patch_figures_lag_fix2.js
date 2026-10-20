// Patch v624b — CORRIGE le throttle atcPersist.
// Bug : _atcPersistRun réinitialisait _atcPersistLeading=false AU DÉMARRAGE
// (synchrone), donc chaque appel croyait être le 1er -> aucun throttle.
// On gère l'état « running » dans atcPersist, pas dans _atcPersistRun.
const fs = require("fs");
const F = "C:/tmp/theoverify/THEOLOGICUS.html";
const BAK = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v624/THEOLOGICUS_html_pre_v624b.bak";
const CRLF = "\r\n";

const src = fs.readFileSync(F, "utf8");
fs.writeFileSync(BAK, src);

const fromLines = [
  "  let _atcPersistTO = null;",
  "  let _atcPersistLeading = false;",
  "  let _atcPersistPromise = null;",
  "  async function _atcPersistRun(){",
  "    _atcPersistTO = null;",
  "    _atcPersistLeading = false;",
  "    try { if (typeof flushChatNow === 'function') flushChatNow(); } catch(e) {}",
  "    try { if (typeof saveChat === 'function') await saveChat(); } catch(e) {}",
  "    try { if (typeof markChatDirty === 'function') markChatDirty(); } catch(e) {}",
  "  }",
  "  function atcPersist(){",
  "    if (!_atcPersistTO && !_atcPersistLeading) {",
  "      _atcPersistLeading = true;",
  "      _atcPersistPromise = _atcPersistRun();",
  "      return _atcPersistPromise;",
  "    }",
  "    if (_atcPersistTO) clearTimeout(_atcPersistTO);",
  "    _atcPersistPromise = new Promise(function(res){ _atcPersistTO = setTimeout(function(){ _atcPersistRun().finally(res); }, 350); });",
  "    return _atcPersistPromise;",
  "  }",
];
const toLines = [
  "  let _atcPersistTO = null;",
  "  let _atcPersistRunning = false;",
  "  let _atcPersistPromise = null;",
  "  async function _atcPersistRun(){",
  "    try { if (typeof flushChatNow === 'function') flushChatNow(); } catch(e) {}",
  "    try { if (typeof saveChat === 'function') await saveChat(); } catch(e) {}",
  "    try { if (typeof markChatDirty === 'function') markChatDirty(); } catch(e) {}",
  "  }",
  "  function atcPersist(){",
  "    if (_atcPersistTO) return _atcPersistPromise;            // trailing déjà planifié",
  "    if (!_atcPersistRunning) {                              // leading : 1re sauvegarde immédiate",
  "      _atcPersistRunning = true;",
  "      _atcPersistPromise = _atcPersistRun().then(function(){ _atcPersistRunning = false; });",
  "      return _atcPersistPromise;",
  "    }",
  "    if (_atcPersistTO) clearTimeout(_atcPersistTO);",
  "    _atcPersistPromise = new Promise(function(res){",
  "      _atcPersistTO = setTimeout(function(){ _atcPersistTO = null; _atcPersistRun().finally(res); }, 350);",
  "    });",
  "    return _atcPersistPromise;",
  "  }",
];

const from = fromLines.join(CRLF);
const to = toLines.join(CRLF);
const i = src.indexOf(from);
const j = src.lastIndexOf(from);
if (i === -1) { console.error("ECHEC : bloc atcPersist introuvable"); process.exit(1); }
if (i !== j) { console.error("ECHEC : bloc NON UNIQUE"); process.exit(1); }

let out = src.slice(0, i) + to + src.slice(i + from.length);
const lf = (out.match(/\n/g) || []).length;
const crlf = (out.match(/\r\n/g) || []).length;
if (lf !== crlf) { console.error("ABORT : LF nu (" + (lf - crlf) + ")"); process.exit(2); }
fs.writeFileSync(F, out);
console.log("OK patch v624b appliqué (" + from.length + " -> " + to.length + " chars)");
console.log("CRLF stable : " + crlf);
