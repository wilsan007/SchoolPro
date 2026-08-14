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
import {
  canTarget,
  deriveConversationType,
  resolveAudience,
  MAX_AUDIENCE,
} from "@/lib/messaging-audience";
import { canAccessSite, mergeFilters, siteFilterForModel } from "@/lib/site-scope";
import type { ConversationType, ParticipantRole } from "@prisma/client";

const AudienceSchema = z.object({
  scope: z.union([
    z.object({ kind: z.literal("TENANT") }),
    z.object({ kind: z.literal("SITE"), id: z.string().min(1) }),
    z.object({ kind: z.literal("STRUCTURE"), id: z.string().min(1) }),
    z.object({ kind: z.literal("NIVEAU"), value: z.string().min(1) }),
    z.object({ kind: z.literal("CLASSE"), id: z.string().min(1) }),
  ]),
  group: z.enum(["ALL", "PARENTS", "ELEVES", "ENSEIGNANTS", "PERSONNEL", "DIRECTION"]),
});

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
  ]).optional(),
  classeId: z.string().optional(),
  readOnly: z.boolean().default(false),
  /**
   * Nouveau chemin de création : l'interface envoie une intention et une
   * audience, le type technique en est déduit. `type`/`classeId` restent
   * acceptés pour les clients existants (application mobile).
   */
  intent: z.enum(["MESSAGE", "ANNONCE", "GROUPE"]).optional(),
  audience: AudienceSchema.optional(),
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

    const { participantIds, subject, firstMessage, classeId, readOnly, intent, audience } = parsed.data;
    const userId = session.user.id;
    const tenantId = session.user.tenantId;

    const actor = {
      id: userId,
      tenantId,
      role: session.user.role,
      siteId: session.user.siteId ?? null,
      siteIds: session.user.siteIds ?? [],
      tenantHasSites: session.user.tenantHasSites,
    };

    // Le type technique est soit fourni directement (clients existants), soit
    // déduit de l'intention et de l'audience (nouvelle interface).
    const type: ConversationType =
      parsed.data.type ??
      deriveConversationType(intent ?? "MESSAGE", audience ?? null, participantIds?.length ?? 0);

    // Vérifier que le rôle de l'utilisateur permet de créer ce type
    const allowedTypes = getAllowedConversationTypes(session.user.role);
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: "Type de conversation non autorisé pour votre rôle" }, { status: 403 });
    }

    // Construire la liste des participants selon le type
    let participantsToCreate: { userId: string; role: ParticipantRole; lastReadAt: Date | null }[] = [];
    let resolvedClasseId: string | null = null;
    let resolvedSiteId: string | null = session.user.siteId ?? null;
    let resolvedSubject: string | null = subject ?? null;

    if (audience) {
      // --- Ciblage par audience ---
      if (!canTarget(session.user.role, audience)) {
        return NextResponse.json(
          { error: "Ce ciblage n'est pas autorisé pour votre rôle" },
          { status: 403 }
        );
      }

      const resolved = await resolveAudience(actor, audience);
      if (resolved.userIds.length === 0) {
        return NextResponse.json(
          { error: "Ce ciblage ne correspond à aucun destinataire joignable" },
          { status: 400 }
        );
      }
      if (resolved.truncated) {
        return NextResponse.json(
          { error: `Ciblage trop large (plus de ${MAX_AUDIENCE} personnes). Affinez la portée.` },
          { status: 400 }
        );
      }

      // Une annonce est descendante : les destinataires lisent, seul
      // l'émetteur écrit. Un groupe est conversationnel.
      const memberRole: ParticipantRole = intent === "ANNONCE" ? "READONLY" : "MEMBER";
      participantsToCreate = [
        { userId, role: "ADMIN", lastReadAt: new Date() },
        ...resolved.userIds.map((id) => ({
          userId: id,
          role: memberRole,
          lastReadAt: null,
        })),
      ];

      if (audience.scope.kind === "CLASSE") resolvedClasseId = audience.scope.id;
      if (audience.scope.kind === "SITE") resolvedSiteId = audience.scope.id;
      resolvedSubject = subject?.trim() || resolved.label;
    } else if (type === "CLASS_ANNOUNCEMENT" || type === "CLASS_DISCUSSION") {
      if (!classeId) {
        return NextResponse.json({ error: "classeId requis pour une conversation de classe" }, { status: 400 });
      }
      // Vérifier que la classe existe, appartient au tenant ET au périmètre
      // de site de l'émetteur. Le contrôle de site manquait : un personnel du
      // site A pouvait ouvrir une conversation sur une classe du site B en
      // connaissant son identifiant.
      const classe = await prisma.classe.findFirst({ where: { id: classeId, tenantId, ...siteFilterForModel("classe", actor) } });
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
      const tenantParticipants = await getTenantParticipants(actor, userId);
      participantsToCreate = tenantParticipants.map((p) => ({
        userId: p.userId,
        role: p.role,
        lastReadAt: p.userId === userId ? new Date() : null,
      }));
    } else if (type === "STAFF_GROUP") {
      // Personnel du périmètre de l'émetteur — et non du tenant entier, comme
      // le faisait la version précédente sans aucun filtre de site.
      const staffUsers = await prisma.user.findMany({
        where: mergeFilters(
          {
            tenantId,
            isActive: true,
            role: { in: ["TEACHER", "CLASS_TEACHER", "PRINCIPAL", "COUNSELOR", "TENANT_ADMIN", "SECRETARY", "ACCOUNTANT", "NURSE", "SUPER_ADMIN"] },
          },
          siteFilterForModel("user", actor)
        ),
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
        subject: resolvedSubject,
        isGroup,
        type: type as ConversationType,
        classeId: resolvedClasseId,
        siteId: resolvedSiteId,
        createdBy: userId,
        // Une annonce est en lecture seule par nature : l'interface n'a plus
        // à cocher une case pour obtenir le comportement attendu.
        readOnly: readOnly || intent === "ANNONCE",
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
