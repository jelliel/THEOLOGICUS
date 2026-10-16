/* Insère le module v595 avant </body>, par TRANCHES + CRLF, avec vérification. */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "..", "..", "THEOLOGICUS.html");
let html = fs.readFileSync(F, "utf8");
const ID = "v595-topbar-debordement";
if (html.indexOf('<script id="' + ID + '">') !== -1) {
  const i = html.indexOf('<script id="' + ID + '">');
  const f = html.indexOf("</script>", i) + "</script>".length;
  html = html.slice(0, i) + html.slice(f);
  console.log("(ancien v595 retire)");
}
const MOD = fs.readFileSync(path.join(__dirname, "src_v595.txt"), "utf8").replace(/\r\n/g, "\n").trim() + "\n";
const ancre = html.lastIndexOf("</body>");
if (ancre < 0) { console.error("</body> introuvable"); process.exit(1); }
let out = html.slice(0, ancre) + MOD.replace(/\n/g, "\r\n") + "\r\n" + html.slice(ancre);
out = out.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
fs.writeFileSync(F, out, "utf8");
const i2 = out.indexOf('<script id="' + ID + '">');
const f2 = out.indexOf("</script>", i2);
if (i2 < 0 || f2 < 0) { console.error("insertion ratee"); process.exit(1); }
fs.writeFileSync(path.join(__dirname, "module_v595.js"), out.slice(i2 + ('<script id="' + ID + '">').length, f2).replace(/\r\n/g, "\n"), "utf8");
console.log("v595 insere — " + (f2 - i2) + " octets");
