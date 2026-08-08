import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";


const CreateSchema = z.object({
  participantIds: z.array(z.string().min(1)).min(1).max(20),
  subject: z.string().max(200).optional(),
  firstMessage: z.string().min(1).max(5000),
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
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = conversations.map((conv) => {
      const lastMessage = conv.messages[0] ?? null;
      const myParticipation = conv.participants.find((p) => p.userId === userId);
      const unreadCount = lastMessage && !lastMessage.readBy.includes(userId) ? 1 : 0;

      return {
        id: conv.id,
        subject: conv.subject,
        isGroup: conv.isGroup,
        participants: conv.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          role: p.user.role,
          avatarUrl: p.user.avatarUrl,
        })),
        messages: [], // loaded on demand
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              senderId: lastMessage.senderId,
              senderName: "—",
              createdAt: lastMessage.createdAt,
              readBy: lastMessage.readBy,
            }
          : null,
        unreadCount,
      };
    });

    return NextResponse.json({ conversations: result });
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

    const { participantIds, subject, firstMessage } = parsed.data;
    const userId = session.user.id;
    const tenantId = session.user.tenantId;

    // Inclure l'expéditeur dans les participants
    const allParticipantIds = [...new Set([userId, ...participantIds])];

    const conv = await prisma.conversation.create({
      data: {
        tenantId,
        subject: subject ?? null,
        isGroup: allParticipantIds.length > 2,
        participants: {
          create: allParticipantIds.map((id) => ({
            userId: id,
            lastReadAt: id === userId ? new Date() : null,
          })),
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
        },
      },
    });

    const messages = conv.messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      senderName: session.user.name,
      createdAt: m.createdAt,
      readBy: m.readBy,
    }));

    return NextResponse.json(
      {
        id: conv.id,
        subject: conv.subject,
        isGroup: conv.isGroup,
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
