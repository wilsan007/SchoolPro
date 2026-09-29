import prisma from "@/lib/prisma";

/**
 * Vérifie qu'une évaluation peut être supprimée.
 * Une évaluation notée (avec au moins une note rattachée) ne peut pas être supprimée.
 * Retourne null si la suppression est autorisée, ou un message d'erreur explicite.
 */
export async function checkEvaluationDeletable(
  evaluationId: string,
  tenantId: string
): Promise<string | null> {
  // Accès par identifiant (`evaluationId`) : ni le site ni l'année ne se déduisent
  // d'une évaluation — l'appelant les a validés. Ce garde-fou ne fait qu'une
  // chose : refuser la suppression d'une évaluation déjà notée.
  // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-annee-filter
  const noteCount = await prisma.note.count({
    where: { evaluationId, tenantId },
  });

  if (noteCount > 0) {
    return `${noteCount} note(s) sont rattachées à cette évaluation — dépubliez et supprimez les notes d'abord.`;
  }

  return null;
}
