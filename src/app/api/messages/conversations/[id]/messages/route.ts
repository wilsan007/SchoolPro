import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { canWriteInConversation } from "@/lib/messaging-scope";

const SendSchema = z.object({
  content: z.string().min(1).max(5000),
  replyToId: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "messages:read");
    if (denied) return denied;

    const { id } = await params;
    const userId = session.user.id;
    const tenantId = session.user.tenantId;
    if (!tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    // Vérifier que l'utilisateur est participant et que la conversation appartient au tenant
    const participation = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: id,
        userId,
        conversation: { tenantId },
      },
      include: { conversation: { select: { readOnly: true, createdBy: true, type: true } } },
    });
    if (!participation) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    // Pagination: cursor-based avec paramètres before/after
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const before = searchParams.get("before"); // ISO date — messages avant cette date

    // eslint-disable-next-line ecolpro/require-tenant-id -- conversationId vérifiée via participation avec tenantId ci-dessus
    const messages = await prisma.message.findMany({
      where: {
        conversationId: id,
        deletedAt: null,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // +1 pour savoir s'il y a plus
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    items.reverse(); // remettre en ordre chronologique

    // Marquer comme lu
    // eslint-disable-next-line ecolpro/require-tenant-id -- participation déjà vérifiée avec tenantId ci-dessus
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({
      messages: items.map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        senderName: m.sender.name,
        createdAt: m.createdAt,
        readBy: m.readBy,
        replyToId: m.replyToId,
        attachmentUrl: m.attachmentUrl,
        attachmentType: m.attachmentType,
        editedAt: m.editedAt,
      })),
      hasMore,
      oldestCursor: items.length > 0 ? items[0].createdAt.toISOString() : null,
      canWrite: canWriteInConversation(
        participation.role,
        participation.conversation.readOnly,
        participation.conversation.createdBy === userId,
        session.user.role
      ),
    });
  } catch (error) {
    console.error("[API/messages/conversations/:id/messages GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    // Répondre dans une conversation existante exige messages:reply (les élèves l'ont)
    const denied = checkPermission(session.user.role, "messages:reply");
    if (denied) return denied;

    const { id } = await params;
    const userId = session.user.id;
    const tenantId = session.user.tenantId;
    if (!tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const participation = await prisma.conversationParticipant.findFirst({
      where: {
        conversationId: id,
        userId,
        conversation: { tenantId },
      },
      include: { conversation: { select: { readOnly: true, createdBy: true, type: true, subject: true } } },
    });
    if (!participation) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    // Vérifier que l'utilisateur peut écrire dans cette conversation
    const canWrite = canWriteInConversation(
      participation.role,
      participation.conversation.readOnly,
      participation.conversation.createdBy === userId,
      session.user.role
    );
    if (!canWrite) {
      return NextResponse.json({ error: "Cette conversation est en mode annonce — vous ne pouvez pas écrire" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = SendSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: userId,
        content: parsed.data.content,
        readBy: [userId],
        replyToId: parsed.data.replyToId ?? null,
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    // Mettre à jour updatedAt de la conversation
    // eslint-disable-next-line ecolpro/require-tenant-id -- participation déjà vérifiée avec tenantId ci-dessus
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    // Marquer comme lu pour l'expéditeur
    // eslint-disable-next-line ecolpro/require-tenant-id -- participation déjà vérifiée avec tenantId ci-dessus
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() },
    });

    // --- Notifications IN_APP aux autres participants ---
    try {
      // eslint-disable-next-line ecolpro/require-tenant-id -- conversationId vérifiée via participation avec tenantId ci-dessus
      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId: id, userId: { not: userId } },
        select: { userId: true },
      });

      const senderName = message.sender.name ?? "Un utilisateur";
      const subject = participation.conversation.subject ?? "Conversation";

      if (participants.length > 0) {
        await prisma.notification.create({
          data: {
            tenantId,
            titre: "Nouveau message",
            contenu: `Vous avez reçu un nouveau message de ${senderName} dans « ${subject} ».\n\n${parsed.data.content.slice(0, 200)}${parsed.data.content.length > 200 ? "…" : ""}`,
            canal: "IN_APP",
            statut: "ENVOYEE",
            cible: "TOUS",
            envoyeParId: userId,
            nbDestinataires: participants.length,
            nbDelivres: participants.length,
            envoyeeAt: new Date(),
          },
        });
      }
    } catch (notifError) {
      console.error("[API/messages POST] Notification error:", notifError);
    }

    return NextResponse.json(
      {
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        senderName: message.sender.name,
        createdAt: message.createdAt,
        readBy: message.readBy,
        replyToId: message.replyToId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API/messages/conversations/:id/messages POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
