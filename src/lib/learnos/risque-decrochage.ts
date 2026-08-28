/**
 * EcolPro / LEARNOS — Risque de décrochage scolaire
 * ==================================================
 *
 * POURQUOI LE DÉCROCHAGE SILENCIEUX EST PLUS DANGEREUX QUE L'ÉCHEC VISIBLE
 * -----------------------------------------------------------------------
 * Un élève à 7/20 est déjà repéré : ses bulletins sont rouges, ses parents
 * sont convoqués, un plan de remédiation existe probablement. L'école sait
 * qu'il est en difficulté et agit. Le vrai danger, c'est l'élève à 9,5/20
 * dont la maîtrise baisse sur trois compétences, qui s'absente de plus en
 * plus — mais dont la moyenne n'a pas encore basculé sous la barre visible.
 * Personne ne le signale, car personne ne croise les signaux précoces.
 *
 * Ce module fait deux choses, sans aucun modèle de langage :
 *
 *  1. SCORE DE RISQUE (I10) — un score 0-100 par élève qui combine cinq
 *     signaux pondérés : maîtrise en baisse (40 %), absences (25 %),
 *     incidents (15 %), impayés (10 %), absence de plan actif (10 %).
 *
 *  2. DÉCROCHAGE SILENCIEUX (A8) — détecte les élèves dont la maîtrise
 *     baisse sur ≥ 2 compétences, dont les notes ou les absences
 *     dégradent, MAIS dont la moyenne reste ≥ 8/20. L'angle innovant :
 *     intervenir AVANT la chute visible, pas après.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Fenêtre d'observation des signaux récents, en jours. */
const FENETRE_JOURS = 30;

/** Plafond d'absences injustifiées au-delà duquel le signal est maximal. */
const PLAFOND_ABSENCES = 20;

/** Plafond d'incidents au-delà duquel le signal est maximal. */
const PLAFOND_INCIDENTS = 5;

/** Plafond d'impayés au-delà duquel le signal est maximal. */
const PLAFOND_IMPAYES = 3;

/** Seuil de moyenne (sur 20) en deçà duquel l'élève est en échec visible. */
const SEUIL_ECHEC_VISIBLE = 8;

/** Nombre minimum de compétences en baisse pour alerter sur le décrochage. */
const SEUIL_COMPETENCES_BAISSE = 2;

/** Poids des cinq signaux dans le score de risque (somme = 1). */
const POIDS = {
  masteryBaisse: 0.4,
  absencesHausse: 0.25,
  incidents: 0.15,
  impayes: 0.1,
  pasDePlanActif: 0.1,
} as const;

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type NiveauRisque = "FAIBLE" | "MODERE" | "ELEVE";

export interface ScoreRisqueEleve {
  eleveId: string;
  nom: string;
  prenom: string;
  classeId: string;
  classeNom: string;
  /** Score agrégé 0-100. */
  score: number;
  niveau: NiveauRisque;
  /** Intensité normalisée 0-1 de chaque signal. */
  signaux: {
    masteryBaisse: number; // 0-1
    absencesHausse: number; // 0-1
    incidents: number; // 0-1
    impayes: number; // 0-1
    pasDePlanActif: number; // 0-1
  };
  /** `true` si l'élève présente un décrochage silencieux (A8). */
  decrochageSilencieux: boolean;
  /** Dernière moyenne générale connue (sur 20), ou `null` si aucun bulletin. */
  moyenneActuelle: number | null;
}

export interface SyntheseRisque {
  totalEleves: number;
  risqueEleve: number;
  risqueModere: number;
  risqueFaible: number;
  decrochageSilencieux: number;
  eleves: ScoreRisqueEleve[];
}

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/** Plafonne une valeur entre 0 et 1. */
const plafonner = (v: number): number => Math.max(0, Math.min(1, v));

/** Convertit un score 0-100 en niveau de risque. */
function niveauPourScore(score: number): NiveauRisque {
  if (score >= 61) return "ELEVE";
  if (score >= 31) return "MODERE";
  return "FAIBLE";
}

