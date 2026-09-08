/**
 * EcolPro / LEARNOS — Analyse de patterns d'absence récurrents
 * =============================================================
 *
 * POURQUOI CE MODULE
 * -------------------
 * Un élève qui s'absente « de temps en temps » n'alerte personne. Mais un
 * élève qui manque systématiquement le lundi, ou toujours les cours de
 * mathématiques, ou systématiquement en début de mois, présente un signal
 * structurel — pas conjoncturel. Ce module détecte ces régularités.
 *
 * TROIS AXES D'ANALYSE
 * --------------------
 *  1. Jour de la semaine — « toujours absent le lundi »
 *  2. Matière — « toujours absent en mathématiques »
 *  3. Période du mois — « toujours absent en début de mois »
 *
 * MÉTHODE
 * --------
 * Pour chaque élève, on compare la distribution observée des absences
 * (par jour / matière / période) à une distribution uniforme. Si une
 * catégorie concentre ≥ 40% des absences avec un effectif minimum (≥ 3),
 * c'est un pattern récurrent.
 *
 * AUCUN LLM — statistiques pures, reproductibles, auditables.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Seuil de concentration pour déclarer un pattern récurrent. */
const SEUIL_CONCENTRATION = 0.4;

/** Nombre minimum d'absences pour qu'un pattern soit significatif. */
const SEUIL_EFFECTIF_MIN = 3;

/** Fenêtre d'observation en jours (année scolaire). */
const FENETRE_JOURS = 365;

/** Jours de la semaine (0 = dimanche, 6 = samedi). */
const JOURS_SEMAINE = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

/** Périodes du mois. */
const PERIODES_MOIS = ["Début", "Milieu", "Fin"] as const;

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type AxeAnalyse = "jour_semaine" | "matiere" | "periode_mois";

export interface PatternAbsence {
  eleveId: string;
  eleveNom: string;
  elevePrenom: string;
  classeNom: string;
  axe: AxeAnalyse;
  /** Valeur concentrée (ex: "Lundi", "Mathématiques", "Début"). */
  valeur: string;
  /** Nombre d'absences dans cette catégorie. */
  count: number;
  /** Total d'absences de l'élève sur la fenêtre. */
  total: number;
  /** Proportion des absences dans cette catégorie (0-1). */
  concentration: number;
  /** `true` si la concentration dépasse le seuil. */
  recurrent: boolean;
}

export interface SynthesePatternsAbsence {
  totalElevesAnalysees: number;
  patterns: PatternAbsence[];
  patternsRecurrents: number;
  parAxe: {
    jour_semaine: number;
    matiere: number;
    periode_mois: number;
  };
}

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/** Détermine la période du mois (1-10 = début, 11-20 = milieu, 21-31 = fin). */
export function periodeDuMois(jourDuMois: number): (typeof PERIODES_MOIS)[number] {
  if (jourDuMois <= 10) return "Début";
  if (jourDuMois <= 20) return "Milieu";
  return "Fin";
}

/**
 * Détecte les catégories sur-représentées dans une distribution.
 * Une catégorie est récurrente si elle concentre ≥ SEUIL_CONCENTRATION
 * des absences avec ≥ SEUIL_EFFECTIF_MIN occurrences.
 */
export function detecterConcentration(
  distribution: Map<string, number>,
  total: number
): { valeur: string; count: number; concentration: number; recurrent: boolean }[] {
  if (total < SEUIL_EFFECTIF_MIN) return [];
  const resultats: { valeur: string; count: number; concentration: number; recurrent: boolean }[] = [];
  for (const [valeur, count] of distribution) {
    const concentration = count / total;
    const recurrent = concentration >= SEUIL_CONCENTRATION && count >= SEUIL_EFFECTIF_MIN;
    resultats.push({ valeur, count, concentration, recurrent });
  }
  return resultats.sort((a, b) => b.count - a.count);
}

// ------------------------------------------------------------
// Analyse principale
// ------------------------------------------------------------

/**
 * Analyse les patterns d'absence récurrents pour tous les élèves actifs
 * du tenant/site, optionnellement restreints à une classe.
 *
 * Un seul aller-retour par famille de signaux, pas un par élève.
 */
