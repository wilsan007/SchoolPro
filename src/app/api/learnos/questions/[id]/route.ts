import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel } from "@/lib/site-scope";
import { parseStructure } from "@/lib/learnos/entrainement";
import { estAutoCorrigeable } from "@/lib/learnos/formats";

const Schema = z.object({
  enonce: z.string().min(1).max(2000).optional(),
  structure: z.unknown().optional(),
  bareme: z.number().positive().max(100).optional(),
  actif: z.boolean().optional(),
  /** `true` = l'enseignant valide la question générée. Jamais `false`. */
  relue: z.literal(true).optional(),
});

/**
 * Relecture et correction d'une question.
 *
 * DEUX GESTES DISTINCTS, ET C'EST VOLONTAIRE
 * ------------------------------------------
 * `relue: true` signe la question — la preuve qu'elle produira cesse d'être
 * décotée (`FACTEUR_QUESTION_NON_RELUE`). Modifier l'énoncé ou la structure
 * signe aussi, sans qu'on ait à le demander : on ne corrige pas un texte qu'on
 * n'a pas lu, et exiger un second clic laisserait décotées des questions qu'un
 * enseignant vient pourtant de reprendre à la main.
 *
 * On ne « dé-relit » pas : `relue` n'accepte que `true`. Retirer une signature
 * ne réparerait rien — les preuves déjà produites l'ont été sous l'ancienne
 * confiance, et les recalculer sur un motif administratif réécrirait le passé.
 * Une question devenue mauvaise se désactive (`actif: false`).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "curriculum:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.flatten() });
  }

  const question = await prisma.question.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("question", session.user),
    },
    select: { id: true, format: true, origine: true, relueLe: true },
  });
  if (!question) return erreurJson("QUESTION_INTROUVABLE");

  const data: Record<string, unknown> = {};

  if (parsed.data.enonce !== undefined) data.enonce = parsed.data.enonce;
  if (parsed.data.actif !== undefined) data.actif = parsed.data.actif;
  if (parsed.data.bareme !== undefined) data.bareme = parsed.data.bareme;

  if (parsed.data.structure !== undefined) {
    if (!estAutoCorrigeable(question.format)) return erreurJson("FORMAT_NON_AUTO_CORRIGEABLE");
    const lue = parseStructure(parsed.data.structure);
    if (!lue) return erreurJson("STRUCTURE_INVALIDE");
    data.structure = lue;
    if (parsed.data.bareme === undefined) {
      data.bareme = lue.etapes.reduce((s, e) => s + e.points, 0);
    }
  }

  // Corriger une question, c'est l'avoir lue : la signature suit, sans qu'on
  // ait à la demander séparément. L'oublier laisserait décotées des questions
  // qu'un enseignant vient pourtant de reprendre à la main.
  const signe =
    parsed.data.relue === true ||
    parsed.data.structure !== undefined ||
    parsed.data.enonce !== undefined;

  if (signe && !question.relueLe) {
    data.relueParId = session.user.id;
    data.relueLe = new Date();
  }

  if (Object.keys(data).length === 0) return erreurJson("DONNEES_INVALIDES");

  await prisma.question.update({ where: { id: question.id }, data });
  return NextResponse.json({ ok: true });
}

/**
 * Retire une question de la banque.
 *
 * Désactivation et non suppression : les exercices déjà servis gardent leur
 * énoncé, et l'historique d'un élève reste lisible. Supprimer casserait la
 * relation `ExerciceAssigne.question` (contrainte `Restrict`), ce qui est
 * précisément le garde-fou attendu.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "curriculum:write");
  if (denied) return denied;

  const { id } = await params;
  const maj = await prisma.question.updateMany({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("question", session.user),
    },
    data: { actif: false },
  });
  if (maj.count === 0) return erreurJson("QUESTION_INTROUVABLE");

  return NextResponse.json({ ok: true });
}
