import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accepterInvitation, infoInvitation } from "@/lib/invitations-server";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

/**
 * Invitation d'utilisateur — routes PUBLIQUES (aucune session).
 * ============================================================
 * Le destinataire n'a pas encore de compte : il n'existe donc aucun contexte de
 * tenant. Le jeton est la seule preuve d'accès (haché en base, usage unique,
 * expiration) et l'accès à la base passe par `withSystemContext` dans
 * `@/lib/invitations-server`.
 *
 * GET  /api/auth/invitation?token=…   → informations affichables (email masqué)
 * POST /api/auth/invitation           → { token, password } : crée le compte
 *
 * Les deux sont limités en débit par IP : sans cela, ces routes offriraient un
 * oracle d'énumération de jetons (et la création de comptes qui va avec).
 */

const BodySchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(1).max(200),
});

/** Réponses de refus, traduisibles côté page (codes stables). */
function messagePourRaison(raison: string): string {
  switch (raison) {
    case "JETON_INCONNU":
      return "jeton_inconnu";
    case "EXPIREE":
      return "invitation_expiree";
    case "DEJA_ACCEPTEE":
      return "invitation_deja_acceptee";
    case "REVOQUEE":
      return "invitation_revoquee";
    case "EMAIL_DEJA_UTILISE":
      return "email_deja_utilise";
    case "MOT_DE_PASSE_FAIBLE":
      return "mot_de_passe_faible";
    default:
      return "erreur_inconnue";
  }
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = rateLimit({ max: 20, windowSec: 900, key: `invitation-info:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ success: false, error: "token_manquant" }, { status: 400 });
  }

  const info = await infoInvitation(token);
  if (!info) {
    return NextResponse.json({ success: false, error: "jeton_inconnu" }, { status: 404 });
  }

  return NextResponse.json({ success: true, ...info });
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  // Plus serré que le GET : chaque tentative consomme un hachage bcrypt côté
  // serveur, et il s'agit d'une création de compte.
  const rl = rateLimit({ max: 10, windowSec: 900, key: `invitation-accept:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  const body = await req.json().catch((e) => {
    console.warn("[non-fatal]", e);
    return null;
  });
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "donnees_invalides" }, { status: 400 });
  }

  const resultat = await accepterInvitation(parsed.data.token, parsed.data.password);

  if (!resultat.ok) {
    return NextResponse.json(
      { success: false, error: messagePourRaison(resultat.raison), erreurs: resultat.erreurs },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, email: resultat.email });
}