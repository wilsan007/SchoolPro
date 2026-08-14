import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { erreurJson } from "@/lib/erreurs-api";
import {
  lireFichier,
  empreinteFichier,
  analyserEnseignants,
  analyserClasses,
  analyserMatieres,
  analyserParents,
  type TypeImport,
} from "@/lib/import-unifie";

/**
 * POST /api/import/[type]/analyze
 * Analyse un fichier d'import et retourne le plan.
 * Body: multipart/form-data avec file=...
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const { type } = await params;
  const typesValides: TypeImport[] = [
    "eleves",
    "enseignants",
    "classes",
    "matieres",
    "parents",
  ];
  if (!typesValides.includes(type as TypeImport)) {
    return erreurJson("DONNEES_INVALIDES", undefined, {
      detail: `Type d'import invalide: ${type}`,
    });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) return erreurJson("DONNEES_INVALIDES");

  const file = formData.get("file");
  if (!(file instanceof File)) return erreurJson("FICHIER_INVALIDE");

  const buffer = Buffer.from(await file.arrayBuffer());
  const empreinte = empreinteFichier(buffer);

  try {
    const rows = await lireFichier(buffer, file.type);

    const tenantId = session.user.tenantId;
    let plan;

    switch (type as TypeImport) {
      case "enseignants":
        plan = await analyserEnseignants(rows, tenantId);
        break;
      case "classes":
        plan = await analyserClasses(rows, tenantId);
        break;
      case "matieres":
        plan = await analyserMatieres(rows, tenantId);
        break;
      case "parents":
        plan = await analyserParents(rows, tenantId);
        break;
      case "eleves":
        // L'import élèves existant a sa propre route /api/import/eleves
        return erreurJson("DONNEES_INVALIDES", undefined, {
          detail: "Utiliser /api/import/eleves pour l'import d'élèves",
        });
      default:
        return erreurJson("DONNEES_INVALIDES");
    }

    plan.empreinte = empreinte;
    return Response.json(plan);
  } catch (e) {
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
