/**
 * EcolPro / LEARNOS — Assiduité : base de calcul commune aux indicateurs d'absence.
 * ==============================================================================
 *
 * POURQUOI CE MODULE
 * ------------------
 * Le taux d'absentéisme était calculé partout de la même façon fautive :
 *
 *     taux = nombre de lignes `absences` / (effectif × 30)
 *
 * Trois erreurs se cumulaient dans cette seule ligne :
 *
 *   1. **Le dénominateur comptait 30 jours calendaires**, week-ends et vacances
 *      compris. Un établissement n'ouvre pas 30 jours sur 30 : sur une fenêtre
 *      d'un mois il y a ~21 jours de classe. Le taux était donc mécaniquement
 *      minoré d'environ un tiers.
 *   2. **La semaine était implicitement supposée lundi-vendredi.** Elle ne
 *      l'est pas ici : les emplois du temps en base vont du DIMANCHE au JEUDI
 *      (Djibouti, week-end vendredi-samedi). Coder la semaine en dur aurait
 *      remplacé une erreur par une autre — les jours de classe sont donc
 *      DÉDUITS de l'emploi du temps du tenant.
 *   3. **Le numérateur comptait des lignes, pas des journées.** Une ligne
 *      `Absence` peut être un retard (`isRetard`) ou une absence sur un seul
 *      créneau (`heureDebut` renseigné). Les compter comme des journées
 *      entières gonfle le taux ; un retard n'est pas une absence.
 *
 * CE QUE FAIT CE MODULE
 * ---------------------
 * Il fournit la fenêtre d'observation (bornes + nombre réel de jours de
 * classe, vacances et jours fériés déduits) et la pondération d'une ligne
 * d'absence en journées. Les fonctions de calcul sont pures et testées ; seule
 * `fenetreAssiduite` touche la base.
 */

import type { Jour } from "@prisma/client";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { anneeALaDate } from "@/lib/annee-scolaire";

/** Correspondance entre l'enum `Jour` et l'index de `Date.getDay()`. */
export const INDEX_JOUR: Record<Jour, number> = {
  DIMANCHE: 0,
  LUNDI: 1,
  MARDI: 2,
  MERCREDI: 3,
  JEUDI: 4,
  VENDREDI: 5,
  SAMEDI: 6,
};

/**
 * Semaine de repli, utilisée uniquement si le tenant n'a ni emploi du temps ni
 * absence saisie — auquel cas il n'y a de toute façon rien à mesurer. Ce n'est
 * pas une hypothèse sur le pays : la vraie semaine vient toujours des données.
 */
const JOURS_REPLI: Jour[] = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];

/** Types d'événements du calendrier qui ferment l'établissement. */
const TYPES_FERMETURE = ["VACANCE_SCOLAIRE", "JOUR_FERIE"];

/** D'où viennent les jours de classe retenus — remonté jusqu'au modèle. */
export type SourceJoursClasse = "emploi_du_temps" | "absences_observees" | "defaut";

export interface FenetreAssiduite {
  debut: Date;
  fin: Date;
  /** Nombre de jours réellement travaillés dans la fenêtre. Jamais 0 en sortie. */
  joursDeClasse: number;
  /** Jours de la semaine où l'établissement accueille des élèves. */
  joursSemaine: Jour[];
  source: SourceJoursClasse;
  /** Jours de classe retirés parce que vacances ou fériés. */
  joursFermes: number;
  /** Libellé à citer tel quel dans une réponse — évite « le trimestre 2 ». */
  libelle: string;
}

/** Une période de fermeture (vacances, férié), bornes incluses. */
export interface Fermeture {
  dateDebut: Date;
  dateFin: Date;
}

