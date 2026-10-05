import type { Role } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * Qui peut figurer sur une dépense.
 *
 * « Autorisé par » engage l'établissement : direction uniquement.
 * « Payé par » sort l'argent : comptabilité ou caisse uniquement.
 * Sans ce contrôle, n'importe quel identifiant était accepté — y compris celui
 * d'un compte d'un autre établissement, ou d'un élève.
 */
export const ROLES_AUTORISANT_DEPENSE: Role[] = ["TENANT_ADMIN", "PRINCIPAL"];
export const ROLES_PAYANT_DEPENSE: Role[] = ["ACCOUNTANT", "CAISSIER"];

/**
 * Vérifie les deux acteurs d'une dépense. Renvoie un message d'erreur, ou
 * `null` si tout est conforme. Un champ absent ou vide n'est pas contrôlé.
 */
export async function verifierActeursDepense(
  tenantId: string,
  acteurs: { autoriseParId?: string | null; payeParId?: string | null }
): Promise<string | null> {
  const controles = [
    { id: acteurs.autoriseParId, roles: ROLES_AUTORISANT_DEPENSE, erreur: "« Autorisé par » doit être un membre actif de la direction de l'établissement." },
    { id: acteurs.payeParId, roles: ROLES_PAYANT_DEPENSE, erreur: "« Payé par » doit être un comptable ou un caissier actif de l'établissement." },
  ];
  for (const { id, roles, erreur } of controles) {
    if (!id) continue;
    // Le rôle se lit dans l'appartenance au tenant, pas dans `User.role` : un
    // compte multi-établissements porte un rôle par tenant, et un même compte
    // peut cumuler plusieurs rôles dans un établissement (UserRole).
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- tenant borné par les deux relations ; la direction et la comptabilité agissent pour tous les sites
    const membre = await prisma.user.findFirst({
      where: {
        id,
        isActive: true,
        OR: [
          { userTenants: { some: { tenantId, isActive: true, role: { in: roles } } } },
          { userRoles: { some: { tenantId, isActive: true, role: { in: roles } } } },
        ],
      },
      select: { id: true },
    });
    if (!membre) return erreur;
  }
  return null;
}
