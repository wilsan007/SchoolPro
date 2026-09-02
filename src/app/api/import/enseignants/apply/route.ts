import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  lireFichier,
  empreinteFichier,
  analyserEnseignants,
  appliquerImportEnseignants,
} from "@/lib/import-unifie";
import { validerEntetes } from "@/lib/import-modeles";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * POST /api/import/enseignants/apply
 * Analyse + applique un import d'enseignants en une seule étape.
 * Body: multipart/form-data avec file=... et optionnellement siteId=...
 */

const ApplySchema = z.object({
  file: z.instanceof(File, { message: "Fichier requis" }),
  siteId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "rh:write");
  if (denied) return denied;

  const formData = await req.formData().catch(() => null);
  if (!formData) return erreurJson("DONNEES_INVALIDES");

  const parsed = ApplySchema.safeParse({
    file: formData.get("file"),
    siteId: formData.get("siteId"),
  });

  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, {
      details: parsed.error.issues,
    });
  }

  const { file, siteId } = parsed.data;

  const siteIdParDefaut = siteId ?? session.user.siteId ?? null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const empreinte = empreinteFichier(buffer);

  const tenantId = session.user.tenantId;
  const annee = await getAnneeCouranteLibelle(tenantId);

  try {
    const { headers, rows } = await lireFichier(buffer, file.type);

    const validation = validerEntetes(headers, "enseignants");
    if (!validation.valide) {
      return NextResponse.json(
        {
          error: "ENTETES_NON_CONFORMES",
          message: validation.message,
          entetesManquantes: validation.manquantes,
          conseil: "Téléchargez le modèle d'import enseignants et remplissez-le.",
        },
        { status: 400 }
      );
    }

    const plan = await analyserEnseignants(rows, tenantId, headers);
    plan.empreinte = empreinte;

    const resultat = await appliquerImportEnseignants(plan, tenantId, {
      annee: annee ?? new Date().getFullYear().toString(),
      siteIdParDefaut,
    });

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: plan.totalLignes,
        created: resultat.crees,
        updated: resultat.misAJour,
        skipped: resultat.ignores,
        errors: resultat.erreurs,
        details: resultat.details.slice(0, 50),
      },
    });
  } catch (e) {
    console.error("[API/import/enseignants/apply]", e);
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
