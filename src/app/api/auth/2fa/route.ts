import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { erreurJson } from "@/lib/erreurs-api";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import {
  setup2FA,
  verify2FA,
  disable2FA,
  verifyBackupCode,
  verifierCodeConnexion,
} from "@/lib/two-factor";
import { deuxFacteursObligatoire } from "@/lib/two-factor-policy";

const BodySchema = z.object({
  action: z.enum(["setup", "verify", "disable", "backup"]),
  token: z.string().optional(),
  code: z.string().optional(),
});

/**
 * POST /api/auth/2fa
 * Démarre la configuration du 2FA (génère secret + QR code).
 * Body: { action: "setup" | "verify" | "disable" | "backup", token?, code? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return erreurJson("NON_AUTORISE");

  // ─── Rate limiting : 30 requêtes / min / utilisateur ────────────────────
  const ip = getClientIP(req);
  const rl = rateLimit({
    max: 30,
    windowSec: 60,
    key: `2fa:${session.user.id}:${ip}`,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");

  const { action, token, code } = parsed.data;

  try {
    switch (action) {
      case "setup": {
        const result = await setup2FA(session.user.id);
        return Response.json(result);
      }

      case "verify": {
        if (!token) return erreurJson("DONNEES_INVALIDES");
        const success = await verify2FA(session.user.id, token);
        if (!success) {
          return erreurJson("STATUT_INVALIDE", undefined, {
            detail: "Code TOTP invalide",
          });
        }
        return Response.json({ success: true });
      }

      case "backup": {
        if (!code) return erreurJson("DONNEES_INVALIDES");
        const success = await verifyBackupCode(session.user.id, code);
        if (!success) {
          return erreurJson("STATUT_INVALIDE", undefined, {
            detail: "Code de secours invalide",
          });
        }
        return Response.json({ success: true });
      }

      case "disable": {
        // Un rôle sensible ne peut pas retirer sa propre protection. Le
        // contrôle est ICI et pas seulement dans l'interface : masquer un
        // bouton n'empêche personne d'appeler l'API directement.
        if (deuxFacteursObligatoire(session.user.role)) {
          return erreurJson("STATUT_INVALIDE", undefined, {
            detail:
              "La double authentification est obligatoire pour ce rôle et ne peut pas être désactivée.",
          });
        }

        // Un code valide est exigé : sinon, une session volée suffirait à
        // retirer la protection, ce qui la viderait de son sens.
        if (!token) return erreurJson("DONNEES_INVALIDES");
        // `verifierCodeConnexion` et non `verify2FA` : cette dernière ACTIVE
        // le 2FA en cas de succès — l'appeler ici revenait à l'activer juste
        // avant de le désactiver.
        const success = await verifierCodeConnexion(session.user.id, token);
        if (!success) {
          return erreurJson("STATUT_INVALIDE", undefined, {
            detail: "Code TOTP invalide",
          });
        }
        await disable2FA(session.user.id);
        return Response.json({ success: true });
      }

      default:
        return erreurJson("DONNEES_INVALIDES");
    }
  } catch (e) {
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}

/**
 * GET /api/auth/2fa
 * Retourne le statut 2FA de l'utilisateur courant.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return erreurJson("NON_AUTORISE");

  // ─── Rate limiting : 30 requêtes / min / utilisateur ────────────────────
  const ip = getClientIP(req);
  const rl = rateLimit({
    max: 30,
    windowSec: 60,
    key: `2fa:${session.user.id}:${ip}`,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Importer prisma ici pour éviter de l'importer au niveau du module
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findFirstOrThrow({
    where: {
      id: session.user.id,
      tenantId: session.user.tenantId ?? null,
    },
    select: {
      twoFactorEnabled: true,
      twoFactorVerifiedAt: true,
    },
  });

  return Response.json(user);
}
