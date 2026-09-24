import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { corpsErreur, erreurJson, statutErreur } from "@/lib/erreurs-api";
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
    // 429 + `Retry-After` : le code remplace la chaîne figée `rate_limited`,
    // que le client devait reconnaître mot pour mot pour la traduire.
    return NextResponse.json(corpsErreur("TROP_DE_TENTATIVES"), {
      status: statutErreur("TROP_DE_TENTATIVES"),
      headers: { "Retry-After": "60" },
    });
  }

  const raw = await req.json().catch((e) => { console.warn("[non-fatal]", e); return null; });
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");

  const { action, token, code } = parsed.data;

  try {
    switch (action) {
      case "setup": {
        try {
          const result = await setup2FA(session.user.id);
          return Response.json(result);
        } catch (e) {
          // « Déjà active » n'est pas une panne serveur mais un état métier :
          // code dédié (409), que le client traduit dans la langue active.
          // Le message du service est le seul discriminant disponible ; il est
          // figé par `src/lib/two-factor.test.ts`.
          const message = e instanceof Error ? e.message : "";
          if (message.includes("déjà active")) {
            return erreurJson("DEUX_FACTEURS_DEJA_ACTIF");
          }
          throw e;
        }
      }

      case "verify": {
        if (!token) return erreurJson("DONNEES_INVALIDES");
        const success = await verify2FA(session.user.id, token);
        if (!success) return erreurJson("TOTP_INVALIDE");
        return Response.json({ success: true });
      }

      case "backup": {
        if (!code) return erreurJson("DONNEES_INVALIDES");
        const success = await verifyBackupCode(session.user.id, code);
        if (!success) return erreurJson("CODE_SECOURS_INVALIDE");
        return Response.json({ success: true });
      }

      case "disable": {
        // Un rôle sensible ne peut pas retirer sa propre protection. Le
        // contrôle est ICI et pas seulement dans l'interface : masquer un
        // bouton n'empêche personne d'appeler l'API directement.
        if (deuxFacteursObligatoire(session.user.role)) {
          return erreurJson("DEUX_FACTEURS_OBLIGATOIRE");
        }

        // Un code valide est exigé : sinon, une session volée suffirait à
        // retirer la protection, ce qui la viderait de son sens.
        if (!token) return erreurJson("DONNEES_INVALIDES");
        // `verifierCodeConnexion` et non `verify2FA` : cette dernière ACTIVE
        // le 2FA en cas de succès — l'appeler ici revenait à l'activer juste
        // avant de le désactiver.
        const success = await verifierCodeConnexion(session.user.id, token);
        if (!success) return erreurJson("TOTP_INVALIDE");
        await disable2FA(session.user.id);
        return Response.json({ success: true });
      }

      default:
        return erreurJson("DONNEES_INVALIDES");
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "";

    // La clé de chiffrement des secrets TOTP n'est pas configurée : sans elle,
    // aucune configuration n'est possible. Le message brut
    // (« TWO_FACTOR_SECRET manquant… ») ne dit pas quoi faire ; celui-ci, si.
    if (message.includes("TWO_FACTOR_SECRET")) {
      console.error("[2fa] configuration serveur incomplète :", message);
      return erreurJson("DEUX_FACTEURS_NON_CONFIGURE");
    }

    // `detail` reste dans le corps pour le diagnostic (journaux, support) ;
    // il n'est plus affiché tel quel : l'interface traduit le code.
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: message || undefined,
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
    return NextResponse.json(corpsErreur("TROP_DE_TENTATIVES"), {
      status: statutErreur("TROP_DE_TENTATIVES"),
      headers: { "Retry-After": "60" },
    });
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
