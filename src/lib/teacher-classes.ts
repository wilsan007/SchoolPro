import prisma from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

const TEACHER_ROLES: Role[] = ["TEACHER", "CLASS_TEACHER"];

/**
 * Détermine si un rôle est un rôle d'enseignant restreint à ses classes.
 */
export function isTeacherRole(role: Role): boolean {
  return TEACHER_ROLES.includes(role);
}

/**
 * Récupère les IDs des classes attribuées à un enseignant.
 *
 * Source de vérité : `AffectationEnseignant` (créée lors de l'inscription).
 * Sources secondaires (rétro-compatibilité) : `EmploiTemps` et `profPrincipalId`.
 *
 * Retourne également les IDs des matières qu'il enseigne.
 *
 * @param anneeCourante  Libellé de l'année scolaire (ex: "2025-2026").
 *   Quand fourni, le périmètre est restreint aux classes de cette année :
 *   - `AffectationEnseignant` filtrée par `classe.annee`
 *   - `EmploiTemps` filtrée par son champ `annee`
 *   - Classes dont l'enseignant est prof principal filtrées par `annee`
 *   Quand omis (undefined), conserve le comportement historique (toutes années).
 */
export async function getTeacherScope(
  tenantId: string,
  userId: string,
  role: Role,
  anneeCourante?: string | null
): Promise<{
  classeIds: string[];
  matiereIds: string[];
  isRestricted: boolean;
}> {
  if (!isTeacherRole(role)) {
    return { classeIds: [], matiereIds: [], isRestricted: false };
  }

  // Si l'appelant n'a pas passé `anneeCourante` (undefined), on récupère
  // l'année active. Si `null` est passé explicitement, on conserve le
  // comportement historique (toutes années).
  const anneeEffective = anneeCourante === undefined
    ? await getAnneeCouranteLibelle(tenantId)
    : anneeCourante;

  // eslint-disable-next-line ecolpro/require-site-filter -- teacher lookup by userId+tenantId, site scoping is caller's responsibility
  const enseignant = await prisma.enseignant.findFirst({
    where: { userId, tenantId },
    select: { id: true },
  });

  if (!enseignant) {
    return { classeIds: [], matiereIds: [], isRestricted: true };
  }

  // Filtre année : restreint les classes/matières à l'année courante.
  // `AffectationEnseignant` n'a pas de champ `annee` mais sa `classe` en a un.
  // `EmploiTemps` a son propre champ `annee` (libellé string).
  const filtreAnneeClasse = anneeEffective ? { annee: anneeEffective } : {};
  const filtreAnneeEmploi = anneeEffective ? { annee: anneeEffective } : {};

  /* eslint-disable ecolpro/require-site-filter -- teacher scope resolution, site scoping is caller's responsibility */
  const [affectations, emploiEntries, principalClasses] = await Promise.all([
    // Source principale : AffectationEnseignant
    prisma.affectationEnseignant.findMany({
      where: {
        enseignantId: enseignant.id,
        tenantId,
        classe: filtreAnneeClasse,
      },
      select: { classeId: true, matiereId: true },
    }),
    // Source secondaire : EmploiTemps (rétro-compatibilité)
    prisma.emploiTemps.findMany({
      where: { enseignantId: enseignant.id, tenantId, ...filtreAnneeEmploi },
      select: { classeId: true, matiereId: true },
      distinct: ["classeId", "matiereId"],
    }),
    // Source secondaire : prof principal
    prisma.classe.findMany({
      where: { profPrincipalId: enseignant.id, tenantId, ...filtreAnneeClasse },
      select: { id: true },
    }),
  ]);
  /* eslint-enable ecolpro/require-site-filter */

  const classeIds = Array.from(
    new Set([
      ...affectations.map((a) => a.classeId),
      ...emploiEntries.map((e) => e.classeId),
      ...principalClasses.map((c) => c.id),
    ])
  );

  const matiereIds = Array.from(
    new Set([
      ...affectations.map((a) => a.matiereId),
      ...emploiEntries.map((e) => e.matiereId).filter(Boolean) as string[],
    ])
  );

  return { classeIds, matiereIds, isRestricted: true };
}