/** Compte par élève à partir d'un résultat `groupBy`. */
function compterParEleve(
  lignes: { eleveId: string | null; _count: { eleveId: number } }[]
): Map<string, number> {
  return new Map(
    lignes.filter((l) => l.eleveId !== null).map((l) => [l.eleveId!, l._count.eleveId])
  );
}

// ------------------------------------------------------------
// Calcul du risque pour un tenant / site (ou une classe)
// ------------------------------------------------------------

/**
 * Calcule le score de risque de décrochage pour tous les élèves actifs du
 * tenant/site, optionnellement restreints à une classe.
 *
 * Un seul aller-retour par famille de signaux (groupBy + `in: [ids]`), et non
 * un par élève : à ~200 ms la requête, interroger élève par élève rendrait
 * l'écran inutilisable dès trente inscrits.
 */
export async function calculerRisqueDecrochage(
  tenantId: string,
  claims: SessionSiteClaims,
  options?: { classeId?: string },
  maintenant: Date = new Date()
): Promise<SyntheseRisque> {
  // --- 1. Élèves actifs du tenant/site (ou de la classe) ---
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
      classeId: true,
      classe: { select: { nom: true } },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  if (eleves.length === 0) {
    return {
      totalEleves: 0,
      risqueEleve: 0,
      risqueModere: 0,
      risqueFaible: 0,
      decrochageSilencieux: 0,
      eleves: [],
    };
  }

  const ids = eleves.map((e) => e.id);
  const depuis = new Date(maintenant.getTime() - FENETRE_JOURS * 86_400_000);
  // Fenêtre précédente (30-60 jours) pour détecter la hausse d'absences.
  const depuis60 = new Date(maintenant.getTime() - 2 * FENETRE_JOURS * 86_400_000);
  const anneeId = await anneeActiveId(tenantId);

  // --- 2. Signaux en batch (un seul aller-retour par famille) ---
  const [
    masteryBaisse,
    masteryTotal,
    absencesRecentes,
    absencesPrecedentes,
    incidents,
    impayes,
    recosObligatoires,
    plansActifs,
    bulletins,
  ] = await Promise.all([
    // Compétences dont la maîtrise est en baisse.
    prisma.studentLearningProfile.groupBy({
      by: ["eleveId"],
      where: {
        tenantId,
        eleveId: { in: ids },
        trend: "baisse",
        ...siteFilterForModel("studentLearningProfile", claims),
      },
      _count: { eleveId: true },
    }),
    // Total des compétences suivies pour l'élève (dénominateur du ratio).
    prisma.studentLearningProfile.groupBy({
      by: ["eleveId"],
      where: {
        tenantId,
        eleveId: { in: ids },
        ...siteFilterForModel("studentLearningProfile", claims),
      },
      _count: { eleveId: true },
    }),
    // Absences injustifiées des 30 derniers jours.
    prisma.absence.groupBy({
      by: ["eleveId"],
      where: {
        tenantId,
        eleveId: { in: ids },
        statut: "INJUSTIFIEE",
        date: { gte: depuis },
        ...siteFilterForModel("absence", claims),
      },
      _count: { eleveId: true },
    }),
    // Absences injustifiées de la période précédente (30-60 jours).
    prisma.absence.groupBy({
      by: ["eleveId"],
      where: {
        tenantId,
        eleveId: { in: ids },
        statut: "INJUSTIFIEE",
        date: { gte: depuis60, lt: depuis },
        ...siteFilterForModel("absence", claims),
      },
      _count: { eleveId: true },
    }),
    // Incidents non classés des 30 derniers jours.
    prisma.incident.groupBy({
      by: ["eleveId"],
      where: {
        tenantId,
        eleveId: { in: ids },
        statut: { not: "CLASSE" },
        date: { gte: depuis },
        ...siteFilterForModel("incident", claims),
      },
      _count: { eleveId: true },
    }),
    // Factures en retard (impayés).
    prisma.facture.groupBy({
      by: ["eleveId"],
      where: {
        tenantId,
        eleveId: { in: ids },
        statut: "EN_RETARD",
        ...(anneeId ? { anneeId } : {}),
        ...siteFilterForModel("facture", claims),
      },
      _count: { eleveId: true },
    }),
    // Recommandations obligatoires non résolues.
    prisma.recommandation.groupBy({
      by: ["eleveId"],
      where: {
        tenantId,
        eleveId: { in: ids },
        statut: "OBLIGATOIRE",
        resolueLe: null,
        ...siteFilterForModel("recommandation", claims),
      },
      _count: { eleveId: true },
    }),
    // Plans de progression actifs.
    prisma.planProgression.groupBy({
      by: ["eleveId"],
      where: {
        tenantId,
        eleveId: { in: ids },
        statut: "ACTIF",
        ...siteFilterForModel("planProgression", claims),
      },
      _count: { eleveId: true },
    }),
    // Bulletins : on a besoin des deux dernières moyennes pour comparer.
    prisma.bulletin.findMany({
      where: {
        tenantId,
        eleveId: { in: ids },
        ...siteFilterForModel("bulletin", claims),
      },
      select: {
        eleveId: true,
        moyenneGenerale: true,
        periode: { select: { numero: true } },
      },
    }),
  ]);

  // --- 3. Indexation par élève ---
  const parMasteryBaisse = compterParEleve(masteryBaisse);
  const parMasteryTotal = compterParEleve(masteryTotal);
  const parAbsencesRecentes = compterParEleve(absencesRecentes);
  const parAbsencesPrecedentes = compterParEleve(absencesPrecedentes);
  const parIncidents = compterParEleve(incidents);
  const parImpayes = compterParEleve(impayes);
  const parRecos = compterParEleve(recosObligatoires);
  const parPlansActifs = compterParEleve(plansActifs);

  // Dernier et avant-dernier bulletin par élève (triés par numéro de période).
  const bulletinsParEleve = new Map<
    string,
    { derniere: number | null; precedente: number | null }
  >();
  const parEleveBrut = new Map<string, { numero: number; moyenne: number | null }[]>();
  for (const b of bulletins) {
    if (!parEleveBrut.has(b.eleveId)) parEleveBrut.set(b.eleveId, []);
    parEleveBrut.get(b.eleveId)!.push({
      numero: b.periode.numero,
      moyenne: b.moyenneGenerale,
    });
  }
  for (const [eleveId, liste] of parEleveBrut) {
    liste.sort((a, b) => b.numero - a.numero);
    bulletinsParEleve.set(eleveId, {
      derniere: liste[0]?.moyenne ?? null,
      precedente: liste[1]?.moyenne ?? null,
    });
  }

  // --- 4. Score + détection par élève ---
  const resultats: ScoreRisqueEleve[] = eleves.map((e) => {
    const totalCompetences = parMasteryTotal.get(e.id) ?? 0;
    const nbBaisse = parMasteryBaisse.get(e.id) ?? 0;
    const masteryBaisse =
      totalCompetences > 0 ? nbBaisse / totalCompetences : 0;

    const absencesHausse = plafonner(
      (parAbsencesRecentes.get(e.id) ?? 0) / PLAFOND_ABSENCES
    );
    const incidentsSignal = plafonner(
      (parIncidents.get(e.id) ?? 0) / PLAFOND_INCIDENTS
    );
    const impayesSignal = plafonner(
      (parImpayes.get(e.id) ?? 0) / PLAFOND_IMPAYES
    );

    // Pas de plan actif : signal à 1 si l'élève a des recommandations
    // obligatoires non résolues mais AUCUN plan ACTIF pour les traiter.
    const aRecosNonResolues = (parRecos.get(e.id) ?? 0) > 0;
    const aPlanActif = (parPlansActifs.get(e.id) ?? 0) > 0;
    const pasDePlanActif = aRecosNonResolues && !aPlanActif ? 1 : 0;

    const score = Math.round(
      (POIDS.masteryBaisse * masteryBaisse +
        POIDS.absencesHausse * absencesHausse +
        POIDS.incidents * incidentsSignal +
        POIDS.impayes * impayesSignal +
        POIDS.pasDePlanActif * pasDePlanActif) *
        100
    );

    // --- Décrochage silencieux (A8) ---
    // L'élève n'a pas encore une moyenne catastrophique, mais montre des
    // signes précoces : maîtrise en baisse sur ≥ 2 compétences, ET
    // (notes en baisse sur la dernière période OU absences qui augmentent),
    // ET moyenne encore ≥ 8/20.
    const moyennes = bulletinsParEleve.get(e.id);
    const moyenneActuelle = moyennes?.derniere ?? null;
    const moyennePrecedente = moyennes?.precedente ?? null;

    const masteryBaisseSevere = nbBaisse >= SEUIL_COMPETENCES_BAISSE;

    // Notes en baisse : la dernière moyenne est strictement inférieure à la
    // précédente (les deux doivent exister).
    const notesEnBaisse =
      moyenneActuelle != null &&
      moyennePrecedente != null &&
      moyenneActuelle < moyennePrecedente;

    // Absences qui augmentent : plus d'absences injustifiées dans les
    // 30 derniers jours que dans les 30 jours précédents.
    const absencesAugmentent =
      (parAbsencesRecentes.get(e.id) ?? 0) >
      (parAbsencesPrecedentes.get(e.id) ?? 0);

    // Moyenne encore ≥ 8/20 : pas encore en échec visible. Si aucune
    // moyenne n'est connue, on ne peut pas conclure à un décrochage
    // silencieux — il manque le signal contradictoire essentiel.
    const moyennePasEncarEchec =
      moyenneActuelle != null && moyenneActuelle >= SEUIL_ECHEC_VISIBLE;

    const decrochageSilencieux =
      masteryBaisseSevere &&
      (notesEnBaisse || absencesAugmentent) &&
      moyennePasEncarEchec;

    return {
      eleveId: e.id,
      nom: e.nom,
      prenom: e.prenom,
      classeId: e.classeId ?? "",
      classeNom: e.classe?.nom ?? "—",
      score,
      niveau: niveauPourScore(score),
      signaux: {
        masteryBaisse,
        absencesHausse,
        incidents: incidentsSignal,
        impayes: impayesSignal,
        pasDePlanActif,
      },
      decrochageSilencieux,
      moyenneActuelle,
    };
  });

  // --- 5. Agrégation ---
  return {
    totalEleves: resultats.length,
    risqueEleve: resultats.filter((r) => r.niveau === "ELEVE").length,
    risqueModere: resultats.filter((r) => r.niveau === "MODERE").length,
    risqueFaible: resultats.filter((r) => r.niveau === "FAIBLE").length,
    decrochageSilencieux: resultats.filter((r) => r.decrochageSilencieux).length,
    eleves: resultats,
  };
}

// ------------------------------------------------------------
// Calcul du risque pour un élève spécifique
// ------------------------------------------------------------

/**
 * Calcule le score de risque pour un seul élève.
 *
 * Délègue à `calculerRisqueDecrochage` en filtrant par classe de l'élève,
 * puis extrait le résultat. Plus simple et moins risqué que de dupliquer
 * la logique : un seul chemin de calcul, un seul endroit à maintenir.
 */
export async function calculerRisqueEleve(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date()
): Promise<ScoreRisqueEleve | null> {
  // Vérifie l'existence et l'accès à l'élève (isolation tenant + site).
  const eleve = await prisma.eleve.findFirst({
    where: {
      id: eleveId,
      tenantId,
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
    select: { classeId: true },
  });
  if (!eleve) return null;

  const synthese = await calculerRisqueDecrochage(
    tenantId,
    claims,
    eleve.classeId ? { classeId: eleve.classeId } : undefined,
    maintenant
  );

  return synthese.eleves.find((e) => e.eleveId === eleveId) ?? null;
}
