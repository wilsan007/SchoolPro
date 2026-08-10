import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPossibleRecipients } from "@/lib/messaging-scope";
import { checkPermission } from "@/lib/rbac";
import type { ConversationType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "messages:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") ?? "DIRECT") as ConversationType;
    const classeId = searchParams.get("classeId") ?? undefined;

    const recipients = await getPossibleRecipients(
      {
        id: session.user.id,
        tenantId: session.user.tenantId,
        role: session.user.role,
        siteId: session.user.siteId ?? null,
      },
      type,
      classeId
    );

    return NextResponse.json({ recipients });
  } catch (error) {
    console.error("[API/messages/recipients GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