/** Rend `d` à minuit, sans muter l'original. */
function auMatin(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * Compte les jours de classe entre `debut` et `fin` (bornes incluses).
 *
 * Un jour compte s'il tombe sur un jour ouvré de l'établissement ET qu'aucune
 * fermeture ne le couvre. Fonction pure : c'est elle que testent les tests.
 */
export function compterJoursDeClasse(
  debut: Date,
  fin: Date,
  joursSemaine: Jour[],
  fermetures: Fermeture[] = []
): { joursDeClasse: number; joursFermes: number } {
  const ouvres = new Set(joursSemaine.map((j) => INDEX_JOUR[j]));
  if (ouvres.size === 0) return { joursDeClasse: 0, joursFermes: 0 };

  const bornes = fermetures.map((f) => ({
    debut: auMatin(f.dateDebut).getTime(),
    fin: auMatin(f.dateFin).getTime(),
  }));

  let joursDeClasse = 0;
  let joursFermes = 0;
  const curseur = auMatin(debut);
  const dernier = auMatin(fin).getTime();

  while (curseur.getTime() <= dernier) {
    if (ouvres.has(curseur.getDay())) {
      const t = curseur.getTime();
      if (bornes.some((b) => t >= b.debut && t <= b.fin)) joursFermes++;
      else joursDeClasse++;
    }
    curseur.setDate(curseur.getDate() + 1);
  }

  return { joursDeClasse, joursFermes };
}

/**
 * Poids d'une ligne d'absence, en journées.
 *
 *   - un retard n'est pas une absence          → 0
 *   - une absence bornée à un créneau horaire   → 0,5 (demi-journée)
 *   - `heureDebut` nul = journée entière        → 1
 *
 * Le 0,5 est une convention : le modèle ne stocke pas la quotité, seulement
 * les bornes horaires. Compter ces lignes comme des journées entières était
 * l'autre extrême, et le plus faux des deux.
 */
export function poidsJournee(a: { isRetard: boolean; heureDebut: string | null }): number {
  if (a.isRetard) return 0;
  return a.heureDebut ? 0.5 : 1;
}

/** Formate une date en jj/mm/aaaa. */
function f(d: Date): string {
  return d.toLocaleDateString("fr-FR");
}

/**
 * Fenêtre d'observation de l'assiduité pour un tenant, sur [debut ; fin].
 *
 * Les jours ouvrés sont déduits, dans l'ordre : de l'emploi du temps du tenant
 * (source de vérité), sinon des jours de semaine où des absences ont été
 * saisies sur les six derniers mois, sinon du repli lundi-vendredi.
 */
export async function fenetreAssiduite(
  tenantId: string,
  claims: SessionSiteClaims,
  debut: Date,
  fin: Date
): Promise<FenetreAssiduite> {
  // 1. Jours ouvrés — depuis l'emploi du temps.
  const creneaux = await prisma.emploiTemps.findMany({
    where: { tenantId, ...siteFilterForModel("emploiTemps", claims) },
    select: { jour: true },
    distinct: ["jour"],
  });
  let joursSemaine = creneaux.map((c) => c.jour);
  let source: SourceJoursClasse = "emploi_du_temps";

  // 2. Repli : les jours où des absences ont effectivement été saisies.
  if (joursSemaine.length === 0) {
    const debutObservation = new Date(fin);
    debutObservation.setDate(debutObservation.getDate() - 180);
    const observees = await prisma.absence.findMany({
      where: {
        tenantId,
        date: { gte: debutObservation, lte: fin },
        ...siteFilterForModel("absence", claims),
      },
      select: { date: true },
      take: 2000,
    });
    const index = new Set(observees.map((a) => a.date.getDay()));
    joursSemaine = (Object.keys(INDEX_JOUR) as Jour[]).filter((j) => index.has(INDEX_JOUR[j]));
    source = "absences_observees";
  }

  // 3. Dernier repli.
  if (joursSemaine.length === 0) {
    joursSemaine = JOURS_REPLI;
    source = "defaut";
  }

  // Vacances et jours fériés de l'année scolaire couvrant la fin de fenêtre.
  const annee = await anneeALaDate(tenantId, fin);
  const fermetures: Fermeture[] = annee
    ? await prisma.evenementCalendaire.findMany({
        where: {
          anneeId: annee.id,
          type: { in: TYPES_FERMETURE },
          dateDebut: { lte: fin },
          dateFin: { gte: debut },
        },
        select: { dateDebut: true, dateFin: true },
      })
    : [];

  const { joursDeClasse, joursFermes } = compterJoursDeClasse(debut, fin, joursSemaine, fermetures);

  return {
    debut,
    fin,
    // Un dénominateur nul rendrait le taux indéfini : on plancher à 1 jour.
    // Le cas ne survient que sur une fenêtre entièrement en vacances.
    joursDeClasse: Math.max(joursDeClasse, 1),
    joursSemaine,
    source,
    joursFermes,
    libelle: `du ${f(debut)} au ${f(fin)} (${joursDeClasse} jours de classe)`,
  };
}

/** Ligne d'absence réduite à ce qui sert au calcul. */
export interface LigneAbsence {
  isRetard: boolean;
  heureDebut: string | null;
}

export interface AgregatAssiduite {
  /** Journées d'absence pondérées (retards exclus, demi-journées à 0,5). */
  journeesAbsence: number;
  /** Lignes marquées `isRetard`, comptées à part. */
  retards: number;
  /** Lignes d'absence, retards exclus — utile pour dire « 12 absences ». */
  absences: number;
}

/** Agrège des lignes d'absence en journées, retards séparés. */
export function agregerAbsences(lignes: LigneAbsence[]): AgregatAssiduite {
  let journeesAbsence = 0;
  let retards = 0;
  let absences = 0;
  for (const l of lignes) {
    if (l.isRetard) {
      retards++;
      continue;
    }
    absences++;
    journeesAbsence += poidsJournee(l);
  }
  return { journeesAbsence: Math.round(journeesAbsence * 100) / 100, retards, absences };
}

/**
 * Taux d'absentéisme en pourcentage, arrondi au dixième.
 *
 * `journeesAbsence / (effectif × jours de classe)` — le seul dénominateur
 * défendable : le nombre de présences attendues sur la fenêtre.
 */
export function tauxAbsenteisme(
  journeesAbsence: number,
  effectif: number,
  joursDeClasse: number
): number {
  const attendu = effectif * joursDeClasse;
  if (attendu <= 0) return 0;
  return Math.round((journeesAbsence / attendu) * 1000) / 10;
}
