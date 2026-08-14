import { NextRequest, NextResponse } from "next/server";
import { drainEvents } from "@/lib/learnos/event-bus";

/**
 * Drainage de la boîte d'envoi LEARNOS.
 *
 * L'ERP publie ses faits de façon synchrone et brève (une ligne en base) ;
 * c'est ici qu'ils sont réellement traités — analyses potentiellement longues,
 * appels de modèles. Découpler les deux est ce qui garantit qu'une saisie de
 * notes n'attend jamais LEARNOS (spécification §49-1).
 *
 * Protégé par CRON_SECRET, comme les autres tâches planifiées.
 *
 *   GET /api/cron/learnos-events
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Paramètre optionnel `?limit=` (défaut 50, plafonné à 500) : un lot trop
 * grand dépasserait la durée maximale d'exécution d'une fonction Vercel.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demande = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(demande) && demande > 0 ? Math.min(demande, 500) : 50;

  // `drainEvents` ne lève pas : un événement fautif est comptabilisé puis
  // retenté au passage suivant, sans interrompre le traitement des autres.
  const resultat = await drainEvents(limit);

  return NextResponse.json({ success: true, ...resultat });
}
