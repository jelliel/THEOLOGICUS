/* v666 — UN faux fournisseur pour toutes les différences, et non un mock par
   test. Chaque scénario ne diffère des autres que là où les vrais fournisseurs
   diffèrent (code HTTP, forme du corps, vocabulaire), exactement comme
   scripts/provider-fakes/agents/conformance.ts (openbot) isole FAKE_MISSING
   par fournisseur.
   Les corps sont ceux qui sont documentés ou qui ont été relevés en production :
   - Agnes : mesurés le 2026-10-27.
   - deAPI : extraits de deapi_llms.txt (402 key_limit_exceeded, 422 avec
     message par champ, 403 insufficient_permissions sur /account/balance). */
const AGNES = /apihub\.agnes-ai\.com/;
const DEAPI = /api\.deapi\.ai/;

const SCENARIOS = {
  /* ── Agnes ── */
  agnes_file_pleine: {
    fournisseur: "agnes", route: /\/v1\/videos$/, statut: 503,
    corps: '{"code":"video_queue_full","message":"video queue is full, please retry later"}',
    attendu: { kind: "file", ref: "video/http-503/file", doitContenir: /file d'attente/i }
  },
  agnes_quota: {
    fournisseur: "agnes", route: /\/v1\/videos$/, statut: 403,
    corps: '{"code":"insufficient_user_quota","message":"pre-consume quota failed","remaining":0.1,"required":0.125}',
    attendu: { kind: "quota", ref: "video/http-403/quota", doitContenir: /0\.125/ }
  },
  agnes_cle: {
    fournisseur: "agnes", route: /\/v1\/videos$/, statut: 401,
    corps: '{"code":"invalid_api_key","message":"Invalid token"}',
    attendu: { kind: "cle", ref: "video/http-401/cle", doitContenir: /clé Agnes refus/i }
  },
  agnes_route_absente: {
    fournisseur: "agnes", route: /\/v1\/videos$/, statut: 404,
    corps: '{"code":"not_found","message":"no route /v1/videos"}',
    attendu: { kind: "route", ref: "video/http-404/route", doitContenir: /route vidéo introuvable/i }
  },
  /* ── deAPI ── */
  /* 422 : une taille dans max_width/max_height mais AU-DESSUS de max_pixels.
     C'est le cas documenté sur Ltx2_5_22B_Dist_INT8. */
  deapi_bornes: {
    fournisseur: "deapi", route: /\/videos\/generations$/, statut: 422,
    corps: '{"message":"Size 1024x1024 (1,048,576 px) exceeds the model limit of 1,032,192 px."}',
    attendu: { kind: "borne", ref: "video/http-422/borne", doitContenir: /1,032,192/ }
  },
  /* 402 : plafond de dépense atteint, aucun job créé. */
  deapi_plafond: {
    fournisseur: "deapi", route: /\/videos\/generations$/, statut: 402,
    corps: '{"code":"key_limit_exceeded","message":"spend limit reached"}',
    attendu: { kind: "quota", ref: "video/http-402/quota", doitContenir: /solde|plafond|crédit/i }
  },
  /* 403 qui n'est PAS une clé invalide : la clé existe mais n'a pas le droit
     (documenté sur /account/balance). La confondre avec « clé refusée » envoie
     l'utilisateur re-saisir une clé parfaitement valide. */
  deapi_permission: {
    fournisseur: "deapi", route: /\/videos\/generations$/, statut: 403,
    corps: '{"code":"insufficient_permissions","message":"this key cannot access account billing"}',
    attendu: { kind: "perm", ref: "video/http-403/perm", neDoitPasContenir: /clé .*refusée/i }
  },
  /* 429 : `Retry-After` n'est envoyé QUE sur un 429 (deapi_llms.txt). On le met
     à 1 s, sinon la retenue de l'app (20 s → 300 s) mettrait le banc en échec
     de délai au lieu de le mettre en échec de classement. */
  deapi_limite: {
    fournisseur: "deapi", route: /\/videos\/generations$/, statut: 429,
    entetes: { "Retry-After": "1", "X-RateLimit-Type": "tier" },
    corps: '{"message":"rate limit exceeded"}',
    attendu: { kind: "limite", ref: "video/http-429/limite", doitContenir: /limite/i, neDoitPasContenir: /Agnes/i }
  },
  deapi_cle: {
    fournisseur: "deapi", route: /\/videos\/generations$/, statut: 401,
    corps: '{"message":"unauthorized"}',
    /* le fournisseur nommé doit être deAPI, pas Agnes : sinon l'utilisateur
       corrige le mauvais compte */
    attendu: { kind: "cle", ref: "video/http-401/cle", doitContenir: /clé deAPI refus/i, neDoitPasContenir: /Agnes/i }
  }
};

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

/* En-têtes d'un scénario : CORS + ceux du scénario (Retry-After…). */
function entetesDe(s) { return Object.assign({}, CORS, s.entetes || {}); }

/* Branche le faux sur un `page` Playwright. `scenario` nomme une entrée de
   SCENARIOS ; les autres requêtes du fournisseur repassent en réel (donc
   échouent) plutôt que d'être simulées à tort. */
async function brancher(page, nomScenario, journal) {
  const s = SCENARIOS[nomScenario];
  if (!s) throw new Error("scénario inconnu : " + nomScenario);
  return page.route("**/proxy/**", async (route) => {
    const u = route.request().url();
    const estAgnes = AGNES.test(u), estDeapi = DEAPI.test(u);
    if (s.fournisseur === "agnes" && estAgnes && s.route.test(u)) {
      if (journal) journal.push(nomScenario + " -> " + s.statut);
      return route.fulfill({ status: s.statut, headers: entetesDe(s), body: s.corps });
    }
    if (s.fournisseur === "deapi" && estDeapi && s.route.test(u)) {
      if (journal) journal.push(nomScenario + " -> " + s.statut);
      return route.fulfill({ status: s.statut, headers: entetesDe(s), body: s.corps });
    }
    return route.continue();
  });
}

module.exports = { SCENARIOS, brancher, CORS, entetesDe };
