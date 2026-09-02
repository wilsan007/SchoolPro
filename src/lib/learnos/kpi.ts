/**
 * EcolPro / LEARNOS — Indicateurs par rôle
 * ========================================
 *
 * TROIS RÈGLES
 * ------------
 *
 * **1. Un indicateur qui n'appelle aucune action n'a pas sa place.** Le nombre
 * total d'élèves flatte un rapport annuel ; il ne dit à personne quoi faire
 * lundi matin. Chaque indicateur d'ici porte un seuil d'alerte, sans quoi il
 * n'est que décoratif.
 *
 * **2. Chaque rôle voit ce qui relève de sa prérogative.** La direction voit
 * des classes, l'enseignant voit des élèves. Le même chiffre affiché aux deux
 * ferait perdre son temps à l'un et manquer l'essentiel à l'autre.
 *
 * **3. Un chiffre seul ne dit rien.** « 62 % de couverture » n'a de sens qu'à
 * côté des 71 % du mois précédent — d'où l'historique (`KpiSnapshot`).
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import {
  siteFilterForModel,
  siteFilterForRelation,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { semaineScolaire } from "@/lib/learnos/planification";
import { anneeALaDate, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export type UniteKpi = "pourcentage" | "nombre";

export interface Kpi {
  /** Clé de traduction (learnos.kpi.*). */
  cle: string;
  valeur: number;
  unite: UniteKpi;
  /** Seuil au-delà (ou en deçà) duquel l'indicateur appelle une action. */
  seuilAlerte?: number;
  /** `true` quand le seuil est franchi dans le mauvais sens. */
  alerte: boolean;
  /**
   * Variation depuis la dernière photographie. `null` quand aucun historique
   * n'existe encore — surtout pas `0`, qui laisserait croire à une stabilité.
   */
  variation: number | null;
  /** Détail cliquable : vers quel écran aller pour agir. */
  lien?: string;
}

/** Sens de lecture : un indicateur bas est-il bon ou mauvais ? */
export type Sens = "hautEstBon" | "basEstBon";

export function construireKpi(
  cle: string,
  valeur: number,
  unite: UniteKpi,
  sens: Sens,
  seuilAlerte: number | undefined,
  precedent: number | undefined,
  lien?: string
): Kpi {
  const alerte =
    seuilAlerte === undefined
      ? false
      : sens === "hautEstBon"
        ? valeur < seuilAlerte
        : valeur > seuilAlerte;

  return {
    cle,
    valeur,
    unite,
    seuilAlerte,
    alerte,
    variation: precedent === undefined ? null : valeur - precedent,
    lien,
  };
}

/**
 * Dernière valeur connue de chaque indicateur, pour calculer la variation.
 *
 * Le périmètre doit être le MÊME que celui des valeurs courantes. Sans le
 * filtre de site, un directeur de site comparait sa valeur du jour à un
 * historique agrégé sur tous les sites : la variation affichée était fausse, et
 * son amplitude renseignait sur l'activité des autres sites.
 */
async function valeursPrecedentes(
  tenantId: string,
  claims: SessionSiteClaims,
  role: string,
  avant: Date
): Promise<Map<string, number>> {
  const snapshots = await prisma.kpiSnapshot.findMany({
    where: {
      tenantId,
      role,
      periode: { lt: avant },
      ...siteFilterForModel("kpiSnapshot", claims),
    },
    orderBy: { periode: "desc" },
    select: { kpiKey: true, valeur: true },
    take: 60,
  });
  // `findMany` rend le plus récent d'abord : la première occurrence gagne.
  const parCle = new Map<string, number>();
  for (const s of snapshots) if (!parCle.has(s.kpiKey)) parCle.set(s.kpiKey, s.valeur);
  return parCle;
}

/**
 * Indicateurs de la direction.
 *
 * Répondent aux questions qu'un chef d'établissement pose toute l'année sans
 * jamais obtenir de réponse : où en est le programme, qui décroche, qui n'a pas
 * saisi ses notes.
 */
