import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  appliquerImportEdtExternes,
  type PlanImport,
  type DonneesEdtExterne,
} from "@/lib/import-unifie";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { z } from "zod";

const ApplySchema = z.object({
  plan: z.custom<PlanImport<DonneesEdtExterne>>((v) => v && typeof v === "object" && Array.isArray(v.lignes)),
  periodeId: z.string().optional(),
  siteId: z.string().nullable().optional(),
});

/**
 * POST /api/import/edt-externes/apply
 *
 * Applique un plan d'import d'EDT externes en créant des
 * IndisponibiliteEnseignant. Le plan doit avoir été généré par
 * POST /api/import/edt-externes (analyze) et validé par l'utilisateur.
 *
 * Body: { plan, periodeId?, siteId? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "emploi-du-temps:write");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body) return erreurJson("DONNEES_INVALIDES");

  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, {
      detail: parsed.error.issues.map((i) => i.message).join(", "),
    });
  }

  const tenantId = session.user.tenantId;
  const anneeLibelle = await getAnneeCouranteLibelle(tenantId);

  const resultat = await appliquerImportEdtExternes(
    parsed.data.plan,
    tenantId,
    {
      periodeId: parsed.data.periodeId,
      anneeLibelle: anneeLibelle ?? undefined,
      siteId: parsed.data.siteId ?? null,
    }
  );

  return NextResponse.json(resultat);
}
