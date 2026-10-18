import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { mergeFilters, siteFilterForModel } from "@/lib/site-scope";
import { fiabiliteObservee, type MesureValidation } from "@/lib/learnos/entrainement/fiabilite-correcteur";

/**
 * Fiabilité OBSERVÉE du correcteur assisté.
 *
 * La seule vérité disponible sur sa qualité est ce que les enseignants en font :
 * ils confirment, corrigent ou rejettent. Chaque validation est une mesure faite
 * sur de vraies copies, gratuitement. Sans assez de validations, l'échantillon
 * est déclaré insuffisant — jamais présenté comme un taux fiable.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = await checkPermission(session.user.role, "entrainement:valider");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const lues = await prisma.correctionAssistee.findMany({
    where: mergeFilters(
      { tenantId, statut: { in: ["VALIDEE", "REJETEE"] } },
      siteFilterForModel("correctionAssistee", session.user)
    ),
    select: { statut: true, criteresReussis: true, criteresValides: true, details: true },
    orderBy: { valideeLe: "desc" },
    take: 1000,
  });

  const mesures: MesureValidation[] = lues.map((c) => {
    const proposes = Array.isArray(c.criteresReussis) ? (c.criteresReussis as string[]) : [];
    const valides = Array.isArray(c.criteresValides) ? (c.criteresValides as string[]) : [];
    const evalues = Array.isArray(c.details) ? (c.details as { id: string }[]).map((d) => d.id) : [];
    const p = new Set(proposes);
    const v = new Set(valides);
    return {
      validee: c.statut === "VALIDEE",
      ecarts: evalues.filter((id) => p.has(id) !== v.has(id)).length,
      nbCriteres: evalues.length,
    };
  });

  return NextResponse.json(fiabiliteObservee(mesures));
}
