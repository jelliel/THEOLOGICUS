/* v584 — assemblage du banc (morceaux b1..b4) */
const fs = require("fs");
const DIR = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v584/";
let out = "";
for (const n of ["1", "2", "3", "4"]) {
  const p = DIR + "_b" + n + ".txt";
  if (!fs.existsSync(p)) { console.error("manque " + p); process.exit(1); }
  out += fs.readFileSync(p, "utf8") + "\r\n";
}
fs.writeFileSync(DIR + "verify_v584_pets.js", out, "utf8");
console.log("banc assemble :", out.length, "octets");
