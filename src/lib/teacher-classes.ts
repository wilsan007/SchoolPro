import prisma from "@/lib/prisma";
import type { Role } from "@prisma/client";

const TEACHER_ROLES: Role[] = ["TEACHER", "CLASS_TEACHER"];

/**
 * Détermine si un rôle est un rôle d'enseignant restreint à ses classes.
 */
export function isTeacherRole(role: Role): boolean {
  return TEACHER_ROLES.includes(role);
}

/**
 * Récupère les IDs des classes attribuées à un enseignant
 * (via l'emploi du temps et/ou le rôle de prof principal).
 *
 * Retourne également les IDs des matières qu'il enseigne.
 */
export async function getTeacherScope(
  tenantId: string,
  userId: string,
  role: Role
): Promise<{
  classeIds: string[];
  matiereIds: string[];
  isRestricted: boolean;
}> {
  if (!isTeacherRole(role)) {
    return { classeIds: [], matiereIds: [], isRestricted: false };
  }

  const enseignant = await prisma.enseignant.findFirst({
    where: { userId, tenantId },
    select: { id: true },
  });

  if (!enseignant) {
    return { classeIds: [], matiereIds: [], isRestricted: true };
  }

  const [emploiEntries, principalClasses] = await Promise.all([
    prisma.emploiTemps.findMany({
      where: { enseignantId: enseignant.id, tenantId },
      select: { classeId: true, matiereId: true },
      distinct: ["classeId", "matiereId"],
    }),
    prisma.classe.findMany({
      where: { profPrincipalId: enseignant.id, tenantId },
      select: { id: true },
    }),
  ]);

  const classeIds = Array.from(
    new Set([
      ...emploiEntries.map((e) => e.classeId),
      ...principalClasses.map((c) => c.id),
    ])
  );

  const matiereIds = Array.from(
    new Set(emploiEntries.map((e) => e.matiereId).filter(Boolean) as string[])
  );

  return { classeIds, matiereIds, isRestricted: true };
}
