/* v665 — cibler un contrôle par RÔLE accessible, pas par coordonnées ni par
   sélecteur CSS.
   Pourquoi : un banc qui clique sur (x, y) ou sur `.btn-mode` casse dès qu'une
   mise en page bouge ou qu'une classe est renommée — et il casse en SILENCE
   quand le clic atterrit ailleurs. Le rôle et le nom accessibles, eux, suivent
   le contrôle. Le budget (200 éléments) vient de browser-cdp-snapshot.ts
   (openbot) : un instantané trop gros n'est pas exploitable.
   `page.accessibility` n'existe plus dans Playwright ≥ 1.50 : l'inventaire
   passe par le CDP `Accessibility.getFullAXTree`, comme openbot. */
const ROLES_ACTIONNABLES = new Set([
  "button", "checkbox", "combobox", "link", "listbox", "menuitem",
  "menuitemcheckbox", "menuitemradio", "option", "radio", "searchbox",
  "slider", "spinbutton", "switch", "tab", "textbox", "treeitem"
]);
/* Au-delà, l'instantané n'est plus actionnable : on le refuse au lieu de le
   tronquer en silence (openbot : MAX_SNAPSHOT_ELEMENTS). */
const BUDGET_ELEMENTS = 200;

/* Inventaire des éléments actionnables, avec leur nom accessible. */
async function inventaire(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const vus = nodes
    .filter(n => n.role && ROLES_ACTIONNABLES.has(n.role.value) && !n.ignored)
    .map(n => ({ role: n.role.value, nom: ((n.name && n.name.value) || "").trim() }));
  return {
    total: vus.length,
    budget: BUDGET_ELEMENTS,
    dansLeBudget: vus.length <= BUDGET_ELEMENTS,
    elements: vus,
    sansNom: vus.filter(v => !v.nom)
  };
}

/* Le locator Playwright par rôle + nom. `nom` peut être une regex. */
function parRole(page, role, nom) {
  return page.getByRole(role, { name: nom, exact: false });
}

/* La boîte MESURÉE À L'INSTANT d'un contrôle désigné par rôle — sert à montrer
   qu'une coordonnée enregistrée plus tôt n'est déjà plus la bonne. */
async function boite(page, role, nom) {
  const l = parRole(page, role, nom).first();
  return await l.boundingBox();
}

async function clicRole(page, role, nom, timeout) {
  const l = parRole(page, role, nom).first();
  await l.waitFor({ state: "visible", timeout: timeout || 5000 });
  await l.click({ timeout: timeout || 5000 });
  return true;
}

module.exports = {
  ROLES_ACTIONNABLES, BUDGET_ELEMENTS,
  inventaire, parRole, boite, clicRole
};
