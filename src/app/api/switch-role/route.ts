import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { deriveClaims } from "@/lib/tenant-claims";
import { auditFire } from "@/lib/audit";
import { erreurJson } from "@/lib/erreurs-api";

const BodySchema = z.object({
  mode: z.enum(["WORK", "PARENT"]),
});

/**
 * POST /api/switch-role — bascule entre le mode Travail et le mode Parent.
 *
 * Un utilisateur qui est à la fois enseignant et parent dans le même
 * établissement peut changer de contexte sans se déconnecter. La route
 * vérifie que l'utilisateur possède l' enregistrement métier correspondant
 * (un `Parent` pour le mode PARENT, un `Enseignant` pour le mode WORK) dans
 * le tenant actif, puis met à jour le rôle porté par `UserTenant` pour ce
 * tenant et rafraîchit la session.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return erreurJson("NON_AUTORISE");
    }

    let parsed;
    try {
      parsed = BodySchema.safeParse(await req.json());
    } catch {
      return erreurJson("DONNEES_INVALIDES");
    }
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES");
    }

    const { mode } = parsed.data;
    const userId = session.user.id;
    const tenantId = session.user.tenantId;

    if (!tenantId) {
      return erreurJson("ADHESION_INTROUVABLE");
    }

    // Vérifier que l'utilisateur a une adhésion active à ce tenant.
    const userTenant = await prisma.userTenant.findFirst({
      where: { userId, tenantId, isActive: true },
      select: { id: true, role: true },
    });

    if (!userTenant) {
      auditFire({
        userId,
        tenantId,
        action: "switch-role",
        verdict: "DENIED",
        resource: "role",
        reason: "Aucune adhésion active à ce tenant",
      });
      return erreurJson("ADHESION_INTROUVABLE");
    }

    // Déterminer le rôle cible et vérifier que l'utilisateur possède
    // l'enregistrement métier correspondant dans ce tenant.
    let targetRole: Role;
    if (mode === "PARENT") {
      // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, vérification d'existence du Parent
      const parent = await prisma.parent.findFirst({
        where: { userId, tenantId },
        select: { id: true },
      });
      if (!parent) {
        auditFire({
          userId,
          tenantId,
          action: "switch-role",
          verdict: "DENIED",
          resource: "role",
          reason: "Aucun enregistrement Parent pour ce tenant",
        });
        return erreurJson("ADHESION_INTROUVABLE");
      }
      targetRole = "PARENT";
    } else {
      // Mode WORK : l'utilisateur doit avoir un enregistrement Enseignant
      // (ou être un membre du personnel). On conserve le rôle de travail
      // d'origine s'il existe, sinon on utilise TEACHER par défaut.
      // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, vérification d'existence de l'Enseignant
      const enseignant = await prisma.enseignant.findFirst({
        where: { userId, tenantId },
        select: { id: true },
      });
      if (!enseignant) {
        // Si l'utilisateur n'est pas enseignant mais a un rôle de personnel
        // (secrétaire, comptable, etc.), on accepte le mode WORK avec le
        // rôle actuel s'il n'est pas PARENT/STUDENT.
        const currentRole = userTenant.role;
        if (currentRole === "PARENT" || currentRole === "STUDENT") {
          auditFire({
            userId,
            tenantId,
            action: "switch-role",
            verdict: "DENIED",
            resource: "role",
            reason: "Aucun enregistrement Enseignant ni rôle de personnel",
          });
          return erreurJson("ADHESION_INTROUVABLE");
        }
        targetRole = currentRole;
      } else {
        // Conserver le rôle de travail existant s'il n'est pas PARENT/STUDENT,
        // sinon utiliser TEACHER.
        const currentRole = userTenant.role;
        targetRole =
          currentRole === "PARENT" || currentRole === "STUDENT"
            ? "TEACHER"
            : currentRole;
      }
    }

    // Mettre à jour le rôle dans UserTenant.
    await prisma.userTenant.update({
      where: { id: userTenant.id },
      data: { role: targetRole },
    });

    // Mettre à jour le rôle global de l'utilisateur pour cohérence.
    // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
    await prisma.user.update({
      where: { id: userId },
      data: { role: targetRole },
    });

    // Régénérer le JWT : le callback `jwt` relit le périmètre complet
    // depuis la base.
    await unstable_update({ user: { tenantId } } as never);

    const claims = await deriveClaims(userId, tenantId);
    if (!claims) {
      auditFire({
        userId,
        tenantId,
        action: "switch-role",
        verdict: "DENIED",
        reason: "deriveClaims a retourné null après bascule",
      });
      return erreurJson("UTILISATEUR_INTROUVABLE");
    }

    auditFire({
      userId,
      tenantId,
      action: "switch-role",
      verdict: "ALLOWED",
      resource: "role",
      reason: `Bascule vers ${mode} (${targetRole})`,
    });

    return NextResponse.json({
      success: true,
      activeRole: claims.role,
    });
  } catch (error) {
    console.error("Erreur switch role:", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
