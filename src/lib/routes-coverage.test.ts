/**
 * Couverture des routes du dashboard par le registre de permissions.
 * ============================================================
 *
 * Deux propriétés, vérifiées sur le **système de fichiers** (donc à jour à
 * chaque nouvelle page, sans qu'on y pense) :
 *
 *  1. **Toute page existe dans `ROUTE_RULES`.** Un écran absent du registre est
 *     refusé à tout le monde (`canAccessRoute` renvoie `false`) — un écran
 *     inaccessible par oubli. C'est exactement ce qu'on veut du fail-closed,
 *     à condition que l'oubli soit détecté : c'est le rôle de ce test.
 *
 *  2. **Toute page appelle `guardPage`.** Le middleware est la première
 *     barrière, `guardPage` la seconde ; une page sans garde ne serait protégée
 *     que par le middleware, contournable (Server Action, route interceptée).
 *
 * Les exceptions sont énumérées explicitement, avec leur raison : une exception
 * qui n'est pas justifiée est un bug, pas une préférence.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { findRouteRule } from "./permissions";

const RACINE = path.join(process.cwd(), "src/app/(dashboard)");

function trouverPages(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) trouverPages(p, acc);
    else if (e.name === "page.tsx") acc.push(p);
  }
  return acc;
}

/**
 * Chemin de route à partir du chemin de fichier.
 *
 * Les segments dynamiques sont remplacés par un jeton (`[id]` → `__id__`) au
 * lieu d'être supprimés : dans une URL réelle le segment est toujours présent,
 * et les règles qui le discriminent (`/eleves/<id>/modifier`,
 * `/parent/factures/<id>`) ne peuvent être vérifiées qu'ainsi.
 */
function routeDePage(fichier: string): string {
  const rel = path.relative(RACINE, fichier);
  const segments = rel
    .split(path.sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => (s.startsWith("[") ? `__${s.replace(/[[\].]/g, "").replace(/^\.\.\./, "rest")}__` : s));
  return "/" + segments.join("/");
}

const PAGES = trouverPages(RACINE);
const ROUTES = [...new Set(PAGES.map(routeDePage))].sort();

/**
 * Pages sans `guardPage`, avec leur justification. Deux familles :
 *
 *  1. La page de refus et les outils de diagnostic super-admin (règle
 *     `ROUTE_RULES` dédiée + vérification de rôle dans la page pour
 *     `/super-admin`).
 *  2. Des **composants clients** (`"use client"`) : ils ne peuvent pas appeler
 *     `auth()` côté serveur. Leur barrière est la règle de route (middleware),
 *     doublée côté données par l'API qu'ils interrogent.
 */
const PAGES_SANS_GUARD_AUTORISEES: Record<string, string> = {
  "/acces-bloque": "destination des refus — la garder interdite bouclerait vers elle-même.",
  "/super-admin": "vérifie elle-même `session.user.role !== \"SUPER_ADMIN\"` avant tout rendu.",
  "/test-telegram": "outil de diagnostic, règle ROUTE_RULES limitée à SUPER_ADMIN.",
  "/test-whatsapp": "outil de diagnostic, règle ROUTE_RULES limitée à SUPER_ADMIN.",
  "/parametres/audit": "composant client ; règle `audit:read` + `/api/audit` qui revérifie.",
  "/parametres/journal-emails": "composant client ; règle `audit:read` + `/api/emails/journal`.",
  "/parent/reinscription": "composant client du portail parent ; règle PARENT + API par jeton d'invitation.",
  "/profil/securite": "composant client ; `/profil` est ouvert à tout compte authentifié, aucune donnée d'autrui.",
};

describe("Registre de routes — couverture des pages du dashboard", () => {
  it("le parcours trouve bien des pages (sinon le test ne prouve rien)", () => {
    expect(PAGES.length).toBeGreaterThan(50);
  });

  it("chaque route de page a une règle dans ROUTE_RULES", () => {
    const orphelines = ROUTES.filter((r) => !findRouteRule(r));
    expect(orphelines).toEqual([]);
  });

  it("chaque page appelle guardPage, sauf exceptions documentées", () => {
    const sansGarde = PAGES.filter((p) => {
      const route = routeDePage(p);
      if (route in PAGES_SANS_GUARD_AUTORISEES) return false;
      return !fs.readFileSync(p, "utf8").includes("guardPage");
    })
      .map(routeDePage)
      .sort();
    expect(sansGarde).toEqual([]);
  });

  it("les exceptions documentées restent nécessaires (aucune garde oubliée par excès)", () => {
    const inutiles = Object.keys(PAGES_SANS_GUARD_AUTORISEES).filter((route) => {
      const page = PAGES.find((p) => routeDePage(p) === route);
      return page ? fs.readFileSync(page, "utf8").includes("guardPage") : false;
    });
    expect(inutiles).toEqual([]);
  });

  it("toute exception correspond à une page réelle (pas de vestige)", () => {
    const routes = new Set(ROUTES);
    const fantomes = Object.keys(PAGES_SANS_GUARD_AUTORISEES).filter((r) => !routes.has(r));
    expect(fantomes).toEqual([]);
  });
});

describe("Registre de routes — sous-routes sensibles", () => {
  it("les écrans de MUTATION d'un élève exigent eleves:write, pas eleves:read", () => {
    for (const route of ["/eleves/nouveau", "/eleves/abc123/modifier"]) {
      const rule = findRouteRule(route);
      expect(rule?.permission, route).toBe("eleves:write");
    }
  });

  it("les documents officiels (cartes, attestations) sont réservés aux actes administratifs", () => {
    for (const route of ["/eleves/cartes", "/eleves/attestations"]) {
      const rule = findRouteRule(route);
      expect(rule?.permission, route).toBe("eleves:write");
      expect(rule?.roles, route).toContain("SECRETARY");
      expect(rule?.roles, route).not.toContain("TEACHER");
    }
  });

  it("le journal des emails est réservé à l'audit, comme son API", () => {
    expect(findRouteRule("/parametres/journal-emails")?.permission).toBe("audit:read");
  });
});
