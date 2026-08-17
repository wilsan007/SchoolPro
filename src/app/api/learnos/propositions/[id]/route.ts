import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";
import {
  ajusterPlanLecon,
  validerPlanLecon,
  ajusterRubrique,
  validerRubrique,
  rejeterProposition,
  type TypeProposition,
} from "@/lib/learnos/workflow-validation";
import { revalidatePath } from "next/cache";

/**
 * PATCH /api/learnos/propositions/[id]
 *
 * Workflow de validation des propositions IA (plans de leçon et grilles
 * d'évaluation). Trois actions possibles :
 *
 *   - ajuster  : l'enseignant modifie le contenu (PROPOSE → AJUSTE)
 *   - valider  : la direction valide (AJUSTE → VALIDE)
 *   - rejeter  : n'importe quel rôle autorisé rejette avec motif (→ REJETE)
 *
 * Body :
 *   {
 *     action: "ajuster" | "valider" | "rejeter",
 *     type:   "plan_lecon" | "rubrique",
 *     motif?: string,                 // requis pour "rejeter"
 *     modifications?: { ... }         // requis pour "ajuster"
 *   }
 *
 * ACCÈS :
 *   - ajuster / rejeter : TEACHER, CLASS_TEACHER, SUBJECT_LEAD, TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN
 *   - valider           : TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN
 */
const PatchSchema = z.object({
  action: z.enum(["ajuster", "valider", "rejeter"]),
  type: z.enum(["plan_lecon", "rubrique"]),
  motif: z.string().max(500).optional(),
  modifications: z
    .object({
      titre: z.string().optional(),
      objectifs: z.array(z.string()).optional(),
      etapes: z
        .array(
          z.object({
            nom: z.string(),
            duree: z.number(),
            description: z.string(),
            support: z.string().optional(),
          })
        )
        .optional(),
      materiel: z.array(z.string()).optional(),
      evaluation: z.string().optional(),
      differentiation: z.string().optional(),
      dureeTotale: z.number().optional(),
      // Pour les rubriques :
      criteres: z
        .array(
          z.object({
            nom: z.string(),
            points: z.number(),
            niveaux: z.object({
              excellent: z.string(),
              satisfaisant: z.string(),
              fragile: z.string(),
              insuffisant: z.string(),
            }),
          })
        )
        .optional(),
      totalPoints: z.number().optional(),
    })
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "curriculum:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }

  const { action, type, motif, modifications } = parsed.data;
  const tenantId = session.user.tenantId;
  const claims = session.user;
  const userId = session.user.id;
  const role = session.user.role;

  try {
    if (action === "rejeter") {
      if (!motif?.trim()) {
        return NextResponse.json(
          { error: "Le motif de rejet est obligatoire" },
          { status: 400 }
        );
      }
      await rejeterProposition(
        tenantId,
        claims,
        type as TypeProposition,
        id,
        motif,
        userId,
        role
      );
    } else if (action === "ajuster") {
      if (!modifications) {
        return NextResponse.json(
          { error: "Les modifications sont requises pour l'ajustement" },
          { status: 400 }
        );
      }
      if (type === "plan_lecon") {
        await ajusterPlanLecon(
          tenantId,
          claims,
          id,
          modifications,
          userId,
          role
        );
      } else {
        await ajusterRubrique(
          tenantId,
          claims,
          id,
          {
            titre: modifications.titre,
            criteres: modifications.criteres,
            totalPoints: modifications.totalPoints,
          },
          userId,
          role
        );
      }
    } else if (action === "valider") {
      if (type === "plan_lecon") {
        await validerPlanLecon(tenantId, claims, id, userId, role);
      } else {
        await validerRubrique(tenantId, claims, id, userId, role);
      }
    }

    revalidatePath("/direction");
    revalidatePath("/propositions-ia");
    return NextResponse.json({ success: true, action, type, id });
  } catch (error) {
    console.error("[api/propositions PATCH]", error);
    const message =
      error instanceof Error ? error.message : "Erreur lors du traitement";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
