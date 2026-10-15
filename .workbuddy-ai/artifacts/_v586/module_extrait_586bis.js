
(function () {
  "use strict";
  if (window.__v586Import) return;
  /* Import de compagnons au format OpenPets (MIT) : paquet = pet.json +
     spritesheet.webp|svg, fourni en .zip ou en deux fichiers. Validation
     DEFENSIVE (proche du validateur officiel) avant tout stockage. */

  /* ── 1. ZIP minimal : EOCD → repertoire central → DecompressionStream ── */
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
  async function decompresser(brut, methode) {
    if (methode === 0) return brut;
    if (methode !== 8) throw new Error("Compression ZIP non geree (methode " + methode + ")");
    if (typeof DecompressionStream !== "function") throw new Error("DecompressionStream indisponible");
    var ds = new DecompressionStream("deflate-raw");
    var flux = new Blob([brut]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }
  async function lireZip(tampon) {
    var d = new Uint8Array(tampon), i, eocd = -1;
    for (i = d.length - 22; i >= 0 && i > d.length - 66000; i--) {
      if (d[i] === 0x50 && d[i + 1] === 0x4b && d[i + 2] === 0x05 && d[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Archive ZIP invalide (EOCD absent)");
    var n = u16(d, eocd + 10), pos = u32(d, eocd + 16), sortie = {};
    for (i = 0; i < n; i++) {
      if (u32(d, pos) !== 0x02014b50) throw new Error("Repertoire central corrompu");
      var methode = u16(d, pos + 10), tailleC = u32(d, pos + 20);
      var nLen = u16(d, pos + 28), eLen = u16(d, pos + 30), cLen = u16(d, pos + 32);
      var decal = u32(d, pos + 42);
      var nom = new TextDecoder().decode(d.slice(pos + 46, pos + 46 + nLen));
      if (u32(d, decal) !== 0x04034b50) throw new Error("En-tete local invalide");
      var ln = u16(d, decal + 26), le = u16(d, decal + 28);
      var debut = decal + 30 + ln + le;
      if (tailleC > 8 * 1024 * 1024) throw new Error("Fichier trop gros dans l archive");
      sortie[nom] = await decompresser(d.slice(debut, debut + tailleC), methode);
      pos += 46 + nLen + eLen + cLen;
    }
    return sortie;
  }

  /* ── 2. validation pet.json ── */
  function validerPetJson(txt) {
    var o;
    try { o = JSON.parse(txt); } catch (e) { throw new Error("pet.json illisible (JSON)"); }
    if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("pet.json : objet attendu");
    var id = String(o.id || "").trim();
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) throw new Error("pet.json : id invalide (a-z, 0-9, tirets)");
    var chemin = String(o.spritesheetPath || "");
    if (chemin !== "spritesheet.webp" && chemin !== "spritesheet.svg") throw new Error("pet.json : spritesheetPath doit etre spritesheet.webp ou spritesheet.svg");
    if (o.spriteVersionNumber !== undefined && o.spriteVersionNumber !== 2) throw new Error("pet.json : spriteVersionNumber doit valoir 2");
    return {
      id: id,
      nom: String(o.displayName || id).slice(0, 40),
      desc: String(o.description || "").slice(0, 200),
      chemin: chemin,
      version: o.spriteVersionNumber === 2 ? 2 : 1
    };
  }
/* ── 3. validation du spritesheet SVG (profil restreint, comme OpenPets) ── */
  var SVG_EL = {};
  ["svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
   "linearGradient", "radialGradient", "stop", "clipPath", "title", "desc"].forEach(function (t) { SVG_EL[t] = 1; });
  var SVG_AT = {};
  ["id", "xmlns", "version", "width", "height", "viewBox", "preserveAspectRatio",
   "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "fr",
   "d", "points", "transform", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
   "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
   "stroke-dashoffset", "opacity", "clip-path", "clip-rule", "clipPathUnits",
   "gradientUnits", "gradientTransform", "spreadMethod", "offset", "stop-color", "stop-opacity",
   "vector-effect", "shape-rendering", "color"].forEach(function (t) { SVG_AT[t] = 1; });
  function validerSvg(txt, w, h) {
    if (txt.indexOf("&") !== -1) throw new Error("SVG : entites interdites");
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(txt)) throw new Error("SVG : caracteres invalides");
    if (/<script|<style|<!ENTITY|<\?xml-stylesheet|javascript:/i.test(txt)) throw new Error("SVG : contenu actif interdit");
    var p = 0, prof = 0, balises = [];
    while (p < txt.length) {
      var s = txt.indexOf("<", p);
      if (s < 0) break;
      if (txt.slice(p, s).trim()) throw new Error("SVG : texte hors title/desc interdit");
      if (txt.startsWith("<!--", s)) { var fc = txt.indexOf("-->", s); if (fc < 0) throw new Error("SVG : commentaire non ferme"); p = fc + 3; continue; }
      var e = txt.indexOf(">", s);
      if (e < 0) throw new Error("SVG : balise non fermee");
      var t = txt.slice(s + 1, e);
      p = e + 1;
      if (t.charAt(0) === "/") {
        var ferm = t.slice(1).trim();
        if (!/^[A-Za-z]+$/.test(ferm)) throw new Error("SVG : fermeture invalide");
        if (balises.pop() !== ferm) throw new Error("SVG : balises imbriquees incoherentes");
        continue;
      }
      var m = /^([A-Za-z]+)([\s\S]*?)(\/?)$/.exec(t);
      if (!m) throw new Error("SVG : balise illisible");
      var nom = m[1], brut = m[2] || "", auto = m[3] === "/";
      if (!SVG_EL[nom]) throw new Error("SVG : element non autorise (« " + nom + " »)");
      prof++;
      if (prof > 20000 || balises.length > 64) throw new Error("SVG : complexite excessive");
      var re = /\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g, mm;
      var vus = {};
      while ((mm = re.exec(brut))) {
        var at = mm[1], va = (mm[2] !== undefined ? mm[2] : mm[3]) || "";
        if (vus[at]) throw new Error("SVG : attribut duplique");
        vus[at] = 1;
        if (!SVG_AT[at]) throw new Error("SVG : attribut non autorise (« " + at + " »)");
        if (va.length > 262144) throw new Error("SVG : attribut trop long");
        if (/url\s*\(/i.test(va)) {
          if (!/^url\(#[A-Za-z_][A-Za-z0-9_.-]*\)$/.test(va)) throw new Error("SVG : reference url() interdite");
          if (["fill", "stroke", "clip-path"].indexOf(at) === -1) throw new Error("SVG : url() hors fill/stroke/clip-path");
        }
      }
      if (nom === "svg") {
        var vb = (vus.viewBox ? /([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/.exec(brut) : null);
        var lw = vus.width ? parseFloat((/width\s*=\s*"(\d+)/.exec(brut) || [])[1]) : NaN;
        var lh = vus.height ? parseFloat((/height\s*=\s*"(\d+)/.exec(brut) || [])[1]) : NaN;
        if (vus.xmlns === undefined) throw new Error("SVG : xmlns manquant");
        if (lw !== w || lh !== h) throw new Error("SVG : dimensions attendues " + w + "x" + h + " (recu " + lw + "x" + lh + ")");
        if (!vb || Number(vb[3]) !== w || Number(vb[4]) !== h) throw new Error("SVG : viewBox doit valoir 0 0 " + w + " " + h);
      }
      if (!auto) balises.push(nom);
    }
    if (balises.length) throw new Error("SVG : document incomplet");
    if (!prof) throw new Error("SVG : vide");
  }
/* ── 4. validation du spritesheet WebP (signature + dimensions) ── */
  async function validerWebp(octets, version) {
    if (octets.length < 30) throw new Error("WebP : fichier trop petit");
    var sig = String.fromCharCode(octets[0], octets[1], octets[2], octets[3]);
    var fmt = String.fromCharCode(octets[8], octets[9], octets[10], octets[11]);
    if (sig !== "RIFF" || fmt !== "WEBP") throw new Error("WebP : signature invalide");
    var bmp;
    try { bmp = await createImageBitmap(new Blob([octets], { type: "image/webp" })); }
    catch (e) { throw new Error("WebP : image illisible"); }
    var attenduH = version === 2 ? 2288 : 1872;
    if (bmp.width !== 1536 || bmp.height !== attenduH) {
      var lu = bmp.width + "x" + bmp.height;
      try { bmp.close(); } catch (e2) {}
      if (!bmp.width || !bmp.height) throw new Error("WebP : dimensions illisibles (" + lu + ") — attendu 1536x" + attenduH);
      throw new Error("WebP : dimensions attendues 1536x" + attenduH + " (recu " + lu + ")");
    }
    try { bmp.close(); } catch (e3) {}
  }
  function octetsVersDataUrl(octets, mime) {
    var s = "", i, pas = 8192;
    for (i = 0; i < octets.length; i += pas) s += String.fromCharCode.apply(null, octets.subarray(i, i + pas));
    return "data:" + mime + ";base64," + btoa(s);
  }

  /* ── 5. stockage (magasin app_config, cle pet::<id>) ── */
  function geoOpenPets(version) {
    return {
      rows: version === 2 ? 11 : 9,
      etats: {
        idle: { row: 0, n: 6 },
        wave: { row: 3, n: 4 },
        happy: { row: 4, n: 5 },
        thinking: { row: 8, n: 6 }
      }
    };
  }
  async function enregistrer(pet) {
    var enr = {
      id: "pet::" + pet.id,
      petId: pet.id,
      nom: pet.nom,
      desc: pet.desc,
      version: pet.version,
      spritesheet: pet.spritesheet
    };
    await db.put("app_config", enr);
    appliquerEnMemoire(enr);
    return enr;
  }
  function appliquerEnMemoire(enr) {
    var cle = "ext:" + enr.petId;
    window.__v585Atlas = window.__v585Atlas || {};
    window.__v585Frames = window.__v585Frames || {};
    window.__v585Geo = window.__v585Geo || {};
    window.__v585Noms = window.__v585Noms || {};
    window.__v585Atlas[cle] = enr.spritesheet;
    window.__v585Frames[cle] = { idle: 6, wave: 4, happy: 5, thinking: 6 };
    window.__v585Geo[cle] = geoOpenPets(enr.version || 1);
    window.__v585Noms[cle] = enr.nom;
    return cle;
  }
  async function chargerImportes() {
    try {
      var tous = await db.getAll("app_config");
      var n = 0;
      (tous || []).forEach(function (e) {
        if (e && typeof e.id === "string" && e.id.indexOf("pet::") === 0 && e.spritesheet) { appliquerEnMemoire(e); n++; }
      });
      return n;
    } catch (e) { return 0; }
  }
/* ── 6. traitement d un paquet (zip ou fichiers separes) ── */
  async function traiterFichiers(fichiers) {
    var jsonTxt = null, sprite = null, estSvg = false, f, i;
    var liste = Array.prototype.slice.call(fichiers || []);
    if (!liste.length) throw new Error("aucun fichier");
    for (i = 0; i < liste.length; i++) {
      f = liste[i];
      if (/\.zip$/i.test(f.name)) {
        var entrees = await lireZip(await f.arrayBuffer());
        for (var nom in entrees) {
          if (/pet\.json$/i.test(nom)) jsonTxt = new TextDecoder().decode(entrees[nom]);
          else if (/spritesheet\.svg$/i.test(nom)) { sprite = entrees[nom]; estSvg = true; }
          else if (/spritesheet\.webp$/i.test(nom)) { sprite = entrees[nom]; estSvg = false; }
        }
      } else if (/\.json$/i.test(f.name)) {
        jsonTxt = await f.text();
      } else if (/\.svg$/i.test(f.name)) {
        sprite = new Uint8Array(await f.arrayBuffer()); estSvg = true;
      } else if (/\.webp$/i.test(f.name)) {
        sprite = new Uint8Array(await f.arrayBuffer()); estSvg = false;
      }
    }
    if (!jsonTxt) throw new Error("pet.json absent du paquet");
    var meta = validerPetJson(jsonTxt);
    if (!sprite) throw new Error("spritesheet absent du paquet");
    if ((meta.chemin === "spritesheet.svg") !== estSvg) throw new Error("pet.json et spritesheet ne correspondent pas");
    var h = meta.version === 2 ? 2288 : 1872;
    if (estSvg) {
      validerSvg(new TextDecoder().decode(sprite), 1536, h);
      meta.spritesheet = octetsVersDataUrl(sprite, "image/svg+xml");
    } else {
      await validerWebp(sprite, meta.version);
      meta.spritesheet = octetsVersDataUrl(sprite, "image/webp");
    }
    await enregistrer(meta);
    majSelecteur();
    return meta;
  }

  /* ── 7. interface : ligne d import dans les reglages des compagnons ── */
  function toast(m, k) { try { if (typeof window.toast === "function") window.toast(m, k); } catch (e) {} }
  function majSelecteur() {
    var sel = document.getElementById("v584-pet-sel");
    if (!sel) return;
    var vus = {};
    Array.prototype.slice.call(sel.options).forEach(function (o) { vus[o.value] = 1; });
    var atlas = window.__v585Atlas || {};
    Object.keys(atlas).forEach(function (cle) {
      if (cle.indexOf("ext:") !== 0 || vus[cle]) return;
      var o = document.createElement("option");
      o.value = cle;
      o.textContent = "📦 " + ((window.__v585Noms || {})[cle] || cle.slice(4));
      sel.appendChild(o);
    });
  }
  function monterImport() {
    var pan = document.getElementById("settings-panneau-motion");
    if (!pan || document.getElementById("v586-import-btn")) return !!document.getElementById("v586-import-btn");
    var g = document.createElement("div");
    g.className = "field-group";
    var lab = document.createElement("div");
    lab.className = "field-label";
    lab.textContent = "📦 Importer un compagnon (format OpenPets)";
    g.appendChild(lab);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "v586-import-btn";
    btn.className = "field-input";
    btn.style.cssText = "max-width:260px;cursor:pointer;";
    btn.textContent = "Choisir un paquet (.zip ou pet.json + spritesheet)";
    var inp = document.createElement("input");
    inp.type = "file";
    inp.id = "v586-import-input";
    inp.multiple = true;
    inp.accept = ".zip,.json,.webp,.svg";
    inp.style.display = "none";
    btn.addEventListener("click", function () { inp.value = ""; inp.click(); });
    inp.addEventListener("change", function () {
      var fs2 = inp.files;
      if (!fs2 || !fs2.length) return;
      traiterFichiers(fs2).then(function (meta) {
        toast("Compagnon importe : " + meta.nom, "success");
      }).catch(function (e) {
        toast("Import refuse : " + (e && e.message ? e.message : e), "error");
      });
    });
    g.appendChild(btn);
    g.appendChild(inp);
    var hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = "Paquet OpenPets : pet.json + spritesheet.webp ou .svg (1536x1872 ou 1536x2288). Le fichier est verifie (structure, elements et attributs autorises, dimensions) avant d etre enregistre dans l application.";
    g.appendChild(hint);
    pan.appendChild(g);
    majSelecteur();
    return true;
  }
  var essais = 0;
  var iv = setInterval(function () {
    if (monterImport() || ++essais > 50) clearInterval(iv);
  }, 900);

  /* ── 8. API + amorcage ── */
  window.__v586Import = {
    traiterFichiers: traiterFichiers,
    chargerImportes: chargerImportes,
    lireZip: lireZip,
    validerPetJson: validerPetJson,
    validerSvg: validerSvg,
    validerWebp: validerWebp,
    monterImport: monterImport
  };
  chargerImportes().then(function (n) { if (n) majSelecteur(); });
})();