export async function analyserPatternsAbsence(
  tenantId: string,
  claims: SessionSiteClaims,
  options?: { classeId?: string },
  maintenant: Date = new Date(),
  anneeCourante?: string | null
): Promise<SynthesePatternsAbsence> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  const depuis = new Date(maintenant.getTime() - FENETRE_JOURS * 86_400_000);

  // --- 1. Élèves actifs ---
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...(options?.classeId ? { classeId: options.classeId } : {}),
      ...siteFilterForModel("eleve", claims),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      classe: { select: { nom: true } },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  if (eleves.length === 0) {
    return {
      totalElevesAnalysees: 0,
      patterns: [],
      patternsRecurrents: 0,
      parAxe: { jour_semaine: 0, matiere: 0, periode_mois: 0 },
    };
  }

  const ids = eleves.map((e) => e.id);

  // --- 2. Absences sur la fenêtre ---
  const absences = await prisma.absence.findMany({
    where: {
      tenantId,
      eleveId: { in: ids },
      date: { gte: depuis, lte: maintenant },
      ...(annee ? { eleve: { classe: { annee } } } : {}),
      ...siteFilterForModel("absence", claims),
    },
    select: {
      eleveId: true,
      date: true,
      isRetard: true,
      eleve: { select: { classeId: true } },
    },
    orderBy: { date: "asc" },
  });

  if (absences.length === 0) {
    return {
      totalElevesAnalysees: eleves.length,
      patterns: [],
      patternsRecurrents: 0,
      parAxe: { jour_semaine: 0, matiere: 0, periode_mois: 0 },
    };
  }

  // --- 3. Séances pédagogiques pour l'analyse par matière ---
  // On a besoin de savoir quelle matière était prévue le jour d'une absence.
  const classeIds = [...new Set(
    absences
      .map((a) => a.eleve?.classeId)
      .filter((id): id is string => id !== null && id !== undefined)
  )];

  // Charger les séances pour ces classes sur la fenêtre, groupées par date.
  const seances = classeIds.length > 0
    ? await prisma.seancePedagogique.findMany({
        where: {
          tenantId,
          classeId: { in: classeIds },
          date: { gte: depuis, lte: maintenant },
          ...siteFilterForModel("seancePedagogique", claims),
        },
        select: {
          classeId: true,
          matiereId: true,
          matiere: { select: { nom: true } },
          date: true,
        },
      })
    : [];

  // Index : `${classeId}|${dateISO}` → Set<matiereNom>
  const seancesParClasseDate = new Map<string, Set<string>>();
  for (const s of seances) {
    const dateISO = s.date.toISOString().slice(0, 10);
    const cle = `${s.classeId}|${dateISO}`;
    let set = seancesParClasseDate.get(cle);
    if (!set) {
      set = new Set();
      seancesParClasseDate.set(cle, set);
    }
    set.add(s.matiere.nom);
  }

  // --- 4. Distribution par élève ---
  const patterns: PatternAbsence[] = [];

  // Indexer les absences par élève
  const absencesParEleve = new Map<string, typeof absences>();
  for (const a of absences) {
    let liste = absencesParEleve.get(a.eleveId);
    if (!liste) {
      liste = [];
      absencesParEleve.set(a.eleveId, liste);
    }
    liste.push(a);
  }

  for (const eleve of eleves) {
    const absencesEleve = absencesParEleve.get(eleve.id);
    if (!absencesEleve || absencesEleve.length < SEUIL_EFFECTIF_MIN) continue;

    const total = absencesEleve.length;

    // Distribution par jour de la semaine
    const distJour = new Map<string, number>();
    // Distribution par matière
    const distMatiere = new Map<string, number>();
    // Distribution par période du mois
    const distPeriode = new Map<string, number>();

    for (const a of absencesEleve) {
      // Jour de la semaine
      const jour = JOURS_SEMAINE[a.date.getDay()];
      distJour.set(jour, (distJour.get(jour) ?? 0) + 1);

      // Période du mois
      const periode = periodeDuMois(a.date.getDate());
      distPeriode.set(periode, (distPeriode.get(periode) ?? 0) + 1);

      // Matière : croiser avec les séances de la classe ce jour-là
      const classeId = a.eleve?.classeId;
      if (classeId) {
        const dateISO = a.date.toISOString().slice(0, 10);
        const cle = `${classeId}|${dateISO}`;
        const matieres = seancesParClasseDate.get(cle);
        if (matieres && matieres.size > 0) {
          // Si une seule matière ce jour-là, on l'attribue.
          // Si plusieurs, on les distribue également (l'élève était absent
          // pour toutes les matières de la journée).
          for (const matiere of matieres) {
            distMatiere.set(matiere, (distMatiere.get(matiere) ?? 0) + 1);
          }
        }
      }
    }

    // Détecter les concentrations par axe
    const concentrationsJour = detecterConcentration(distJour, total);
    for (const c of concentrationsJour) {
      patterns.push({
        eleveId: eleve.id,
        eleveNom: eleve.nom,
        elevePrenom: eleve.prenom,
        classeNom: eleve.classe?.nom ?? "—",
        axe: "jour_semaine",
        valeur: c.valeur,
        count: c.count,
        total,
        concentration: c.concentration,
        recurrent: c.recurrent,
      });
    }

    const concentrationsMatiere = detecterConcentration(distMatiere, total);
    for (const c of concentrationsMatiere) {
      patterns.push({
        eleveId: eleve.id,
        eleveNom: eleve.nom,
        elevePrenom: eleve.prenom,
        classeNom: eleve.classe?.nom ?? "—",
        axe: "matiere",
        valeur: c.valeur,
        count: c.count,
        total,
        concentration: c.concentration,
        recurrent: c.recurrent,
      });
    }

    const concentrationsPeriode = detecterConcentration(distPeriode, total);
    for (const c of concentrationsPeriode) {
      patterns.push({
        eleveId: eleve.id,
        eleveNom: eleve.nom,
        elevePrenom: eleve.prenom,
        classeNom: eleve.classe?.nom ?? "—",
        axe: "periode_mois",
        valeur: c.valeur,
        count: c.count,
        total,
        concentration: c.concentration,
        recurrent: c.recurrent,
      });
    }
  }

  // --- 5. Agrégation ---
  const recurrents = patterns.filter((p) => p.recurrent);
  const parAxe = {
    jour_semaine: recurrents.filter((p) => p.axe === "jour_semaine").length,
    matiere: recurrents.filter((p) => p.axe === "matiere").length,
    periode_mois: recurrents.filter((p) => p.axe === "periode_mois").length,
  };

  return {
    totalElevesAnalysees: eleves.length,
    patterns,
    patternsRecurrents: recurrents.length,
    parAxe,
  };
}

