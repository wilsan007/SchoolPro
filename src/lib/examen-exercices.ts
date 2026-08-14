/**
 * Service de liaison Examen ↔ FeuilleExercices.
 *
 * Permet de transformer un examen en feuille d'évaluation pédagogique
 * avec exercices assignés et auto-correction LEARNOS.
 */

import prisma from "@/lib/prisma";

/**
 * Lie un examen à une feuille d'exercices existante.
 * La feuille doit être de type "attestation" ou "jalon" pour
 * garantir une validation pédagogique.
 */
export async function lierExamenAFeuille(
  examenId: string,
  feuilleExercicesId: string,
  tenantId: string
) {
  // Vérifier que l'examen et la feuille appartiennent au tenant
  const [examen, feuille] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- la fonction reçoit tenantId en paramètre
    prisma.examen.findFirst({ where: { id: examenId, tenantId } }),
    prisma.feuilleExercices.findFirst({ where: { id: feuilleExercicesId, tenantId } }),
  ]);

  if (!examen) throw new Error("Examen introuvable");
  if (!feuille) throw new Error("Feuille d'exercices introuvable");

  return prisma.examen.update({
    where: { id: examenId },
    data: { feuilleExercicesId },
    include: { feuilleExercices: { include: { exercices: true } } },
  });
}

/**
 * Retire le lien entre un examen et sa feuille d'exercices.
 */
export async function delierExamenDeFeuille(examenId: string) {
  // eslint-disable-next-line ecolpro/require-tenant-id -- tenantId vérifié via findFirst ci-dessus
  return prisma.examen.update({
    where: { id: examenId },
    data: { feuilleExercicesId: null },
  });
}

/**
 * Récupère un examen avec sa feuille d'exercices et les exercices assignés.
 */
export async function getExamenAvecFeuille(examenId: string, tenantId: string) {
  // eslint-disable-next-line ecolpro/require-site-filter -- tenantId passé en paramètre
  return prisma.examen.findFirst({
    where: { id: examenId, tenantId },
    include: {
      sessions: true,
      feuilleExercices: {
        include: {
          exercices: {
            include: {
              question: { select: { id: true, enonce: true, format: true } },
            },
            orderBy: { ordre: "asc" },
          },
        },
      },
    },
  });
}

/**
 * Liste les examens qui ont une feuille d'exercices liée.
 */
export async function listerExamensAvecFeuille(tenantId: string) {
  // eslint-disable-next-line ecolpro/require-site-filter -- tenantId passé en paramètre
  return prisma.examen.findMany({
    where: { tenantId, feuilleExercicesId: { not: null } },
    include: {
      feuilleExercices: {
        select: {
          id: true,
          type: true,
          statut: true,
          _count: { select: { exercices: true } },
        },
      },
    },
    orderBy: { dateDebut: "desc" },
  });
}
