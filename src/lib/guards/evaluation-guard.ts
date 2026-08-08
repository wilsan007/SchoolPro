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
  const noteCount = await prisma.note.count({
    where: { evaluationId, tenantId },
  });

  if (noteCount > 0) {
    return `${noteCount} note(s) sont rattachées à cette évaluation — dépubliez et supprimez les notes d'abord.`;
  }

  return null;
}
