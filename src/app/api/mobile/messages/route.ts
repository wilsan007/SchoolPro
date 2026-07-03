import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");

  const participantRows = await prisma.conversationParticipant.findMany({
    where: { userId: user.id },
    select: { conversationId: true },
  });

  const conversationIds = participantRows.map((p) => p.conversationId);
  if (conversationIds.length === 0) {
    return NextResponse.json({ conversations: [], nonLus: 0 });
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      id: { in: conversationIds },
      tenantId: user.tenantId,
    },
    select: {
      id: true,
      subject: true,
      isGroup: true,
      updatedAt: true,
      participants: {
        select: {
          userId: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  const conversationsWithMessages = await Promise.all(
    conversations.map(async (c) => {
      const [messages, messageCount] = await Promise.all([
        prisma.message.findMany({
          where: { conversationId: c.id },
          select: {
            id: true,
            senderId: true,
            content: true,
            readBy: true,
            createdAt: true,
            sender: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        }),
        prisma.message.count({ where: { conversationId: c.id } }),
      ]);

      return {
        id: c.id,
        titre: c.subject,
        type: c.isGroup ? "group" : "direct",
        updatedAt: c.updatedAt,
        participants: c.participants ?? [],
        messages: messages ?? [],
        _count: { messages: messageCount },
      };
    })
  );

  const nonLus = conversationsWithMessages.reduce((acc, c) => {
    const lastMsg = c.messages[0];
    if (lastMsg && lastMsg.senderId !== user.id && !(lastMsg.readBy ?? []).includes(user.id)) {
      return acc + 1;
    }
    return acc;
  }, 0);

  return NextResponse.json({ conversations: conversationsWithMessages, nonLus });
}