export async function kpisDirection(
  tenantId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date(),
  anneeCourante?: string | null
): Promise<Kpi[]> {
  // Libellé de l'année courante (ex. « 2025-2026 ») — sert à filtrer les
  // classes, dont le champ `annee` est cette chaîne.
  const anneeLibelle = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  const precedents = await valeursPrecedentes(tenantId, claims, "DIRECTION", jourDe(maintenant));

  // Année active au sens chronologique : celle qui contient `maintenant`.
  // Pendant l'été, anneeALaDate retourne l'année isCurrent (à venir) pour
  // permettre la préparation de la rentrée. Mais les KPIs pédagogiques
  // (couverture, saisies en retard, élèves à risque) n'ont pas de sens
  // sur une année qui n'a pas commencé — on l'indique au calcul ci-dessous.
  const annee = await anneeALaDate(tenantId, maintenant);
  const anneeId = annee?.id;
  const fenetreDebut = annee?.dateDebut;
  const anneePasEncoreCommencee = annee ? annee.dateDebut > maintenant : false;

  const [planifs, evaluationsSansNotes, elevesARisque, plansActifs, plansEnRetard] =
    await Promise.all([
      anneeId
        ? prisma.planificationChapitre.findMany({
            where: {
              tenantId,
              anneeId,
              ...siteFilterForModel("planificationChapitre", claims),
            },
            select: { statut: true, semaineFin: true },
          })
        : Promise.resolve([]),

      // Une évaluation passée sans aucune note : la saisie n'a pas été faite.
      // Filtrée par la fenêtre de l'année active pour ne pas compter les
      // évaluations d'une année précédente qui n'aurait jamais été saisie.
      prisma.evaluation.count({
        where: {
          tenantId,
          date: {
            gte: fenetreDebut ?? new Date(0),
            lt: maintenant,
          },
          statut: { not: "ANNULE" },
          notes: { none: {} },
          ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
          ...siteFilterForRelation(claims, "classe"),
        },
      }),

      // Profil de décrochage : au moins une compétence critique bloquante.
      // Filtrée par la fenêtre de l'année pour ne pas cumuler les cohortes.
      prisma.recommandation.findMany({
        where: {
          tenantId,
          statut: "OBLIGATOIRE",
          resolueLe: null,
          createdAt: { gte: fenetreDebut ?? new Date(0) },
          ...(anneeLibelle ? { eleve: { classe: { annee: anneeLibelle } } } : {}),
          ...siteFilterForModel("recommandation", claims),
        },
        select: { eleveId: true },
        distinct: ["eleveId"],
      }),

      prisma.planProgression.count({
        where: {
          tenantId,
          statut: { in: ["PROPOSE", "ACTIF", "EN_REVUE"] },
          createdAt: { gte: fenetreDebut ?? new Date(0) },
          ...siteFilterForModel("planProgression", claims),
        },
      }),

      prisma.planProgression.count({
        where: {
          tenantId,
          statut: "EN_REVUE",
          createdAt: { gte: fenetreDebut ?? new Date(0) },
          ...siteFilterForModel("planProgression", claims),
        },
      }),
    ]);

  // Couverture : chapitres traités rapportés à ceux qui auraient dû l'être à
  // ce jour. Comparer au programme entier donnerait un chiffre bas toute
  // l'année et ne signalerait rien.
  // En période estivale (année pas encore commencée), il n'y a ni
  // planification ni enseignement : la couverture est N/A (0), pas 100%.
  const semaine = annee ? semaineScolaire(maintenant, annee.dateDebut) : 0;
  const dus = planifs.filter((p) => p.semaineFin <= semaine);
  const traites = dus.filter((p) => p.statut === "TRAITE").length;
  const couverture = anneePasEncoreCommencee
    ? 0  // Année pas encore commencée : N/A, pas 100%
    : dus.length > 0
      ? Math.round((traites / dus.length) * 100)
      : 100;  // Début d'année normal : aucun chapitre dû encore → 100%

  return [
    construireKpi("couvertureProgramme", couverture, "pourcentage", "hautEstBon", 80,
      precedents.get("couvertureProgramme"), "/curriculum"),
    construireKpi("saisiesEnRetard", evaluationsSansNotes, "nombre", "basEstBon", 0,
      precedents.get("saisiesEnRetard"), "/evaluations"),
    construireKpi("elevesARisque", elevesARisque.length, "nombre", "basEstBon", 0,
      precedents.get("elevesARisque"), "/recommandations"),
    construireKpi("plansActifs", plansActifs, "nombre", "hautEstBon", undefined,
      precedents.get("plansActifs"), "/recommandations"),
    construireKpi("plansEnRevue", plansEnRetard, "nombre", "basEstBon", 0,
      precedents.get("plansEnRevue"), "/recommandations"),
  ];
}

