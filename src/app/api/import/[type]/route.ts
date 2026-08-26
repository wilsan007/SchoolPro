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
  analyserEdtExternes,
  analyserPersonnelAdmin,
  type TypeImport,
} from "@/lib/import-unifie";
import { validerEntetes, type TypeModele } from "@/lib/import-modeles";

/**
 * POST /api/import/[type]
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
    "edt-externes",
    "personnel-admin",
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
    const { headers, rows } = await lireFichier(buffer, file.type);

    // Validation des entêtes contre le modèle attendu
    const validation = validerEntetes(headers, type as TypeModele);
    if (!validation.valide) {
      return Response.json(
        {
          error: "ENTETES_NON_CONFORMES",
          message: validation.message,
          entetesManquantes: validation.manquantes,
          entetesRecues: headers,
          conseil: `Téléchargez le modèle d'import pour le type "${type}" et remplissez-le avec vos données.`,
        },
        { status: 400 }
      );
    }

    const tenantId = session.user.tenantId;
    let plan;

    switch (type as TypeImport) {
      case "enseignants":
        plan = await analyserEnseignants(rows, tenantId, headers);
        break;
      case "classes":
        plan = await analyserClasses(rows, tenantId, headers);
        break;
      case "matieres":
        plan = await analyserMatieres(rows, tenantId, headers);
        break;
      case "parents":
        plan = await analyserParents(rows, tenantId, headers);
        break;
      case "edt-externes":
        plan = await analyserEdtExternes(rows, tenantId, headers);
        break;
      case "personnel-admin":
        plan = await analyserPersonnelAdmin(rows, tenantId, headers);
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
