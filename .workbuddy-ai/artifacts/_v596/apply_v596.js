/* Insère la feuille v596 avant </body>, par TRANCHES + CRLF, avec vérification. */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "..", "..", "THEOLOGICUS.html");
let html = fs.readFileSync(F, "utf8");
const OUV = '<style id="v596-send-contraste">';
if (html.indexOf(OUV) !== -1) {
  const i = html.indexOf(OUV);
  const f = html.indexOf("</style>", i) + "</style>".length;
  html = html.slice(0, i) + html.slice(f);
  console.log("(ancien v596 retire)");
}
const MOD = fs.readFileSync(path.join(__dirname, "src_v596.txt"), "utf8").replace(/\r\n/g, "\n").trim() + "\n";
const ancre = html.lastIndexOf("</body>");
if (ancre < 0) { console.error("</body> introuvable"); process.exit(1); }
let out = html.slice(0, ancre) + MOD.replace(/\n/g, "\r\n") + "\r\n" + html.slice(ancre);
out = out.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
fs.writeFileSync(F, out, "utf8");
const i2 = out.indexOf(OUV);
const f2 = out.indexOf("</style>", i2);
if (i2 < 0 || f2 < 0) { console.error("insertion ratee"); process.exit(1); }
console.log("v596 insere — " + (f2 - i2) + " octets ; occurrences = " + (out.match(/v596-send-contraste/g) || []).length);
