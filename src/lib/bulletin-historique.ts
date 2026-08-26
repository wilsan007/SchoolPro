/**
 * Utilitaires pour l'historisation des modifications de bulletins.
 *
 * Règle métier :
 *  - Un bulletin VERROUILLE ou PUBLIE ne peut être modifié que par
 *    un TENANT_ADMIN (administrateur de l'établissement).
 *  - Toute modification — même par le directeur — est enregistrée
 *    dans la table `bulletin_historique` pour audit.
 */

import prisma from "@/lib/prisma";
import type { Role } from "@prisma/client";

/** Rôles autorisés à modifier un bulletin verrouillé/publié. */
const ROLES_ADMIN: Role[] = ["TENANT_ADMIN", "SUPER_ADMIN"];

/**
 * Vérifie si un bulletin est verrouillé (non modifiable par les non-admin).
 * Un bulletin est verrouillé si son statut est VERROUILLE ou PUBLIE.
 */
export function bulletinEstVerrouille(statut: string): boolean {
  return statut === "VERROUILLE" || statut === "PUBLIE";
}

/**
 * Vérifie si un utilisateur peut modifier un bulletin donné.
 *
 * - BROUILLON : tous les rôles avec `bulletins:write` peuvent modifier.
 * - VERROUILLE / PUBLIE : seul un TENANT_ADMIN (ou SUPER_ADMIN) peut modifier.
 */
export function peutModifierBulletin(
  role: Role,
  statutBulletin: string
): boolean {
  if (!bulletinEstVerrouille(statutBulletin)) return true;
  return ROLES_ADMIN.includes(role);
}

/**
 * Enregistre une entrée dans l'historique du bulletin.
 *
 * @param bulletinId  ID du bulletin concerné
 * @param tenantId    ID du tenant
 * @param auteur      Informations sur l'utilisateur qui a fait la modification
 * @param action      Type d'action : "UPDATE", "DELETE", "PUBLIER", etc.
 * @param champ       Champ modifié (ou "global" pour une action globale)
 * @param ancienneValeur  Valeur avant (sérialisée en JSON)
 * @param nouvelleValeur  Valeur après (sérialisée en JSON)
 */
export async function enregistrerHistoriqueBulletin(
  bulletinId: string,
  tenantId: string,
  auteur: { id: string; name?: string | null; role: Role },
  action: string,
  champ: string,
  ancienneValeur?: string | null,
  nouvelleValeur?: string | null
): Promise<void> {
  await prisma.bulletinHistorique.create({
    data: {
      bulletinId,
      tenantId,
      auteurId: auteur.id,
      auteurNom: auteur.name ?? null,
      auteurRole: auteur.role,
      action,
      champ,
      ancienneValeur: ancienneValeur ?? null,
      nouvelleValeur: nouvelleValeur ?? null,
    },
  });
}

/**
 * Enregistre les modifications champ par champ en comparant l'ancien et le
 * nouvel état du bulletin. Seuls les champs réellement modifiés sont tracés.
 */
export async function tracerModificationsBulletin(
  bulletinId: string,
  tenantId: string,
  auteur: { id: string; name?: string | null; role: Role },
  ancien: Record<string, unknown>,
  nouveau: Record<string, unknown>
): Promise<void> {
  const champsASuivre = [
    "moyenneGenerale",
    "moyenneClasse",
    "moyennePremier",
    "heuresAbsence",
    "rang",
    "effectifClasse",
    "appreciation",
    "decision",
    "statut",
    "isPublie",
  ];

  for (const champ of champsASuivre) {
    const ancienneVal = ancien[champ];
    const nouvelleVal = nouveau[champ];

    // Comparaison : on sérialise en JSON pour comparer les valeurs
    const ancienJson = ancienneVal === undefined ? null : JSON.stringify(ancienneVal);
    const nouveauJson = nouvelleVal === undefined ? null : JSON.stringify(nouvelleVal);

    if (ancienJson !== nouveauJson) {
      await enregistrerHistoriqueBulletin(
        bulletinId,
        tenantId,
        auteur,
        "UPDATE",
        champ,
        ancienJson,
        nouveauJson
      );
    }
  }
}
