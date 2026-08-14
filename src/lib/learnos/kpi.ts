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

/** Dernière valeur connue de chaque indicateur, pour calculer la variation. */
async function valeursPrecedentes(
  tenantId: string,
  role: string,
  avant: Date
): Promise<Map<string, number>> {
  const snapshots = await prisma.kpiSnapshot.findMany({
    where: { tenantId, role, periode: { lt: avant } },
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
  maintenant: Date = new Date()
): Promise<Kpi[]> {
  const precedents = await valeursPrecedentes(tenantId, "DIRECTION", jourDe(maintenant));

  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true, dateDebut: true },
  });

  const [planifs, evaluationsSansNotes, elevesARisque, plansActifs, plansEnRetard] =
    await Promise.all([
      annee
        ? prisma.planificationChapitre.findMany({
            where: {
              tenantId,
              anneeId: annee.id,
              ...siteFilterForModel("planificationChapitre", claims),
            },
            select: { statut: true, semaineFin: true },
          })
        : Promise.resolve([]),

      // Une évaluation passée sans aucune note : la saisie n'a pas été faite.
      prisma.evaluation.count({
        where: {
          tenantId,
          date: { lt: maintenant },
          statut: { not: "ANNULE" },
          notes: { none: {} },
          ...siteFilterForRelation(claims, "classe"),
        },
      }),

      // Profil de décrochage : au moins une compétence critique bloquante.
      prisma.recommandation.findMany({
        where: {
          tenantId,
          statut: "OBLIGATOIRE",
          resolueLe: null,
          ...siteFilterForModel("recommandation", claims),
        },
        select: { eleveId: true },
        distinct: ["eleveId"],
      }),

      prisma.planProgression.count({
        where: {
          tenantId,
          statut: { in: ["PROPOSE", "ACTIF", "EN_REVUE"] },
          ...siteFilterForModel("planProgression", claims),
        },
      }),

      prisma.planProgression.count({
        where: {
          tenantId,
          statut: "EN_REVUE",
          ...siteFilterForModel("planProgression", claims),
        },
      }),
    ]);

  // Couverture : chapitres traités rapportés à ceux qui auraient dû l'être à
  // ce jour. Comparer au programme entier donnerait un chiffre bas toute
  // l'année et ne signalerait rien.
  const semaine = annee ? semaineScolaire(maintenant, annee.dateDebut) : 0;
  const dus = planifs.filter((p) => p.semaineFin <= semaine);
  const traites = dus.filter((p) => p.statut === "TRAITE").length;
  const couverture = dus.length > 0 ? Math.round((traites / dus.length) * 100) : 100;

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
  maintenant: Date = new Date()
): Promise<Kpi[]> {
  const precedents = await valeursPrecedentes(tenantId, "ENSEIGNANT", jourDe(maintenant));
  const perimetre = classeIds ? { classeId: { in: classeIds } } : {};

  const [saisiesEnRetard, aTraiter, plansPortes] = await Promise.all([
    prisma.evaluation.count({
      where: {
        tenantId,
        date: { lt: maintenant },
        statut: { not: "ANNULE" },
        notes: { none: {} },
        ...siteFilterForRelation(claims, "classe"),
        ...perimetre,
      },
    }),
    prisma.recommandation.count({
      where: {
        tenantId,
        resolueLe: null,
        statut: { in: ["OBLIGATOIRE", "RECOMMANDEE"] },
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
