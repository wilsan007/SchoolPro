import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel, mergeFilters } from "@/lib/site-filter";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
  }
  const { limit } = parsed.data;

  const participantRows = await prisma.conversationParticipant.findMany({
    where: { userId: user.id },
    select: { conversationId: true },
  });

  const conversationIds = participantRows.map((p) => p.conversationId);
  if (conversationIds.length === 0) {
    return NextResponse.json({ conversations: [], nonLus: 0 });
  }

  const siteFilter = siteFilterForModel("conversation", user);

  const conversations = await prisma.conversation.findMany({
    where: mergeFilters(
      {
        id: { in: conversationIds },
        tenantId: user.tenantId,
      },
      siteFilter
    ),
    select: {
      id: true,
      subject: true,
      isGroup: true,
      type: true,
      classeId: true,
      readOnly: true,
      pinned: true,
      updatedAt: true,
      participants: {
        select: {
          userId: true,
          role: true,
          lastReadAt: true,
          user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        },
      },
      classe: { select: { id: true, nom: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          senderId: true,
          content: true,
          readBy: true,
          createdAt: true,
          sender: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  const conversationsWithUnread = conversations.map((c) => {
    const myParticipation = c.participants.find((p) => p.userId === user.id);
    const lastReadAt = myParticipation?.lastReadAt;
    const lastMessage = c.messages[0] ?? null;

    const unreadCount = lastMessage && lastMessage.senderId !== user.id && !lastMessage.readBy.includes(user.id) ? 1 : 0;

    return {
      id: c.id,
      titre: c.subject,
      type: c.type,
      isGroup: c.isGroup,
      readOnly: c.readOnly,
      pinned: c.pinned,
      classeNom: c.classe?.nom ?? null,
      updatedAt: c.updatedAt,
      participants: c.participants.map((p) => ({
        id: p.user.id,
        name: p.user.name,
        email: p.user.email,
        role: p.user.role,
        avatarUrl: p.user.avatarUrl,
        participantRole: p.role,
      })),
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            senderId: lastMessage.senderId,
            senderName: lastMessage.sender.name,
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
          }
        : null,
      unreadCount,
    };
  });

  const nonLus = conversationsWithUnread.reduce((acc, c) => acc + c.unreadCount, 0);

  return NextResponse.json({ conversations: conversationsWithUnread, nonLus });
}
