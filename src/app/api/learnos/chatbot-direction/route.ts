import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { poserQuestion, type TourConversation, CHATBOT_DIRECTION_ACTIF } from "@/lib/learnos/chatbot-direction";
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
 *
 * TEMPORAIREMENT DÉSACTIVÉ — voir `CHATBOT_DIRECTION_ACTIF`.
 * Tant que le flag est `false`, l'API renvoie un 503 contrôlé sans invoquer
 * le moteur LLM ni aucune requête Prisma. Aucun coût n'est engagé.
 */
export async function POST(req: NextRequest) {
  // Feature flag : désactivation globale de l'assistant d'analyse.
  // On renvoie un 503 contrôlé AVANT toute vérification de rôle ou de session,
  // pour garantir qu'aucun chemin n'atteint le moteur LLM.
  if (!CHATBOT_DIRECTION_ACTIF) {
    return NextResponse.json(
      {
        error: "CHATBOT_DISABLED",
        message: "Assistant d'analyse temporairement désactivé.",
      },
      { status: 503 }
    );
  }

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
    // Récupérer le nom du tenant pour l'injecter dans le contexte de l'IA.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true },
    });

    const reponse = await poserQuestion(
      tenantId,
      session.user,
      question.trim(),
      session.user.id,
      historiqueValide,
      await getDemoNow(),
      tenant?.name ?? "Établissement",
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
