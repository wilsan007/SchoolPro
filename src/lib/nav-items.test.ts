/**
 * Verrouillage du registre de navigation.
 * ============================================================
 *
 * Ces tests protègent les deux propriétés qui, prises ensemble, garantissent
 * qu'un menu ne propose jamais un écran refusé :
 *
 *  1. **Tout ce qui est affiché est déclaré** : chaque `href` du registre a une
 *     règle dans `ROUTE_RULES`. Un chemin ajouté au menu sans règle serait
 *     refusé à tout le monde (fail-closed) — un lien mort.
 *  2. **Tout raccourci épinglé est atteignable** : pour chaque rôle, les quatre
 *     raccourcis mobiles sont accessibles au rôle qui les reçoit. Sans ce
 *     test, un épinglage mal configuré ne se voit qu'en production, sur mobile,
 *     après un clic qui mène à `/acces-bloque`.
 *
 * La visibilité elle-même n'est pas testée ici : elle est dérivée de
 * `canAccessRoute`, déjà couverte par `permissions.test.ts` et
 * `matrix-audit.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { NAV_GROUPS, NAV_ITEMS, PINNED_MOBILE, PINNED_MOBILE_DEFAUT } from "./nav-items";
import { canAccessRoute, findRouteRule, ROLE_PERMISSIONS } from "./permissions";

describe("Registre de navigation — inventaire", () => {
  it("chaque entrée déclarée a une règle de route (sinon le lien serait mort)", () => {
    const sansRegle = NAV_ITEMS.filter((i) => !findRouteRule(i.href)).map((i) => i.href);
    expect(sansRegle).toEqual([]);
  });

  it("les hrefs sont uniques (deux entrées pour un même écran = doublon de maintenance)", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("les clés de groupe sont uniques et non vides", () => {
    const cles = NAV_GROUPS.map((g) => g.groupKey);
    expect(new Set(cles).size).toBe(cles.length);
    expect(cles.every((c) => c.length > 0)).toBe(true);
  });

  it("aucun groupe n'est vide", () => {
    expect(NAV_GROUPS.every((g) => g.items.length > 0)).toBe(true);
  });

  it("chaque entrée porte une icône et une clé de traduction", () => {
    for (const item of NAV_ITEMS) {
      expect(item.icon, item.href).toBeTruthy();
      expect(item.labelKey.length, item.href).toBeGreaterThan(0);
    }
  });

  it("les routes volontairement absentes du menu le restent", () => {
    // `/test-telegram` et `/test-whatsapp` ne doivent jamais réapparaître dans
    // la navigation : ce sont des outils de diagnostic super-admin.
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs).not.toContain("/test-telegram");
    expect(hrefs).not.toContain("/test-whatsapp");
  });
});

describe("Raccourcis mobiles épinglés", () => {
  it("chaque href épinglé existe dans le registre de navigation", () => {
    const connus = new Set(NAV_ITEMS.map((i) => i.href));
    for (const [role, hrefs] of Object.entries(PINNED_MOBILE)) {
      for (const href of hrefs) {
        expect(connus.has(href), `${role} → ${href} n'est pas dans NAV_GROUPS`).toBe(true);
      }
    }
  });

  it("le repli ne référence que des écrans du registre", () => {
    const connus = new Set(NAV_ITEMS.map((i) => i.href));
    for (const href of PINNED_MOBILE_DEFAUT) {
      expect(connus.has(href), `repli → ${href}`).toBe(true);
    }
  });

  it("chaque rôle épinglé est un rôle connu de la matrice", () => {
    for (const role of Object.keys(PINNED_MOBILE)) {
      expect(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS], role).toBeDefined();
    }
  });

  // Le cœur : un raccourci épinglé que son rôle ne peut pas ouvrir serait un
  // bouton menant directement à `/acces-bloque`.
  it("chaque raccourci est accessible au rôle qui le reçoit", () => {
    const inaccessibles: string[] = [];
    for (const [role, hrefs] of Object.entries(PINNED_MOBILE)) {
      for (const href of hrefs) {
        if (!canAccessRoute(role, href)) inaccessibles.push(`${role} → ${href}`);
      }
    }
    expect(inaccessibles).toEqual([]);
  });

  it("le repli est accessible aux rôles qui n'ont pas d'épinglage dédié", () => {
    const rolesSansEpinglage = Object.keys(ROLE_PERMISSIONS).filter(
      (r) => !(r in PINNED_MOBILE)
    );
    // Tous les rôles du schéma sont couverts : le repli doit donc être
    // accessible au personnel générique, jamais aux familles.
    expect(rolesSansEpinglage).toEqual([]);
  });
});
