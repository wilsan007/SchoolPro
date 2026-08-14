import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import { genererQuestions } from "@/lib/learnos/generation-questions";
import { estAutoCorrigeable } from "@/lib/learnos/formats";

const Schema = z.object({
  competenceId: z.string().min(1),
  palier: z.enum(["RESTITUTION", "APPLICATION", "CONSOLIDATION", "TRANSFERT", "OUVERTURE"]),
  format: z.enum([
    "SAISIE_COURTE",
    "CHOIX_UNIQUE",
    "ETAPES_GUIDEES",
    "REMISE_EN_ORDRE",
    "APPARIEMENT",
  ]),
  nombre: z.number().int().min(1).max(5).default(3),
});

/**
 * Remplit la banque à partir du curriculum (LEARNOS P8).
 *
 * Réservé aux adultes : la génération écrit des énoncés que des élèves
 * recevront, et coûte de l'argent. `ai:teacher` plutôt qu'un droit dédié — un
 * établissement qui coupe l'IA pour les enseignants doit couper celle-ci aussi.
 *
 * Le résultat remonte le nombre de propositions **rejetées** à la validation.
 * Le taire donnerait l'illusion d'une génération parfaite ; c'est précisément
 * ce chiffre qui dit quand le prompt ou le modèle sont à revoir.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "ai:teacher");
  if (denied) return denied;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.flatten() });
  }
  if (!estAutoCorrigeable(parsed.data.format)) {
    return erreurJson("FORMAT_NON_AUTO_CORRIGEABLE");
  }

  try {
    const resultat = await genererQuestions(
      session.user.tenantId,
      session.user,
      parsed.data,
      session.user.id
    );
    return NextResponse.json(resultat);
  } catch (error) {
    // Aucun fournisseur configuré ou tous en échec : ce n'est pas un défaut de
    // la demande. On le dit clairement, et on rappelle que la banque reste
    // remplissable à la main — le dispositif ne dépend pas de l'IA.
    if (error instanceof AiAllProvidersFailedError) {
      return erreurJson("IA_INDISPONIBLE", undefined, { detail: error.message });
    }
    if (error instanceof Error && error.message.includes("compétence introuvable")) {
      return erreurJson("COMPETENCE_INTROUVABLE");
    }
    throw error;
  }
}
