import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { z } from "zod";
import { normaliserEmail } from "@/lib/email";
import { mobileSecret } from "@/lib/mobile-auth";

const MobileLoginSchema = z.object({
  email: z.string().email().transform(normaliserEmail),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
});

async function signToken(payload: Record<string, unknown>): Promise<string> {
  // Même secret que la vérification (src/lib/mobile-auth.ts) : en production,
  // pas de repli en dur — un secret par défaut public permettrait de forger
  // des jetons pour n'importe quel compte.
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(mobileSecret());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = MobileLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password, tenantSlug } = parsed.data;

    // Recherche insensible à la casse, comme sur le chemin web : un compte
    // enregistré avec une majuscule doit rester joignable. `findUnique`
    // n'accepte pas `mode: "insensitive"`, d'où `findFirst`.
    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- endpoint d'authentification mobile : lookup par email/password, pas de session utilisateur disponible
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        tenantId: true,
        avatarUrl: true,
        isActive: true,
        tenant: {
          select: { id: true, name: true, slug: true, currentYear: true, notationMax: true },
        },
      },
    });

    if (!user || !user.password || !user.isActive) {
      return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
    }

    const tenant = user.tenant;
    if (tenantSlug && tenant?.slug !== tenantSlug) {
      return NextResponse.json({ error: "Cet compte n'appartient pas à cet établissement" }, { status: 403 });
    }

    // eslint-disable-next-line ecolpro/require-tenant-id -- self-update après authentification réussie : user.id provient du findUnique ci-dessus, pas d'entrée utilisateur
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            currentYear: tenant.currentYear,
            notationMax: tenant.notationMax,
          }
        : null,
    });
  } catch (error) {
    console.error("[API/auth/mobile]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
