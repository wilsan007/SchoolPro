import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { attestationsOuvertes } from "@/lib/learnos/attestation";
import { eleveDeSeance } from "@/lib/learnos/entrainement";

/**
 * Attestations qu'un élève peut ouvrir maintenant.
 *
 * Ne renvoie que celles qu'un enseignant a **lancées** (`assigneeLe` non nul).
 * Une attestation seulement acceptée reste invisible : sans cela, la signature
 * du dimanche soir permettrait de la passer à la maison, et la preuve
 * « supervisée » qu'elle produit n'aurait plus de sens.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const eleveId = await eleveDeSeance(session.user.tenantId, session.user);
  if (!eleveId) return NextResponse.json({ attestations: [] });

  return NextResponse.json({
    attestations: await attestationsOuvertes(session.user.tenantId, eleveId, session.user),
  });
}
