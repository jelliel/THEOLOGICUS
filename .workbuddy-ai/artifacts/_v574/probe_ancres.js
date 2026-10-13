/* Sonde d'ancres v574 — imprime en JSON les octets exacts autour de chaque point d'édition */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
const src = fs.readFileSync(F, 'utf8');
function probe(nom, sous, ctxAv, ctxAp) {
  const i = src.indexOf(sous);
  if (i === -1) { console.log(nom + ' : ABSENT'); return; }
  const n = src.split(sous).length - 1;
  const a = src.slice(Math.max(0, i - (ctxAv || 0)), i + sous.length + (ctxAp || 0));
  console.log(nom + ' x' + n + ' : ' + JSON.stringify(a));
}
probe('v564.esc', ".replace(/&/g, '&')", 120, 160);
probe('v571.esc', '.replace(/&/g, "&")', 40, 180);
probe('MAX_CTX', 'var MAX_CTX', 20, 120);
probe('btn-tts-ligne', "id=\"adeodat-tts\" type=\"button\"", 60, 140);
probe('env-listener', "pan.querySelector('#adeodat-env')", 30, 120);
probe('sous-titre', 'le Compagnon — V3.0</div>', 130, 40);
probe('envoyer-def', 'async function envoyer(texte) {', 40, 60);
probe('ajouterH-assistant', "ajouterH('assistant', txt);", 10, 120);
probe('inp-focus', "const inp = document.getElementById('adeodat-in');", 30, 90);
probe('penser-def', 'async function penser(texteUser, onChunk) {', 30, 40);
probe('penser-msgs', "msgs.push({ role: 'user', content: texteUser });", 260, 60);
probe('penser-call', 'const plein = await penser(texte, ttsx);', 20, 60);
probe('ouvrir-continuSet', 'window.__v566Libre.continuSet(true); } catch (e) {}', 30, 60);
probe('fermer-session', 'window.__v566Libre.fermerSession) window.__v566Libre.fermerSession(); } catch (e) {}', 30, 60);
probe('v571-dictee-flags', 'var dicteeDemandee = false, dicteeSuspendue = false;', 30, 60);
probe('v571-guard', 'if (!dicteeDemandee || dicteeSuspendue || enCoursTranscription) return;', 60, 40);
probe('v571-clore', 'window.__v564Adeodat.envoyer(texte);   /* envoyer suspend la dictée', 180, 220);
probe('v571-boucle', 'if (dicteeDemandee && !dicteeSuspendue) capter();', 40, 40);
probe('v571-exports', 'cfgTranscription: cfgTranscription, encoderWav: encoderWav', 40, 80);
probe('v571-insec', 'dicteeArreter(true);\r\n        return false;', 80, 80);
probe('v571-catch', 'dicteeArreter(true);\r\n      return false;', 60, 80);
probe('fin-fichier', '</body>', 120, 20);
probe('dernier-module', '<script id="v572-adeodat-jauge">', 10, 40);
const ap = fs.readFileSync('C:/tmp/theoverify/app.py', 'utf8');
const j = ap.indexOf('bar.appendChild(copy);');
console.log('app.py-banniere x' + (ap.split('bar.appendChild(copy);').length - 1) + ' : ' + JSON.stringify(ap.slice(j - 60, j + 120)));
