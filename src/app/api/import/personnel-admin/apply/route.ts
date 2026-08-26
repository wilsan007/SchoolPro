import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { erreurJson } from "@/lib/erreurs-api";
import {
  lireFichier,
  empreinteFichier,
  analyserPersonnelAdmin,
  appliquerImportPersonnelAdmin,
} from "@/lib/import-unifie";
import { validerEntetes } from "@/lib/import-modeles";

/**
 * POST /api/import/personnel-admin/apply
 * Analyse + applique un import de personnel administratif.
 * Body: multipart/form-data avec file=...
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return erreurJson("PERMISSIONS_INSUFFISANTES");
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) return erreurJson("DONNEES_INVALIDES");

  const file = formData.get("file");
  if (!(file instanceof File)) return erreurJson("FICHIER_INVALIDE");

  const buffer = Buffer.from(await file.arrayBuffer());
  const empreinte = empreinteFichier(buffer);

  try {
    const { headers, rows } = await lireFichier(buffer, file.type);

    // Validation des entêtes
    const validation = validerEntetes(headers, "personnel-admin");
    if (!validation.valide) {
      return NextResponse.json(
        {
          error: "ENTETES_NON_CONFORMES",
          message: validation.message,
          entetesManquantes: validation.manquantes,
          conseil: "Téléchargez le modèle d'import personnel admin et remplissez-le.",
        },
        { status: 400 }
      );
    }

    const tenantId = session.user.tenantId;
    const plan = await analyserPersonnelAdmin(rows, tenantId, headers);
    plan.empreinte = empreinte;

    const resultat = await appliquerImportPersonnelAdmin(plan, tenantId);

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
    console.error("[API/import/personnel-admin/apply]", e);
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
