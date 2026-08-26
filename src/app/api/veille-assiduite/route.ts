import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import {
  siteFilterForModel,
  mergeFilters,
} from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Veille Assiduité Prédictive — surveillance dédiée de l'assiduité.
 *
 * Contrairement au score de risque de décrochage (qui combine cinq signaux dont
 * l'assiduité ne pèse que 25 %), cette route focalise UNIQUEMENT sur
 * l'assiduité et en détecte la dégradation avant qu'elle ne devienne visible.
 *
 * Par élève :
 *  - absences totales, injustifiées, retards sur la fenêtre courante ;
 *  - comparaison avec la fenêtre précédente (accélération ?) ;
 *  - taux d'absence (sur jours de classe réels, via `assiduite.ts`) ;
 *  - jour de semaine le plus manqué (pattern) ;
 *  - drapeau `veille` : vrai si l'absentéisme s'accélère (plus d'injustifiées
 *    sur la fenêtre courante que sur la précédente) OU si le taux dépasse un
 *    seuil critique.
 *
 * Par classe (synthèse) :
 *  - effectif, moyenne d'absences, élèves sous veille.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "absences:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId") ?? undefined;

  const tenantId = session.user.tenantId;
  const user = session.user;
  const maintenant = await getDemoNow();
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const anneeClasse = anneeCourante ? { classe: { annee: anneeCourante } } : {};
  const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};

  // Fenêtre courante : 30 derniers jours. Fenêtre précédente : 30-60 jours.
  const FENETRE = 30;
  const debutCourante = new Date(maintenant.getTime() - FENETRE * 86_400_000);
  const debutPrecedente = new Date(maintenant.getTime() - 2 * FENETRE * 86_400_000);

  // Élèves actifs du tenant/site (ou de la classe).
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...(classeId ? { classeId } : {}),
      ...siteFilterForModel("eleve", user),
      ...anneeClasse,
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      classeId: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  if (eleves.length === 0) {
    return NextResponse.json({ eleves: [], synthese: { total: 0, enVeille: 0, tauxMoyen: 0 } });
  }

  const eleveIds = eleves.map((e) => e.id);

  // Absences sur les deux fenêtres en un seul batch.
  const absences = await prisma.absence.findMany({
    where: {
      tenantId,
      eleveId: { in: eleveIds },
      date: { gte: debutPrecedente, lte: maintenant },
      ...siteFilterForModel("absence", user),
      ...anneeEleve,
    },
    select: {
      eleveId: true,
      date: true,
      isRetard: true,
      motif: true,
      statut: true,
    },
  });

  // Jours de classe dans la fenêtre courante — approximation simple : on
  // compte les jours ouvrés (lun-ven, hors week-end). Le module `assiduite.ts`
  // fait un calcul plus précis (déduction des vacances et jours fériés), mais
  // pour la veille on accepte cette approximation : ce qui compte est la
  // comparaison relative entre élèves, pas le taux absolu.
  const joursDeClasseCourante = compterJoursOuvres(debutCourante, maintenant);
  const joursDeClassePrecedente = compterJoursOuvres(debutPrecedente, debutCourante);

  // Agrégation par élève.
  const statsParEleve = new Map<
    string,
    {
      courante: { total: number; injustifiees: number; retards: number; parJour: number[] };
      precedente: { total: number; injustifiees: number; retards: number };
    }
  >();

  for (const a of absences) {
    const s = statsParEleve.get(a.eleveId) ?? {
      courante: { total: 0, injustifiees: 0, retards: 0, parJour: new Array(7).fill(0) },
      precedente: { total: 0, injustifiees: 0, retards: 0 },
    };
    if (a.date >= debutCourante) {
      s.courante.total++;
      if (a.motif === "INJUSTIFIE") s.courante.injustifiees++;
      if (a.isRetard) s.courante.retards++;
      s.courante.parJour[a.date.getDay()]++;
    } else {
      s.precedente.total++;
      if (a.motif === "INJUSTIFIE") s.precedente.injustifiees++;
      if (a.isRetard) s.precedente.retards++;
    }
    statsParEleve.set(a.eleveId, s);
  }

  // Seuil critique : 20 % d'absences injustifiées sur la fenêtre courante.
  const SEUIL_CRITIQUE = 0.2;

  const result = eleves.map((e) => {
    const s = statsParEleve.get(e.id);
    const courante = s?.courante ?? { total: 0, injustifiees: 0, retards: 0, parJour: new Array(7).fill(0) };
    const precedente = s?.precedente ?? { total: 0, injustifiees: 0, retards: 0 };

    const tauxCourant = joursDeClasseCourante > 0
      ? courante.total / joursDeClasseCourante
      : 0;
    const tauxPrecedent = joursDeClassePrecedente > 0
      ? precedente.total / joursDeClassePrecedente
      : 0;

    // Accélération : plus d'injustifiées sur la fenêtre courante que la
    // précédente. C'est le signal prédictif — l'absentéisme monte.
    const acceleration = courante.injustifiees > precedente.injustifiees;

    // Taux critique : au-dessus du seuil.
    const tauxCritique = tauxCourant >= SEUIL_CRITIQUE;

    // Drapeau de veille : accélération OU taux critique.
    const enVeille = acceleration || tauxCritique;

    // Jour de semaine le plus manqué (0=dim, 1=lun, …, 6=sam).
    let jourPire = -1;
    let jourPireCount = 0;
    for (let i = 0; i < 7; i++) {
      if (courante.parJour[i] > jourPireCount) {
        jourPireCount = courante.parJour[i];
        jourPire = i;
      }
    }

    return {
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      matricule: e.matricule,
      classeId: e.classeId,
      classeNom: e.classe?.nom ?? "—",
      niveau: e.classe?.niveau ?? "—",
      absencesCourantes: courante.total,
      absencesInjustifiees: courante.injustifiees,
      retards: courante.retards,
      absencesPrecedentes: precedente.total,
      injustifieesPrecedentes: precedente.injustifiees,
      tauxCourant: Math.round(tauxCourant * 1000) / 10, // 0-100, 1 décimale
      tauxPrecedent: Math.round(tauxPrecedent * 1000) / 10,
      acceleration,
      tauxCritique,
      enVeille,
      jourPire: jourPire >= 0 ? JOURS_NOMS[jourPire] : null,
      jourPireCount,
    };
  });

  // Trier : élèves en veille d'abord, puis par taux décroissant.
  result.sort((a, b) => {
    if (a.enVeille !== b.enVeille) return a.enVeille ? -1 : 1;
    return b.tauxCourant - a.tauxCourant;
  });

  const synthese = {
    total: result.length,
    enVeille: result.filter((r) => r.enVeille).length,
    enAcceleration: result.filter((r) => r.acceleration).length,
    enTauxCritique: result.filter((r) => r.tauxCritique).length,
    tauxMoyen: result.length > 0
      ? Math.round(result.reduce((s, r) => s + r.tauxCourant, 0) / result.length * 10) / 10
      : 0,
    absencesMoyennes: result.length > 0
      ? Math.round(result.reduce((s, r) => s + r.absencesCourantes, 0) / result.length * 10) / 10
      : 0,
    joursDeClasse: joursDeClasseCourante,
  };

  return NextResponse.json({ eleves: result, synthese });
}

/** Jours de la semaine en français pour l'affichage du pattern. */
const JOURS_NOMS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/** Compte les jours ouvrés (lun-ven) entre deux dates, bornes incluses. */
function compterJoursOuvres(debut: Date, fin: Date): number {
  let count = 0;
  const d = new Date(debut);
  while (d <= fin) {
    const jour = d.getDay();
    if (jour >= 1 && jour <= 5) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, count); // Évite la division par zéro.
}
