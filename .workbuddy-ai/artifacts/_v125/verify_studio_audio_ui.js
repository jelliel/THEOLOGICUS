// Banc v125b — la SECTION AUDIO du STUDIO VIDEO dans le navigateur.
//
// Ce banc verifie ce qu'un banc de code ne peut pas voir : que les controles
// existent, qu'ils sont LIES, que les listes se remplissent depuis le service,
// et surtout que le MODE decide reellement de ce qui part dans le formulaire.
//
// Pieges connus, evites ici :
//   * `studioOpen` est local a une IIFE : on passe par `window.__studioOpen` ;
//   * `$` exige le `#`, on utilise `_STU`/`document.getElementById` ;
//   * le formulaire vit dans un modal qui doit etre OUVERT pour que les
//     elements aient une taille mesurable.
//
// Usage : node verify_studio_audio_ui.js --port 8765

const path = require("path");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;

const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}
function section(t) { console.log("\n" + t); }

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v125b — SECTION AUDIO DU STUDIO VIDEO (navigateur)");
  console.log(BASE);
  console.log("=".repeat(72));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error") erreurs.push("console: " + m.text()); });

  // ── 0. Ouverture debloquee ──────────────────────────────────────────
  section("0. Préparation");
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((h) => {
    // Le meme jeton que les autres bancs : SHA-256 de 'remember:' + AUTH_HASH.
    const enc = new TextEncoder().encode("remember:" + h);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("theologicus_remember", JSON.stringify({
        v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok,
      }));
    });
  }, AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const ouvre = await page.evaluate(() => typeof window.__studioOpen === "function");
  ok("le STUDIO VIDEO est ouvrable (window.__studioOpen)", ouvre);
  if (!ouvre) { await browser.close(); process.exit(2); }
  await page.evaluate(() => window.__studioOpen());
  // On attend une CONDITION mesurable, pas un delai fixe. Les listes viennent
  // du service : un delai fixe marche sur cette machine et echoue sur une plus
  // lente, ce qui produit un banc qui « casse » sans qu'aucun code n'ait bouge.
  await page.waitForFunction(() => {
    const t = document.getElementById("studio-tts");
    const v = document.getElementById("studio-voice");
    const b = document.getElementById("studio-bgm-name");
    return t && t.options.length === 11
      && v && v.querySelectorAll("option").length > 100
      && b && b.options.length > 10;
  }, { timeout: 45000 });

  // ── 1. Les controles existent ───────────────────────────────────────
  section("1. Les contrôles de la section Audio existent");
  const attendus = [
    "studio-vomode", "studio-grp-upload", "studio-audio-file",
    "studio-tts", "studio-voice", "studio-voice-note",
    "studio-volume", "studio-volume-val", "studio-rate", "studio-rate-val",
    "studio-voice-sample", "studio-voice-full", "studio-voice-audio",
    "studio-bgm-name", "studio-bgmvol",
  ];
  const presents = await page.evaluate(ids => {
    const r = {};
    ids.forEach(i => { r[i] = !!document.getElementById(i); });
    return r;
  }, attendus);
  for (const id of attendus) ok(`#${id} est présent`, presents[id]);

  // ── 2. Le vocabulaire est celui de MPT ──────────────────────────────
  section("2. Le vocabulaire suit MoneyPrinterTurbo");
  const labels = await page.evaluate(() => {
    // La mention « Voiceover » est dans le LABEL, pas dans la valeur affichee
    // a cote (`100 %`, `1,00×`) : c'est ce label qu'on verifie.
    const lbl = id => {
      const e = document.getElementById(id);
      if (!e) return "";
      // Le label est le champ precedent dans le meme groupe, ou un frere.
      const g = e.closest(".field-group") || e.parentElement;
      return g ? g.textContent.replace(/\s+/g, " ").trim() : "";
    };
    const grp = document.getElementById("studio-vomode");
    const opts = grp ? Array.from(grp.options).map(o => o.value) : [];
    const bgm = document.getElementById("studio-bgm-name");
    return {
      volume: lbl("studio-volume"),
      rate: lbl("studio-rate"),
      bgm: lbl("studio-bgmvol"),
      opts,
      bgm1: bgm && bgm.options[0] ? bgm.options[0].textContent : "",
      bgm1val: bgm && bgm.options[0] ? bgm.options[0].value : "",
      bgmn: bgm ? bgm.options.length : 0,
      bgmFiles: bgm ? Array.from(bgm.options).filter(o => /^preset:/.test(o.value)).length : 0,
      bgmAucune: bgm ? Array.from(bgm.options).some(o => o.value === "") : false,
    };
  });
  ok("le mode de narration a TROIS valeurs (auto/upload/none)",
    labels.opts.length === 3 && labels.opts.indexOf("auto") >= 0
    && labels.opts.indexOf("upload") >= 0 && labels.opts.indexOf("none") >= 0,
    labels.opts.join(", "));
  ok("le volume de la voix est libellé « Voiceover Volume »",
    /Voiceover Volume/i.test(labels.volume), labels.volume.slice(0, 70));
  ok("la vitesse de la voix est libellée « Voiceover Speed »",
    /Voiceover Speed/i.test(labels.rate), labels.rate.slice(0, 70));
  ok("le volume de la musique est libellé « Background Music »",
    /Background Music/i.test(labels.bgm), labels.bgm.slice(0, 70));
  // La premiere entree doit etre le choix « aleatoire » du service : c'est la
  // valeur `random` de `bgm_type`. On teste la VALEUR, pas le libelle, qui est
  // traduit (« Aléatoire ») et changerait avec la langue de l'interface.
  ok("la musique de fond commence par le choix aléatoire du service",
    labels.bgm1val === "random", `${labels.bgm1val} / ${labels.bgm1}`);
  ok("« sans musique » est proposé (valeur vide, contrat du service)",
    labels.bgmAucune, labels.bgmAucune);
  // Le point qui compte : une musique PRECISE doit partir en `preset:<nom>`,
  // jamais le nom seul — le service ne reconnait pas un nom de fichier comme
  // `bgm_type` et sortirait la video SANS musique, sans message d'erreur.
  ok("les musiques du service sont proposées en « preset:<nom> »",
    labels.bgmFiles > 20, `${labels.bgmFiles} musiques`);

  // ── 3. Les listes viennent du service ───────────────────────────────
  section("3. Les listes sont lues depuis le service (rien en dur)");
  const moteurs = await page.evaluate(() => {
    const s = document.getElementById("studio-tts");
    return s ? { n: s.options.length, v: s.value } : null;
  });
  ok("le sélecteur de moteur est rempli par le service",
    moteurs && moteurs.n === 11, moteurs ? `${moteurs.n} moteurs` : "absent");
  ok("le moteur par défaut est celui du service",
    moteurs && moteurs.v === "azure-tts-v1", moteurs && moteurs.v);
  const voix = await page.evaluate(() => {
    const s = document.getElementById("studio-voice");
    if (!s) return null;
    return {
      n: s.querySelectorAll("option").length,
      groupes: Array.from(s.querySelectorAll("optgroup")).map(g => g.label),
      premier: Array.from(s.querySelectorAll("optgroup")).map(g => g.label)[0] || "",
    };
  });
  ok("le sélecteur de voix est rempli", voix && voix.n > 100, voix && `${voix.n} options`);
  ok("les voix françaises sont groupées EN PREMIER",
    voix && /^Français/.test(voix.groupes[0] || ""), voix && voix.groupes.join(" | "));

  // ── 4. Un changement de moteur recharge les VOIX ────────────────────
  section("4. Le moteur DÉTERMINE la liste des voix");
  const avant = await page.evaluate(() => document.getElementById("studio-voice").querySelectorAll("option").length);
  await page.evaluate(() => {
    const s = document.getElementById("studio-tts");
    s.value = "azure-tts-v2";
    s.dispatchEvent(new Event("change"));
  });
  await page.waitForTimeout(2500);
  const apres = await page.evaluate(() => {
    const s = document.getElementById("studio-voice");
    return {
      n: s.querySelectorAll("option").length,
      v2: Array.from(s.querySelectorAll("option")).filter(o => /V2/.test(o.value)).length,
    };
  });
  ok("changer de moteur recharge la liste de voix", apres.n !== avant,
    `${avant} -> ${apres.n}`);
  ok("la liste V2 ne contient que des voix V2", apres.v2 === apres.n && apres.n > 0,
    `${apres.v2}/${apres.n}`);
  // On revient sur V1 pour la suite : c'est le moteur par defaut du service.
  await page.evaluate(() => {
    const s = document.getElementById("studio-tts");
    s.value = "azure-tts-v1";
    s.dispatchEvent(new Event("change"));
  });
  await page.waitForTimeout(2500);
  const retour = await page.evaluate(() => document.getElementById("studio-voice").querySelectorAll("option").length);
  ok("revenir sur V1 restaure le catalogue complet (322)", retour === 322, `${retour}`);

  // ── 5. Le MODE decide de ce qui est actif ───────────────────────────
  section("5. Le mode désactive réellement ce qui ne sert pas");
  const enMode = async (mode) => {
    await page.evaluate(m => {
      const s = document.getElementById("studio-vomode");
      s.value = m; s.dispatchEvent(new Event("change"));
    }, mode);
    await page.waitForTimeout(200);
    return page.evaluate(() => {
      const g = id => document.getElementById(id);
      return {
        upload: !!g("studio-grp-upload").hidden,
        tts: g("studio-tts").disabled,
        voix: g("studio-voice").disabled,
        sample: g("studio-voice-sample").disabled,
        note: g("studio-voice-note").hidden ? "" : g("studio-voice-note").textContent,
      };
    });
  };
  const auto = await enMode("auto");
  ok("en Auto : le champ de fichier audio est MASQUÉ", auto.upload === true, `hidden=${auto.upload}`);
  ok("en Auto : le moteur et la voix sont ACTIFS", !auto.tts && !auto.voix,
    `tts.disabled=${auto.tts} voix.disabled=${auto.voix}`);
  const upload = await enMode("upload");
  ok("en Upload : le champ de fichier audio est VISIBLE", upload.upload === false, `hidden=${upload.upload}`);
  ok("en Upload : le moteur et la voix sont DÉSACTIVÉS", upload.tts && upload.voix,
    `tts.disabled=${upload.tts} voix.disabled=${upload.voix}`);
  ok("en Upload : une note explique POURQUOI c'est inactif",
    /ignor/i.test(upload.note), upload.note.slice(0, 70));
  const none = await enMode("none");
  ok("en None : le champ de fichier audio est MASQUÉ", none.upload === true);
  ok("en None : une note explique l'absence de narration",
    /aucune narration/i.test(none.note), none.note.slice(0, 70));
  const retourAuto = await enMode("auto");
  ok("en revenant en Auto, la note de mode est EFFACÉE",
    !/ignor|aucune narration/i.test(retourAuto.note), retourAuto.note.slice(0, 60));

  // ── 6. Le formulaire part bien selon le mode ────────────────────────
  section("6. Ce qui PART vers le service dépend du mode");
  const payload = async (mode, fichier) => page.evaluate(([m, f]) => {
    const s = document.getElementById("studio-vomode");
    s.value = m; s.dispatchEvent(new Event("change"));
    if (f !== null) document.getElementById("studio-audio-file").value = f;
    return window.__studioPayload ? window.__studioPayload() : null;
  }, [mode, fichier]);
  const pAuto = await payload("auto", null);
  if (!pAuto) {
    ok("studioPayload est exposable pour le banc", false,
      "exposez window.__studioPayload (voir la note du banc)");
  } else {
    ok("mode auto : le moteur part sous la clé `tts_server`",
      pAuto.tts_server === "azure-tts-v1" && pAuto.voice_mode === "tts",
      `tts_server=${pAuto.tts_server} voice_mode=${pAuto.voice_mode}`);
    const pUp = await payload("upload", "storage/custom_audio/mon.mp3");
    ok("mode upload : le fichier part sous `custom_audio_file`",
      pUp.custom_audio_file === "storage/custom_audio/mon.mp3",
      pUp.custom_audio_file);
    ok("mode upload : AUCUNE voix n'est envoyée (elle serait ignorée)",
      !("voice_name" in pUp), `voice_name=${pUp.voice_name}`);
    ok("mode upload : `voice_mode` vaut « upload »", pUp.voice_mode === "upload", pUp.voice_mode);
    const pNone = await payload("none", null);
    ok("mode none : `voice_mode` vaut « none »", pNone.voice_mode === "none", pNone.voice_mode);
    ok("mode none : le volume est à 0", pNone.voice_volume === 0, pNone.voice_volume);
    ok("mode none : aucune voix n'est envoyée", !("voice_name" in pNone));
  }
  await payload("auto", null);

  // La musique de fond : le contrat exact du service (`bgm_type`/`bgm_file`).
  const bgmPayload = async (valeur) => page.evaluate((v) => {
    const s = document.getElementById("studio-bgm-name");
    s.value = v;
    return window.__studioPayload ? window.__studioPayload() : null;
  }, valeur);
  const bRand = await bgmPayload("random");
  if (bRand) {
    ok("bgm random : `bgm_type` = « random » et `bgm_file` vide",
      bRand.bgm_type === "random" && bRand.bgm_file === "",
      `type=${bRand.bgm_type} file=${bRand.bgm_file}`);
    ok("bgm random : AUCUNE clé `bgm_name` inventée (elle n'existe pas)",
      !("bgm_name" in bRand), Object.keys(bRand).filter(k => /bgm/.test(k)).join(", "));
    const bPreset = await bgmPayload("preset:output000.mp3");
    ok("bgm précis : `bgm_type` = « preset » (jamais le nom de fichier)",
      bPreset && bPreset.bgm_type === "preset", bPreset && bPreset.bgm_type);
    ok("bgm précis : `bgm_file` porte le nom du fichier",
      bPreset && bPreset.bgm_file === "output000.mp3", bPreset && bPreset.bgm_file);
    const bAucune = await bgmPayload("");
    ok("bgm sans musique : `bgm_type` est une CHAÎNE VIDE (pas « none »)",
      bAucune && bAucune.bgm_type === "", bAucune && JSON.stringify(bAucune.bgm_type));
  } else {
    ok("studioPayload est exposable pour le banc (musique de fond)", false);
  }
  await bgmPayload("random");

  // ── 7. L'écoute produit un son RÉEL ─────────────────────────────────
  section("7. Voice Sample / Full Preview produisent un son écoutable");
  await page.evaluate(() => {
    const s = document.getElementById("studio-voice");
    const fr = Array.from(s.querySelectorAll("option")).filter(o => /^fr-/.test(o.value));
    if (fr.length) s.value = fr[0].value;
  });
  await page.evaluate(() => document.getElementById("studio-voice-sample").click());
  let pret = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(900);
    const s = await page.evaluate(() => {
      const a = document.getElementById("studio-voice-audio");
      const n = document.getElementById("studio-voice-ecoute");
      return {
        src: a ? a.getAttribute("src") || "" : "",
        visible: a ? !a.hidden && a.style.display !== "none" : false,
        note: n && !n.hidden ? n.textContent : "",
      };
    });
    if (s.src) { pret = true; var dernier = s; break; }
    if (/impossible|échoué|interrompue/i.test(s.note)) { var dernier = s; break; }
  }
  ok("le lecteur d'aperçu reçoit une source", pret && dernier.src.startsWith("/mpt/voice/audio"),
    dernier && dernier.src);
  ok("le lecteur devient visible", pret && dernier.visible, dernier && `visible=${dernier.visible}`);
  if (pret) {
    const charge = await page.evaluate(async () => {
      const a = document.getElementById("studio-voice-audio");
      try {
        // On attend les metadonnees : `src` pose ne prouve pas que le
        // navigateur a pu DECODER le fichier.
        await new Promise((res, rej) => {
          if (a.readyState >= 1) return res();
          a.addEventListener("loadedmetadata", res, { once: true });
          a.addEventListener("error", () => rej(new Error("erreur de décodage")), { once: true });
          setTimeout(() => rej(new Error("délai dépassé")), 15000);
        });
        return { duree: a.duration, pret: a.readyState };
      } catch (e) { return { erreur: String(e) }; }
    });
    ok("le navigateur DÉCODE le son (métadonnées lues, durée > 0)",
      !charge.erreur && charge.duree > 0,
      charge.erreur ? charge.erreur : `${charge.duree.toFixed(2)} s`);
  }
  ok("la note d'écoute nomme la voix utilisée",
    /Voix/.test(dernier && dernier.note), dernier && dernier.note.slice(0, 90));

  // Un texte vide doit etre refuse, pas provoquer un plantage.
  await page.evaluate(() => {
    const s = document.getElementById("studio-script");
    if (s) s.value = "";
    document.getElementById("studio-voice-full").click();
  });
  await page.waitForTimeout(2500);
  const refus = await page.evaluate(() => {
    const n = document.getElementById("studio-voice-ecoute");
    return n && !n.hidden ? n.textContent : "";
  });
  ok("« Full Preview » sans script le DIT au lieu d'échouer en silence",
    /Aucun script|aucun texte|indisponible/i.test(refus), refus.slice(0, 90));

  // ── 8. Aucune erreur JS ─────────────────────────────────────────────
  section("8. Aucune erreur JavaScript");
  const reelles = erreurs.filter(e => !/favicon|net::ERR_|Failed to load resource/i.test(e));
  ok("aucune erreur de script pendant tout le banc", reelles.length === 0,
    reelles.slice(0, 3).join(" | "));

  // ── Bilan ───────────────────────────────────────────────────────────
  const total = resultats.length;
  const reussis = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${reussis}/${total}`);
  if (reussis !== total) {
    console.log("\nEchecs :");
    resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`));
  }
  console.log("=".repeat(72));

  await browser.close();
  process.exit(reussis === total ? 0 : 1);
})().catch(e => { console.error("ERREUR FATALE :", e); process.exit(3); });
