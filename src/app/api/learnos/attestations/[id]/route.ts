import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";
import { ouvrirAttestation, signerAttestation } from "@/lib/learnos/attestation";
import type { Prisma } from "@prisma/client";

const Schema = z.object({ decision: z.enum(["valider", "ecarter", "demarrer"]) });

/**
 * Signature ou refus d'une attestation.
 *
 * C'est le seul geste du dispositif qui puisse débloquer `MASTERED` : une
 * compétence travaillée seule ne devient « acquise » que si un enseignant a
 * accepté d'aller la vérifier, et que l'élève a réussi sous son regard. Deux
 * conséquences assumées :
 *
 *  - **La signature est nominative.** `validerFeuille` refuse un identifiant
 *    vide, ici comme pour les feuilles-jalons.
 *  - **Refuser est une réponse valide.** Un enseignant qui sait que l'élève
 *    n'y est pas doit pouvoir le dire, sans que le système repropose la même
 *    attestation le lendemain — `REFUSEE` est un état terminal, et le filtre
 *    de doublon de `candidatsAttestation` ne le compte plus comme en cours.
 *    L'élève continuera de s'entraîner ; c'est le résultat souhaité.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");

  const tenantId = session.user.tenantId;

  // Périmètre personnel : sans `personalScopeFilter`, un PARENT / STUDENT
  // pourrait agir sur l'attestation de n'importe quel élève du tenant.
  const feuille = await prisma.feuilleExercices.findFirst({
    where: mergeFilters(
      { id, tenantId, type: "attestation" },
      siteFilterForModel("feuilleExercices", session.user),
      personalScopeFilter(session.user, "eleve")
    ) as Prisma.FeuilleExercicesWhereInput,
    select: { id: true, statut: true, assigneeLe: true },
  });
  if (!feuille) return erreurJson("ATTESTATION_INTROUVABLE");

  // Lancement en classe : second geste, distinct de la signature.
  if (parsed.data.decision === "demarrer") {
    const ouverte = await ouvrirAttestation(tenantId, feuille.id, session.user);
    if (!ouverte) return erreurJson("FEUILLE_DEJA_TRAITEE", { statut: feuille.statut });
    return NextResponse.json({ statut: "ASSIGNEE", ouverte: true });
  }

  if (feuille.statut !== "PROPOSEE") {
    return erreurJson("FEUILLE_DEJA_TRAITEE", { statut: feuille.statut });
  }

  if (parsed.data.decision === "ecarter") {
    await prisma.feuilleExercices.update({
      where: { id: feuille.id },
      data: { statut: "REFUSEE", valideParId: session.user.id, valideeLe: new Date() },
    });
    return NextResponse.json({ statut: "REFUSEE" });
  }

  // Signature seule : la feuille est acceptée, mais pas encore ouverte à
  // l'élève — c'est `demarrer` qui le fera, en classe.
  const signee = await signerAttestation(tenantId, feuille.id, session.user.id, session.user);
  if (!signee) return erreurJson("FEUILLE_DEJA_TRAITEE", { statut: feuille.statut });
  return NextResponse.json({ statut: "ASSIGNEE", ouverte: false });
}
