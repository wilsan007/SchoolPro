import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, eleveScopeFilter, mergeFilters } from "@/lib/site-scope";
import { chapitresAVenir, exigencesDepuisProgramme } from "@/lib/learnos/planification";
import { anneeActive } from "@/lib/annee-scolaire";
import { getDemoDate } from "@/lib/demo-now";
import { recalculerProfils, fusionnerProfil } from "@/lib/learnos/profile-recompute";
import {
  recommandationsPourProfils,
  chargerBareme,
  chargerGraphePrerequis,
} from "@/lib/learnos/recommandations-a-la-date";

/**
 * Profil de compétences d'un élève (LEARNOS).
 *
 * Renvoie, par compétence, l'état estimé **et** la fiabilité de cette
 * estimation. Les deux sont transmis séparément : l'interface doit pouvoir
 * dire « nous n'en savons pas assez » plutôt que d'afficher un chiffre
 * auquel personne ne devrait se fier.
 *
 * TIME MACHINE
 * ------------
 * Les profils stockés (`StudentLearningProfile`) sont des états CUMULATIFS
 * (moyenne des 5 preuves de l'année). En démo, afficher l'état final en
 * octobre trahit le bilan de fin d'année. On recale donc les champs
 * temporels (`masteryScore`, `evidenceCount`, `lastEvidenceAt`, `trend`,
 * `masteryStatus`) à partir des preuves filtrées par `occurredAt <= demoDate`.
 * L'horizon démo filtre automatiquement les `LearningEvidence` ; nous
 * récupérons ces preuves filtrées et recalculons l'agrégat ici.
 *
 * Les recommandations stockées décrivent elles aussi l'état final : elles sont
 * rejouées sur les profils recalculés, faute de quoi une compétence affichée
 * « À reprendre » n'aurait aucune action en regard.
 *
 * PERMISSION
 * ----------
 * Les familles n'ont pas `eleves:read` (l'annuaire leur est fermé), mais les
 * pages `/eleve` et `/parent` affichent ce profil : elles passent par
 * `entrainement:read`, comme la route `evolution` voisine. Le périmètre
 * personnel (`eleveScopeFilter`) reste la vraie barrière — un parent ne lit
 * que ses enfants, un élève que son propre dossier.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const famille = session.user.role === "PARENT" || session.user.role === "STUDENT";
  const denied = await checkPermission(
    session.user.role,
    famille ? "entrainement:read" : "eleves:read"
  );
  if (denied) return denied;
  const { id: eleveId } = await params;
  const tenantId = session.user.tenantId;

  // Double contrôle : périmètre de site ET périmètre personnel — un parent ne
  // doit voir que ses enfants, un élève que son propre dossier.
  // Les lectures sont groupées en vagues parallèles : sur un pooler distant,
  // chaque aller-retour coûte de l'ordre de la seconde, et les enchaîner un à
  // un faisait attendre la fiche bien au-delà de ce que le calcul demande.
  const [eleve, annee, demoDate] = await Promise.all([
    prisma.eleve.findFirst({
      where: mergeFilters(
        { id: eleveId, tenantId },
        siteFilterForModel("eleve", session.user),
        eleveScopeFilter(session.user, null)
      ),
      select: {
        id: true,
        nom: true,
        prenom: true,
        classe: { select: { id: true, niveau: true } },
      },
    }),
    anneeActive(tenantId),
    getDemoDate(),
  ]);
  // Aucune donnée d'élève n'est lue avant ce contrôle.
  if (!eleve) {
    return erreurJson("ELEVE_INTROUVABLE");
  }
  const anneeCourante = annee?.libelle ?? null;
  const demoNow = demoDate ?? new Date();

  // Sous date simulée, presque toutes les recommandations sont à reformuler :
  // le graphe de prérequis part donc avec la vague, au lieu d'attendre qu'elle
  // revienne. Hors date simulée il est rarement utile, et n'est lu qu'au besoin.
  const graphe = demoDate ? chargerGraphePrerequis(tenantId) : undefined;
  // Une promesse lancée en avance ne doit pas devenir un rejet non géré si une
  // autre lecture de la vague échoue avant qu'on l'attende.
  graphe?.catch(() => {});

  const [profilsStockes, recommandationsStockees, evidencesFiltrees, programme, bareme] = await Promise.all([
    prisma.studentLearningProfile.findMany({
      where: {
        tenantId,
        eleveId,
        ...siteFilterForModel("studentLearningProfile", session.user),
      },
      select: {
        competenceId: true,
        masteryScore: true,
        confidenceScore: true,
        masteryStatus: true,
        evidenceCount: true,
        lastEvidenceAt: true,
        trend: true,
        prerequisiteStatus: true,
        competence: {
          select: {
            code: true,
            libelle: true,
            chapitre: {
              select: {
                nom: true,
                niveau: true,
                matiere: { select: { id: true, nom: true, couleur: true } },
              },
            },
          },
        },
      },
    }),
    prisma.recommandation.findMany({
      where: {
        tenantId,
        eleveId,
        resolueLe: null,
        ...siteFilterForModel("recommandation", session.user),
        ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      },
      select: {
        id: true,
        competenceId: true,
        niveau: true,
        statut: true,
        motif: true,
        actionProposee: true,
        regleDeclenchee: true,
        motifParams: true,
        competencesBloquees: true,
      },
    }),
    // Preuves filtrées par l'horizon démo (occurredAt <= demoDate).
    // Utilisées pour recalculer les champs temporels des profils.
    prisma.learningEvidence.findMany({
      where: {
        tenantId,
        eleveId,
        competenceId: { not: null },
        occurredAt: { lte: demoNow },
        ...siteFilterForModel("learningEvidence", session.user),
      },
      select: {
        competenceId: true,
        masterySignal: true,
        occurredAt: true,
      },
    }),
    // Ce qui arrive : le programme des prochaines semaines pour sa classe.
    eleve.classe && annee
      ? chapitresAVenir(tenantId, session.user, eleve.classe, annee, demoNow)
      : null,
    chargerBareme(tenantId),
  ]);

  // Recalculer les profils à partir des preuves filtrées par la date simulée.
  const evidencesPourRecalcul = evidencesFiltrees
    .filter((e) => e.competenceId !== null)
    .map((e) => ({ competenceId: e.competenceId!, masterySignal: e.masterySignal, occurredAt: e.occurredAt }));
  const profilsRecalcules = recalculerProfils(evidencesPourRecalcul);
  const profils = profilsStockes.map((p) =>
    fusionnerProfil(p, profilsRecalcules.get(p.competenceId))
  );

  const recommandations = await recommandationsPourProfils(
    tenantId,
    profils,
    recommandationsStockees,
    bareme,
    graphe
  );

  // Relie le programme au profil individuel — avec les profils affichés, pour
  // que « ce qui arrive » ne contredise pas le détail par compétence.
  const aVenir = programme ? exigencesDepuisProgramme(programme, profils) : [];
  return NextResponse.json({
    eleve: { id: eleve.id, nom: eleve.nom, prenom: eleve.prenom },
    profils,
    recommandations,
    aVenir,
  });
}
