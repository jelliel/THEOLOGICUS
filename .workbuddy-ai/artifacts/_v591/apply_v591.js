/* v591 — applique la tranche 3 : remplace le module v590 (T1+T2+localiser)
   et AJOUTE le module v591 (marquage dans le chat).
   Tranches + CRLF + vérification de fermeture + node --check des deux modules. */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "..", "..", "THEOLOGICUS.html");
const S590 = path.join(__dirname, "..", "_v590", "src_v590.txt");
const S591 = path.join(__dirname, "..", "_v591", "src_v591.txt");
let html = fs.readFileSync(F, "utf8");

const DEB590 = '<script id="v590-citations">';
const start = html.indexOf(DEB590);
if (start < 0) { console.error("module v590 introuvable"); process.exit(1); }
const finTag = html.indexOf("</script>", start);
const fin = finTag + "</script>".length;

if (html.indexOf('<script id="v591-citations-ui">') !== -1) {
  /* ré-application : on retire l'ancien bloc v591 avant de le réinsérer */
  const i = html.indexOf('<script id="v591-citations-ui">');
  const f = html.indexOf("</script>", i) + "</script>".length;
  html = html.slice(0, i) + html.slice(f);
  console.log("(ancien v591 retire)");
}

const m590 = fs.readFileSync(S590, "utf8").replace(/\r\n/g, "\n").trim() + "\n";
const m591 = fs.readFileSync(S591, "utf8").replace(/\r\n/g, "\n").trim() + "\n";

/* 1) remplacer v590 */
let out = html.slice(0, start) + m590.replace(/\n/g, "\r\n") + html.slice(fin);
/* 2) insérer v591 juste avant </body> */
const ancre = out.lastIndexOf("</body>");
if (ancre < 0) { console.error("</body> introuvable"); process.exit(1); }
out = out.slice(0, ancre) + m591.replace(/\n/g, "\r\n") + "\r\n" + out.slice(ancre);

const crlf = out.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
fs.writeFileSync(F, crlf, "utf8");

/* vérifications */
function extraire(id) {
  const i = crlf.indexOf('<script id="' + id + '">');
  if (i < 0) return null;
  const f = crlf.indexOf("</script>", i);
  if (f < 0) return null;
  return crlf.slice(i + ('<script id="' + id + '">').length, f);
}
const js590 = extraire("v590-citations");
const js591 = extraire("v591-citations-ui");
if (!js590 || !js591) { console.error("extraction impossible"); process.exit(1); }
fs.writeFileSync(path.join(__dirname, "..", "_v590", "module_v590.js"), js590.replace(/\r\n/g, "\n"), "utf8");
fs.writeFileSync(path.join(__dirname, "module_v591.js"), js591.replace(/\r\n/g, "\n"), "utf8");
console.log("v590 : " + js590.length + " octets | v591 : " + js591.length + " octets");
console.log("modules v590 : " + (crlf.match(/<script id="v590-citations">/g) || []).length
  + " | v591 : " + (crlf.match(/<script id="v591-citations-ui">/g) || []).length);
