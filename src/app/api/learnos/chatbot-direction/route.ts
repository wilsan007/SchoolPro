import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { poserQuestion, type TourConversation } from "@/lib/learnos/chatbot-direction";
import { getDemoNow } from "@/lib/demo-now";

/**
 * POST /api/learnos/chatbot-direction
 * Body: { question: string, historique?: TourConversation[] }
 *
 * Chatbot d'analyse de données en langage naturel pour la direction.
 *
 * ACCÈS : TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN uniquement.
 * L'IA ne peut qu'appeler des outils fermés — jamais de SQL libre.
 * Hors périmètre → réponse bornée qui le signale.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  // Réservé à la direction.
  const rolesAutorises = ["TENANT_ADMIN", "PRINCIPAL", "SUPER_ADMIN"];
  if (!rolesAutorises.includes(session.user.role)) {
    return erreurJson("NON_AUTORISE");
  }

  const tenantId = session.user.tenantId;
  const body = await req.json().catch(() => ({}));
  const question = body?.question as string;
  const historique = (body?.historique ?? []) as TourConversation[];

  if (!question || question.trim().length < 3) {
    return NextResponse.json(
      { error: "Question trop courte" },
      { status: 400 }
    );
  }

  if (question.length > 500) {
    return NextResponse.json(
      { error: "Question trop longue (max 500 caractères)" },
      { status: 400 }
    );
  }

  // Valider l'historique : max 10 tours, chaque message max 1000 caractères.
  const historiqueValide = Array.isArray(historique)
    ? historique
        .filter(
          (t) =>
            (t.role === "user" || t.role === "assistant") &&
            typeof t.content === "string" &&
            t.content.length <= 1000
        )
        .slice(-10)
    : [];

  try {
    const reponse = await poserQuestion(
      tenantId,
      session.user,
      question.trim(),
      session.user.id,
      historiqueValide,
      await getDemoNow()
    );
    return NextResponse.json(reponse);
  } catch (error) {
    console.error("[api/chatbot-direction]", error);
    return NextResponse.json(
      { error: "Erreur lors du traitement de la question" },
      { status: 500 }
    );
  }
}
