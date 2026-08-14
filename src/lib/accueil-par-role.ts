/**
 * EcolPro — Route d'accueil par rôle
 * ============================================================
 * Ce fichier répond à une question **différente** de celle de `permissions.ts`,
 * et la distinction est le cœur du module :
 *
 *   - `canAccessRoute(role, route)` → « ce rôle a-t-il le DROIT d'ouvrir cet
 *     écran ? » C'est une autorisation : elle protège, elle bloque.
 *   - `accueilPourRole(role)` → « où ce rôle est-il CHEZ LUI ? » C'est un
 *     aiguillage : il oriente, il ne bloque rien.
 *
 * Un rôle peut avoir le droit d'ouvrir dix écrans et n'être chez lui que sur
 * un seul. Inversement, un rôle sans espace dédié (secrétariat, infirmerie,
 * conseiller, comptabilité) n'a pas de route d'accueil propre : il reste sur
 * le tableau de bord générique. Dans ce cas la fonction renvoie `null`, ce qui
 * signifie « laisse-le où il est », et jamais une route de repli implicite.
 *
 * Invariant à ne jamais casser : si `accueilPourRole(r)` renvoie une route,
 * alors `canAccessRoute(r, cetteRoute)` doit être vrai. Sinon l'aiguillage
 * envoie le rôle sur un écran qui le renverra aussitôt vers `/acces-bloque` —
 * une boucle de redirection en production. Cet invariant est verrouillé par
 * `accueil-par-role.test.ts`.
 *
 * Comme `permissions.ts`, ce fichier est **pur** et Edge-safe : aucun import de
 * Prisma, de NextAuth ni de `next/navigation`. Il n'importe que des types.
 */

import type { RoleKey } from "./permissions";

/**
 * Table exhaustive au sens de TypeScript : `Record<RoleKey, string | null>`
 * oblige à déclarer les onze rôles. Le jour où un douzième rôle est ajouté à
 * `RoleKey`, la compilation échoue ici et force la question « cet nouveau rôle
 * a-t-il un espace dédié ? » plutôt que de le laisser tomber silencieusement
 * dans un comportement par défaut.
 */
export const ACCUEIL_PAR_ROLE: Record<RoleKey, string | null> = {
  // Console plateforme.
  SUPER_ADMIN: "/super-admin",

  // Pilotage de l'établissement.
  TENANT_ADMIN: "/direction",
  PRINCIPAL: "/direction",

  // Espaces de travail pédagogiques.
  TEACHER: "/mon-espace",
  CLASS_TEACHER: "/ma-classe",

  // Espaces des familles, résolus par le lien relationnel du connecté.
  PARENT: "/parent",
  STUDENT: "/eleve",

  // Surveillant — la vie scolaire opérationnelle est son espace naturel.
  SUPERVISOR: "/vie-scolaire",

  SUBJECT_LEAD: "/ma-matiere",

  // Pas encore d'espace dédié : ces rôles gardent le tableau de bord générique.
  // `null` veut dire « ne le redirige pas », pas « aucun accès ».
  SECRETARY: "/secretariat",
  COUNSELOR: "/conseiller",
  NURSE: "/infirmerie",
  ACCOUNTANT: "/comptabilite",
};

/** Route d'accueil propre au rôle, ou null si le rôle n'a pas d'espace dédié. */
export function accueilPourRole(role: string | null | undefined): string | null {
  if (!role) return null;
  // Un rôle inconnu (jeton périmé, rôle supprimé du schéma) ne doit pas être
  // aiguillé au hasard : on renvoie `null` comme pour un rôle sans espace.
  // `hasOwn` et non un simple accès : `ACCUEIL_PAR_ROLE["constructor"]` doit
  // valoir `null`, pas une valeur héritée de `Object.prototype`.
  if (!Object.prototype.hasOwnProperty.call(ACCUEIL_PAR_ROLE, role)) return null;
  return ACCUEIL_PAR_ROLE[role as RoleKey];
}
