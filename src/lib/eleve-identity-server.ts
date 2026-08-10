/**
 * Maintien de `Eleve.identiteKey` — le garde-fou en base contre les doublons.
 *
 * La colonne porte une contrainte `@@unique([tenantId, identiteKey])` : un
 * doublon d'identité devient donc **impossible**, et non plus seulement
 * détectable après coup. Encore faut-il que la clé soit tenue à jour à chaque
 * écriture — c'est le rôle de ce module, unique endroit où elle est calculée.
 *
 * Conventions :
 *   • fiche archivée → clé remise à NULL, ce qui libère la place
 *     (PostgreSQL traite les NULL comme distincts) ;
 *   • fiche sans date de naissance exploitable → NULL, faute de clé fiable ;
 *   • homonyme légitime assumé par l'utilisateur → suffixe « #2 », « #3 »…
 */

import prisma from "@/lib/prisma";
import { identityKey, normalizeDate, type Identite } from "@/lib/eleve-identity";

export interface DoublonTrouve {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  classe: string | null;
  archive: boolean;
}

/**
 * Fiche active désignant déjà cette personne, le cas échéant.
 *
 * `excludeId` sert à la mise à jour : une fiche ne fait pas doublon avec
 * elle-même.
 */
export async function trouverDoublon(
  tenantId: string,
  identite: Identite,
  excludeId?: string
): Promise<DoublonTrouve | null> {
  const cle = identityKey(identite);
  if (cle.endsWith("|")) return null; // pas de date : aucune clé fiable

  // eslint-disable-next-line ecolpro/require-site-filter -- unicité d'identité au niveau tenant, par construction
  const existant = await prisma.eleve.findFirst({
    where: {
      tenantId,
      identiteKey: cle,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      deletedAt: true,
      classe: { select: { nom: true } },
    },
  });

  if (!existant) return null;
  return {
    id: existant.id,
    matricule: existant.matricule,
    nom: existant.nom,
    prenom: existant.prenom,
    classe: existant.classe?.nom ?? null,
    archive: existant.deletedAt !== null,
  };
}

/**
 * Clé à inscrire sur la fiche.
 *
 * Renvoie `null` quand aucune clé fiable n'est calculable (date de naissance
 * absente) : la contrainte laisse alors passer, faute de mieux.
 *
 * Quand la clé est déjà prise et que l'appelant assume l'homonymie
 * (`forcer`), un suffixe est ajouté pour ne pas bloquer une inscription
 * légitime — deux élèves peuvent réellement partager nom, prénom et date.
 */
export async function resoudreIdentiteKey(
  tenantId: string,
  identite: Identite,
  options: { excludeId?: string; forcer?: boolean } = {}
): Promise<string | null> {
  const base = identityKey(identite);
  if (base.endsWith("|")) return null;

  const doublon = await trouverDoublon(tenantId, identite, options.excludeId);
  if (!doublon) return base;
  if (!options.forcer) return base; // laissera la contrainte refuser l'écriture

  // eslint-disable-next-line ecolpro/require-site-filter -- unicité d'identité au niveau tenant, par construction
  const voisins = await prisma.eleve.findMany({
    where: { tenantId, identiteKey: { startsWith: base } },
    select: { identiteKey: true },
  });
  const prises = new Set(voisins.map((v) => v.identiteKey));
  let rang = 2;
  while (prises.has(`${base}#${rang}`)) rang++;
  return `${base}#${rang}`;
}

/** Clé recalculée à partir des champs d'une fiche, sans accès base. */
export function cleDepuisFiche(e: {
  nom: string;
  prenom: string;
  dateNaissance: Date | string | null;
}): string | null {
  if (!normalizeDate(e.dateNaissance)) return null;
  return identityKey(e);
}
