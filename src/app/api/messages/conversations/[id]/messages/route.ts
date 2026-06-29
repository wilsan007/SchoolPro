import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const SendSchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { id } = await params;
    const userId = session.user.id;

    // Vérifier que l'utilisateur est participant
    const participation = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participation) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Marquer comme lu
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json(
      messages.map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        senderName: m.sender.name,
        createdAt: m.createdAt,
        readBy: m.readBy,
      }))
    );
  } catch (error) {
    console.error("[API/messages/conversations/:id/messages GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { id } = await params;
    const userId = session.user.id;

    const participation = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } },
    });
    if (!participation) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await req.json();
    const parsed = SendSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: userId,
        content: parsed.data.content,
        readBy: [userId],
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    // Mettre à jour updatedAt de la conversation
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    // Marquer comme lu pour l'expéditeur
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json(
      {
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        senderName: message.sender.name,
        createdAt: message.createdAt,
        readBy: message.readBy,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API/messages/conversations/:id/messages POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
