import type { Role } from "@prisma/client";

/**
 * EcolPro — Politique de double authentification
 * ==============================================
 *
 * DEUX PROBLÈMES DISTINCTS, DEUX RÉPONSES
 *
 * 1. Le 2FA existait mais n'était JAMAIS demandé.
 *    `src/lib/auth.ts` ne mentionnait ni `twoFactorEnabled`, ni TOTP : un
 *    utilisateur pouvait activer la double authentification, scanner son
 *    QR code, ranger ses codes de secours… et se connecter ensuite avec
 *    son seul mot de passe. La protection était une case à cocher sans
 *    effet — pire qu'une absence de 2FA, puisqu'elle donnait une
 *    assurance fausse.
 *    Réponse : le code TOTP est exigé DANS `authorize`, avant qu'aucune
 *    session ne soit émise. Ce n'est pas une redirection que l'on peut
 *    contourner en appelant l'API directement : sans code valide, aucun
 *    jeton n'est créé.
 *
 * 2. Les rôles sensibles n'étaient pas tenus de l'activer.
 *    Réponse : les rôles ci-dessous doivent l'activer, avec une période
 *    de tolérance. Les forcer du jour au lendemain enfermerait dehors le
 *    directeur d'une école un lundi matin — un correctif de sécurité qui
 *    coupe l'accès aux ayants droit n'est pas un correctif.
 */

/**
 * Rôles pour lesquels la double authentification est obligatoire.
 *
 * Le critère n'est pas le rang hiérarchique mais la portée du dommage
 * qu'un compte compromis permettrait :
 *   - SUPER_ADMIN   : accès transverse à tous les établissements ;
 *   - TENANT_ADMIN  : tout l'établissement, dont la création de comptes ;
 *   - PRINCIPAL     : dossiers complets des élèves, décisions disciplinaires ;
 *   - ACCOUNTANT    : facturation, encaissements, coordonnées bancaires ;
 *   - CAISSIER      : encaissements en espèces, remises de caisse.
 *
 * SECRETARY en est volontairement absent pour l'instant : le rôle est
 * souvent partagé sur un poste commun, où le 2FA se contourne en pratique
 * (téléphone posé à côté du clavier) tout en compliquant le quotidien.
 * À revoir si le poste devient individuel.
 */
export const ROLES_2FA_OBLIGATOIRE: readonly Role[] = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "PRINCIPAL",
  "ACCOUNTANT",
  "CAISSIER",
] as const;

export function deuxFacteursObligatoire(role: Role | null | undefined): boolean {
  return !!role && ROLES_2FA_OBLIGATOIRE.includes(role);
}

/**
 * Nombre de jours laissés à un utilisateur d'un rôle sensible pour
 * activer sa double authentification. Passé ce délai, l'accès est
 * restreint à la page de configuration.
 *
 * `0` désactive complètement l'obligation (mais pas la vérification du
 * point 1 : un 2FA activé reste exigé). C'est la valeur par défaut, pour
 * que ce déploiement n'enferme personne dehors sans décision explicite.
 */
export function delaiActivation2FA(): number {
  const raw = Number(process.env.TWO_FACTOR_GRACE_DAYS ?? "0");
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

/**
 * L'utilisateur doit-il configurer sa double authentification maintenant ?
 *
 * @param role              rôle actif
 * @param twoFactorEnabled  2FA déjà configurée ?
 * @param compteCreeLe      date de création du compte, point de départ du délai
 */
export function activation2FARequise(
  role: Role | null | undefined,
  twoFactorEnabled: boolean,
  compteCreeLe: Date | null | undefined
): boolean {
  if (twoFactorEnabled) return false;
  if (!deuxFacteursObligatoire(role)) return false;

  const delai = delaiActivation2FA();
  if (delai === 0) return false;
  if (!compteCreeLe) return true;

  const joursEcoules = (Date.now() - compteCreeLe.getTime()) / 86_400_000;
  return joursEcoules >= delai;
}