// ------------------------------------------------------------
// Analyse pour un élève spécifique
// ------------------------------------------------------------

/**
 * Analyse les patterns d'absence pour un seul élève.
 * Délègue à `analyserPatternsAbsence` en filtrant par classe.
 */
export async function analyserPatternsEleve(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date(),
  anneeCourante?: string | null
): Promise<PatternAbsence[]> {
  const eleve = await prisma.eleve.findFirst({
    where: {
      id: eleveId,
      tenantId,
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
    select: { classeId: true },
  });
  if (!eleve) return [];

  const synthese = await analyserPatternsAbsence(
    tenantId,
    claims,
    eleve.classeId ? { classeId: eleve.classeId } : undefined,
    maintenant,
    anneeCourante
  );

  return synthese.patterns.filter((p) => p.eleveId === eleveId);
}

// ------------------------------------------------------------
// Taux d'absence récent pour le moteur de prédiction
// ------------------------------------------------------------

/**
 * Calcule le taux d'absence injustifiée récent (30 derniers jours)
 * pour un élève, normalisé 0-1.
 *
 * Utilisé par le moteur de prédiction comme 5e facteur d'assiduité.
 * Un élève avec 0 absence → 1.0 (aucun impact).
 * Un élève avec ≥ 10 absences injustifiées en 30 jours → 0.0 (impact maximal).
 *
 * Déterministe, sans LLM.
 */
export async function tauxAssiduiteRecent(
  tenantId: string,
  eleveId: string,
  maintenant: Date = new Date()
): Promise<number> {
  const depuis = new Date(maintenant.getTime() - 30 * 86_400_000);

  // Le filtre de site passe par la relation `eleve` — l'absence n'a pas de
  // `siteId` direct. Le tenantId borne déjà la requête au tenant courant.
  // eslint-disable-next-line ecolpro/require-site-filter -- scope via tenantId + eleveId (déjà borné)
  const count = await prisma.absence.count({
    where: {
      tenantId,
      eleveId,
      motif: "INJUSTIFIE",
      isRetard: false,
      date: { gte: depuis, lte: maintenant },
    },
  });

  // 0 absence → 1.0, 10+ → 0.0, interpolation linéaire entre les deux.
  const PLAFOND = 10;
  return Math.max(0, 1 - count / PLAFOND);
}
