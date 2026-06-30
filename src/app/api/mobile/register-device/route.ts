import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const RegisterSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(["ios", "android", "web"]),
});

const PLATFORM_MAP = {
  ios: "IOS",
  android: "ANDROID",
  web: "WEB",
} as const;

/**
 * POST /api/mobile/register-device
 * Enregistre (ou réactive) le token push APNs/FCM de l'appareil de l'utilisateur connecté.
 * Appelé automatiquement par la coque native après acceptation des notifications.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const parsed = RegisterSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const { token, platform } = parsed.data;

  const device = await prisma.deviceToken.upsert({
    where: { token },
    create: {
      token,
      platform: PLATFORM_MAP[platform],
      userId: session.user.id,
      tenantId: session.user.tenantId,
      isActive: true,
    },
    update: {
      userId: session.user.id,
      tenantId: session.user.tenantId,
      isActive: true,
    },
  });

  return NextResponse.json({ success: true, deviceId: device.id });
}