/**
 * Indicateurs de l'enseignant.
 *
 * Un enseignant n'a pas besoin de tableaux de bord : il a besoin de savoir ce
 * qu'il doit faire cette semaine. Chaque indicateur pointe donc vers un écran
 * où agir.
 */
export async function kpisEnseignant(
  tenantId: string,
  claims: SessionSiteClaims,
  userId: string,
  classeIds: string[] | null,
  maintenant: Date = new Date(),
  anneeCourante?: string | null
): Promise<Kpi[]> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  const precedents = await valeursPrecedentes(tenantId, claims, "ENSEIGNANT", jourDe(maintenant));
  const perimetre = classeIds ? { classeId: { in: classeIds } } : {};

  const [saisiesEnRetard, aTraiter, plansPortes] = await Promise.all([
    prisma.evaluation.count({
      where: {
        tenantId,
        date: { lt: maintenant },
        statut: { not: "ANNULE" },
        notes: { none: {} },
        ...(annee ? { classe: { annee: annee } } : {}),
        ...siteFilterForRelation(claims, "classe"),
        ...perimetre,
      },
    }),
    prisma.recommandation.count({
      where: {
        tenantId,
        resolueLe: null,
        statut: { in: ["OBLIGATOIRE", "RECOMMANDEE"] },
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("recommandation", claims),
        ...(classeIds ? { eleve: { classeId: { in: classeIds } } } : {}),
      },
    }),
    prisma.planProgression.count({
      where: {
        tenantId,
        statut: { in: ["ACTIF", "EN_REVUE"] },
        responsableUserId: userId,
        ...siteFilterForModel("planProgression", claims),
      },
    }),
  ]);

  return [
    construireKpi("mesSaisiesEnRetard", saisiesEnRetard, "nombre", "basEstBon", 0,
      precedents.get("mesSaisiesEnRetard"), "/evaluations"),
    construireKpi("aTraiterCetteSemaine", aTraiter, "nombre", "basEstBon", 0,
      precedents.get("aTraiterCetteSemaine"), "/recommandations"),
    construireKpi("mesParcours", plansPortes, "nombre", "hautEstBon", undefined,
      precedents.get("mesParcours"), "/recommandations"),
  ];
}

/** Ramène une date au jour, pour comparer des photographies quotidiennes. */
function jourDe(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Enregistre la photographie du jour.
 *
 * Idempotent : rejouer le même jour met à jour la valeur au lieu d'en empiler
 * une seconde. Appelé par le répartiteur de tâches planifiées.
 */
export async function enregistrerSnapshot(
  tenantId: string,
  role: string,
  kpis: Kpi[],
  siteId: string | null = null,
  maintenant: Date = new Date()
): Promise<void> {
  const periode = jourDe(maintenant);

  for (const kpi of kpis) {
    // L'historique est une commodité d'affichage : son échec ne doit pas
    // empêcher le calcul des indicateurs.
    try {
      const { count } = await prisma.kpiSnapshot.updateMany({
        where: { tenantId, siteId, role, kpiKey: kpi.cle, periode },
        data: { valeur: kpi.valeur },
      });
      if (count === 0) {
        await prisma.kpiSnapshot.create({
          data: { tenantId, siteId, role, kpiKey: kpi.cle, valeur: kpi.valeur, periode },
        });
      }
    } catch {
      // Ignoré volontairement : voir ci-dessus.
    }
  }
}
