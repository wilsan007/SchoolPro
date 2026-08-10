import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import {
  getAllowedConversationTypes,
  getClassParticipants,
  getTenantParticipants,
  getParticipantRole,
} from "@/lib/messaging-scope";
import type { ConversationType, ParticipantRole } from "@prisma/client";

const CreateSchema = z.object({
  participantIds: z.array(z.string().min(1)).max(50).optional(),
  subject: z.string().max(200).optional(),
  firstMessage: z.string().min(1).max(5000),
  type: z.enum([
    "DIRECT",
    "CLASS_ANNOUNCEMENT",
    "CLASS_DISCUSSION",
    "ADMIN_BROADCAST",
    "PARENT_TEACHER",
    "PARENT_ADMIN",
    "STAFF_GROUP",
    "FREE",
  ]).default("DIRECT"),
  classeId: z.string().optional(),
  readOnly: z.boolean().default(false),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "messages:read");
    if (denied) return denied;

    const userId = session.user.id;
    const tenantId = session.user.tenantId;
    if (!tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const conversations = await prisma.conversation.findMany({
      where: {
        tenantId,
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: { select: { name: true } } },
        },
        classe: { select: { id: true, nom: true, niveau: true } },
      },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });

    // Compter les messages non lus pour chaque conversation en parallèle
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const myParticipation = conv.participants.find((p) => p.userId === userId);
        const lastReadAt = myParticipation?.lastReadAt;

        // Compter réellement les messages non lus (après lastReadAt)
        const unreadCount = lastReadAt
          ? await prisma.message.count({
              where: {
                conversationId: conv.id,
                senderId: { not: userId },
                createdAt: { gt: lastReadAt },
              },
            })
          : await prisma.message.count({
              where: {
                conversationId: conv.id,
                senderId: { not: userId },
              },
            });

        const lastMessage = conv.messages[0] ?? null;

        return {
          id: conv.id,
          subject: conv.subject,
          isGroup: conv.isGroup,
          type: conv.type,
          classeId: conv.classeId,
          classeNom: conv.classe?.nom ?? null,
          readOnly: conv.readOnly,
          pinned: conv.pinned,
          createdBy: conv.createdBy,
          myRole: myParticipation?.role ?? "MEMBER",
          participants: conv.participants.map((p) => ({
            id: p.user.id,
            name: p.user.name,
            role: p.user.role,
            avatarUrl: p.user.avatarUrl,
          })),
          messages: [],
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content: lastMessage.content,
                senderId: lastMessage.senderId,
                senderName: lastMessage.sender.name,
                createdAt: lastMessage.createdAt,
                readBy: lastMessage.readBy,
              }
            : null,
          unreadCount,
        };
      })
    );

    return NextResponse.json({ conversations: conversationsWithUnread });
  } catch (error) {
    console.error("[API/messages/conversations GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    // La création de conversation exige messages:write — les élèves n'ont que messages:reply
    const denied = checkPermission(session.user.role, "messages:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const { participantIds, subject, firstMessage, type, classeId, readOnly } = parsed.data;
    const userId = session.user.id;
    const tenantId = session.user.tenantId;

    // Vérifier que le rôle de l'utilisateur permet de créer ce type
    const allowedTypes = getAllowedConversationTypes(session.user.role);
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: "Type de conversation non autorisé pour votre rôle" }, { status: 403 });
    }

    // Construire la liste des participants selon le type
    let participantsToCreate: { userId: string; role: ParticipantRole; lastReadAt: Date | null }[] = [];
    let resolvedClasseId: string | null = null;
    let resolvedSiteId: string | null = session.user.siteId ?? null;

    if (type === "CLASS_ANNOUNCEMENT" || type === "CLASS_DISCUSSION") {
      if (!classeId) {
        return NextResponse.json({ error: "classeId requis pour une conversation de classe" }, { status: 400 });
      }
      // Vérifier que la classe existe et appartient au tenant
      const classe = await prisma.classe.findFirst({ where: { id: classeId, tenantId } });
      if (!classe) {
        return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
      }
      resolvedClasseId = classeId;
      resolvedSiteId = classe.siteId ?? null;

      const classParticipants = await getClassParticipants(tenantId, classeId, userId);
      participantsToCreate = classParticipants.map((p) => ({
        userId: p.userId,
        role: p.role,
        lastReadAt: p.userId === userId ? new Date() : null,
      }));
    } else if (type === "ADMIN_BROADCAST") {
      const tenantParticipants = await getTenantParticipants(tenantId, userId, resolvedSiteId);
      participantsToCreate = tenantParticipants.map((p) => ({
        userId: p.userId,
        role: p.role,
        lastReadAt: p.userId === userId ? new Date() : null,
      }));
    } else if (type === "STAFF_GROUP") {
      // Enseignants + personnel du tenant
      const staffUsers = await prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
          role: { in: ["TEACHER", "CLASS_TEACHER", "PRINCIPAL", "COUNSELOR", "TENANT_ADMIN", "SECRETARY", "ACCOUNTANT", "NURSE", "SUPER_ADMIN"] },
        },
        select: { id: true },
      });
      participantsToCreate = staffUsers.map((u) => ({
        userId: u.id,
        role: (u.id === userId ? "ADMIN" : "MEMBER") as ParticipantRole,
        lastReadAt: u.id === userId ? new Date() : null,
      }));
    } else {
      // DIRECT, PARENT_TEACHER, PARENT_ADMIN, FREE — participants manuels
      if (!participantIds || participantIds.length === 0) {
        return NextResponse.json({ error: "Au moins un destinataire requis" }, { status: 400 });
      }
      const allParticipantIds = [...new Set([userId, ...participantIds])];
      participantsToCreate = allParticipantIds.map((id) => ({
        userId: id,
        role: getParticipantRole(type, id, userId, session.user.role) as ParticipantRole,
        lastReadAt: id === userId ? new Date() : null,
      }));
    }

    if (participantsToCreate.length === 0) {
      return NextResponse.json({ error: "Aucun participant à ajouter" }, { status: 400 });
    }

    const isGroup = participantsToCreate.length > 2 || type === "CLASS_ANNOUNCEMENT" || type === "CLASS_DISCUSSION" || type === "ADMIN_BROADCAST" || type === "STAFF_GROUP";

    const conv = await prisma.conversation.create({
      data: {
        tenantId,
        subject: subject ?? null,
        isGroup,
        type: type as ConversationType,
        classeId: resolvedClasseId,
        siteId: resolvedSiteId,
        createdBy: userId,
        readOnly,
        participants: {
          create: participantsToCreate,
        },
        messages: {
          create: {
            senderId: userId,
            content: firstMessage,
            readBy: [userId],
          },
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { sender: { select: { name: true } } },
        },
        classe: { select: { id: true, nom: true } },
      },
    });

    const messages = conv.messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      senderName: m.sender.name,
      createdAt: m.createdAt,
      readBy: m.readBy,
    }));

    return NextResponse.json(
      {
        id: conv.id,
        subject: conv.subject,
        isGroup: conv.isGroup,
        type: conv.type,
        classeId: conv.classeId,
        classeNom: conv.classe?.nom ?? null,
        readOnly: conv.readOnly,
        pinned: conv.pinned,
        createdBy: conv.createdBy,
        participants: conv.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          role: p.user.role,
          avatarUrl: p.user.avatarUrl,
        })),
        messages,
        lastMessage: messages[messages.length - 1] ?? null,
        unreadCount: 0,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API/messages/conversations POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
