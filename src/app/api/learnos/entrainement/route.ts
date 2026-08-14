import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { getAnneeCourante } from "@/lib/annee-scolaire";
import { eleveDeSeance, ouvrirSeance } from "@/lib/learnos/entrainement";

/**
 * Ouvre une séance d'entraînement autonome (LEARNOS).
 *
 * Reprend la feuille en cours s'il y en a une, en compose une sinon. Le choix
 * des compétences est entièrement déterministe (cf. `exercice-selector`) :
 * aucun modèle n'est appelé ici, ni à l'ouverture ni pendant la séance.
 *
 * Un `204` n'est pas une erreur : il dit qu'il n'y a rien à travailler
 * maintenant — bande consolidée, ou banque vide sur les compétences visées.
 * Fabriquer des exercices pour ne pas rendre une réponse vide ferait perdre à
 * l'élève le temps que le dispositif est censé lui faire gagner.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "entrainement:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const body = (await req.json().catch(() => ({}))) as {
    eleveId?: string;
    matiereId?: string | null;
    nombre?: number;
  };

  const eleveId = await eleveDeSeance(tenantId, session.user, body.eleveId);
  if (!eleveId) {
    return erreurJson("ELEVE_INTROUVABLE");
  }

  const annee = await getAnneeCourante(tenantId);
  if (!annee) {
    return erreurJson("AUCUNE_ANNEE_COURANTE");
  }

  const seance = await ouvrirSeance(tenantId, eleveId, session.user, {
    anneeId: annee.id,
    matiereId: body.matiereId ?? null,
    // Cinq exercices : assez pour mesurer plusieurs compétences, assez court
    // pour être terminé en une fois. Une feuille abandonnée au milieu ne
    // produit aucune preuve.
    nombre: Math.min(Math.max(body.nombre ?? 5, 1), 10),
  });

  if (!seance) return new NextResponse(null, { status: 204 });

  return NextResponse.json(seance);
}
