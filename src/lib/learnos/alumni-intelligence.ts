/**
 * EcolPro / LEARNOS — Intelligence post-diplôme : trois analyses déterministes
 * ==========================================================================
 *
 * Ce module regroupe les analyses portant sur les anciens élèves (alumni) pour
 * mesurer la réussite dans le supérieur, l'insertion professionnelle selon la
 * filière d'orientation et la vitalité du réseau alumni. Aucune analyse
 * n'en appelle à un modèle de langage : tout est calculé à partir des données
 * Prisma existantes.
 *
 *  I26 — Réussite supérieure des diplômés (taux d'accès au supérieur)
 *  I27 — Filière d'orientation → insertion professionnelle
 *  I28 — Activité du réseau alumni (participation & présence LinkedIn)
 *
 * RÈGLES
 *  - Chaque requête Prisma inclut `tenantId` et `siteFilterForModel()`.
 *  - Les taux vont de 0 à 1 (0 = 0 %, 1 = 100 %).
 *  - Une donnée manquante ne produit pas un faux 0 : les fonctions renvoient
 *    un drapeau `donneesInsuffisantes` quand l'échantillon est vide.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/** Borner une valeur dans [0, 1]. */
function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Taux = numérateur / dénominateur, borné dans [0, 1].
 * Renvoie `null` si le dénominateur est nul (division impossible).
 */
function taux(numerateur: number, denominateur: number): number | null {
  if (denominateur <= 0) return null;
  return clamp01(numerateur / denominateur);
}

/**
 * Calcule la pente d'une tendance linéaire (régression des moindres carrés)
 * sur une série de taux ordonnés par année croissante.
 *
 * Renvoie `null` si moins de deux points. Une pente positive signifie que
 * le taux s'améliore au fil du temps.
 */
function penteTendance(points: { annee: string; taux: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const xs = points.map((_, i) => i); // rang de l'année (0, 1, 2…)
  const ys = points.map((p) => p.taux);
  const sommeX = xs.reduce((a, b) => a + b, 0);
  const sommeY = ys.reduce((a, b) => a + b, 0);
  const sommeXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sommeXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sommeXX - sommeX * sommeX;
  if (denom === 0) return null;
  return (n * sommeXY - sommeX * sommeY) / denom;
}

// ============================================================
// I26 — RÉUSSITE SUPÉRIEURE DES DIPLÔMÉS
// ============================================================

/**
 * Taux d'accès aux études supérieures des diplômés, ventilé par année de
 * diplôme et par mention.
 */
export interface ReussiteSuperieure {
  /** Taux d'accès au supérieur global (0-1) sur l'ensemble du périmètre. */
  tauxAccesSuperieur: number | null;
  /** Nombre total d'alumni avec un statut connu (hors INCONNU). */
  nbAlumniStatutConnu: number;
  /** Nombre d'alumni en études supérieures. */
  nbEtudesSuperieures: number;
  /** Ventilation par année de diplôme. */
  parAnnee: {
    anneeDiplome: string;
    nbTotal: number;
    nbEtudesSuperieures: number;
    taux: number | null;
  }[];
  /** Ventilation par mention au diplôme. */
  parMention: {
    mention: string;
    nbTotal: number;
    nbEtudesSuperieures: number;
    taux: number | null;
  }[];
  /** Tendance : pente de la régression linéaire des taux annuels. */
  tendance: number | null;
  /** `true` si la tendance s'améliore (pente > 0). */
  enAmelioration: boolean;
  /** `true` si aucun alumni n'est disponible dans le périmètre. */
  donneesInsuffisantes: boolean;
}

/**
 * Analyse la réussite supérieure des diplômés (I26).
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function analyserReussiteSuperieure(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<ReussiteSuperieure> {
  // 1. Charger tous les alumni du périmètre avec un statut exploitable.
  const alumni = await prisma.alumni.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("alumni", claims),
    },
    select: {
      id: true,
      anneeDiplome: true,
      mention: true,
      statut: true,
    },
  });

  // 2. Cas dégénéré : aucun alumni.
  if (alumni.length === 0) {
    return {
      tauxAccesSuperieur: null,
      nbAlumniStatutConnu: 0,
      nbEtudesSuperieures: 0,
      parAnnee: [],
      parMention: [],
      tendance: null,
      enAmelioration: false,
      donneesInsuffisantes: true,
    };
  }

  // 3. Ne conserver que les alumni dont le statut est « connu »
  //    (on exclut INCONNU du dénominateur, sinon le taux est artificiellement
  //    abaissé par les enregistrements non renseignés).
  const statutConnu = alumni.filter((a) => a.statut !== "INCONNU");
  const nbEtudesSuperieures = statutConnu.filter(
    (a) => a.statut === "ETUDES_SUPERIEURES",
  ).length;

  // 4. Taux global.
  const tauxGlobal = taux(nbEtudesSuperieures, statutConnu.length);

  // 5. Ventilation par année de diplôme.
  const parAnneeMap = new Map<
    string,
    { nbTotal: number; nbEtudesSuperieures: number }
  >();
  for (const a of statutConnu) {
    const cle = a.anneeDiplome;
    const slot = parAnneeMap.get(cle) ?? { nbTotal: 0, nbEtudesSuperieures: 0 };
    slot.nbTotal += 1;
    if (a.statut === "ETUDES_SUPERIEURES") slot.nbEtudesSuperieures += 1;
    parAnneeMap.set(cle, slot);
  }
  const parAnnee = Array.from(parAnneeMap.entries())
    .map(([anneeDiplome, v]) => ({
      anneeDiplome,
      nbTotal: v.nbTotal,
      nbEtudesSuperieures: v.nbEtudesSuperieures,
      taux: taux(v.nbEtudesSuperieures, v.nbTotal),
    }))
    .sort((a, b) => a.anneeDiplome.localeCompare(b.anneeDiplome));

  // 6. Ventilation par mention.
  const parMentionMap = new Map<
    string,
    { nbTotal: number; nbEtudesSuperieures: number }
  >();
  for (const a of statutConnu) {
    const cle = a.mention ?? "Non précisée";
    const slot = parMentionMap.get(cle) ?? {
      nbTotal: 0,
      nbEtudesSuperieures: 0,
    };
    slot.nbTotal += 1;
    if (a.statut === "ETUDES_SUPERIEURES") slot.nbEtudesSuperieures += 1;
    parMentionMap.set(cle, slot);
  }
  const parMention = Array.from(parMentionMap.entries())
    .map(([mention, v]) => ({
      mention,
      nbTotal: v.nbTotal,
      nbEtudesSuperieures: v.nbEtudesSuperieures,
      taux: taux(v.nbEtudesSuperieures, v.nbTotal),
    }))
    .sort((a, b) => b.nbTotal - a.nbTotal);

  // 7. Tendance : pente de la régression sur les taux annuels.
  //    On ne retient que les années ayant un taux calculable.
  const pointsTendance = parAnnee
    .filter((p) => p.taux !== null)
    .map((p) => ({ annee: p.anneeDiplome, taux: p.taux as number }));
  const tendance = penteTendance(pointsTendance);

  return {
    tauxAccesSuperieur: tauxGlobal,
    nbAlumniStatutConnu: statutConnu.length,
    nbEtudesSuperieures,
    parAnnee,
    parMention,
    tendance,
    enAmelioration: tendance !== null && tendance > 0,
    donneesInsuffisantes: statutConnu.length === 0,
  };
}

// ============================================================
// I27 — FILIÈRE ORIENTATION → INSERTION PROFESSIONNELLE
// ============================================================

/** Libellé lisible d'une recommandation de filière. */
const LIBELLE_FILIERE: Record<string, string> = {
  FILIERE_SCIENTIFIQUE: "Scientifique",
  FILIERE_LITTERAIRE: "Littéraire",
  FILIERE_TECHNIQUE: "Technique",
  FILIERE_PROFESSIONNELLE: "Professionnelle",
};

/**
 * Taux d'insertion professionnelle par filière d'orientation recommandée.
 */
export interface InsertionParFiliere {
  /** Filière produisant le meilleur taux d'insertion. */
  filiereLeader: string | null;
  /** Taux d'insertion de la filière leader (0-1). */
  tauxFiliereLeader: number | null;
  /** Ventilation détaillée par filière. */
  parFiliere: {
    filiere: string;
    libelle: string;
    nbTotal: number;
    nbInsere: number;
    /** Taux d'insertion = (EN_EMPLOI + ENTREPRENEUR) / total (0-1). */
    taux: number | null;
  }[];
  /** Nombre total d'alumni liés à un élève ayant une recommandation. */
  nbAlumniLies: number;
  /** `true` si aucun alumni lié n'est disponible. */
  donneesInsuffisantes: boolean;
}

/**
 * Analyse l'insertion professionnelle selon la filière d'orientation (I27).
 *
 * Pour chaque `Alumni` lié à un `Eleve` via `eleveId`, on récupère la
 * recommandation de filière du `ParcoursScolaire` correspondant, puis on
 * croise avec le statut professionnel (`EN_EMPLOI` ou `ENTREPRENEUR`).
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function analyserInsertionParFiliere(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<InsertionParFiliere> {
  // 1. Charger les alumni liés à un élève, avec leur statut.
  const alumni = await prisma.alumni.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("alumni", claims),
      eleveId: { not: null },
    },
    select: {
      id: true,
      eleveId: true,
      statut: true,
    },
  });

  if (alumni.length === 0) {
    return {
      filiereLeader: null,
      tauxFiliereLeader: null,
      parFiliere: [],
      nbAlumniLies: 0,
      donneesInsuffisantes: true,
    };
  }

  // 2. Récupérer les parcours scolaires (recommandation) pour ces élèves.
  const eleveIds = Array.from(
    new Set(alumni.map((a) => a.eleveId).filter((id): id is string => id !== null)),
  );
  const parcours = await prisma.parcoursScolaire.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("parcoursScolaire", claims),
      eleveId: { in: eleveIds },
      recommandation: { not: null },
    },
    select: {
      eleveId: true,
      recommandation: true,
    },
  });

  // 3. Indexer la recommandation par élève (on prend la première trouvée,
  //    peu importe l'année — la filière d'orientation est une tendance
  //    globale du parcours de l'élève).
  const recommandationParEleve = new Map<string, string>();
  for (const p of parcours) {
    if (p.recommandation && !recommandationParEleve.has(p.eleveId)) {
      recommandationParEleve.set(p.eleveId, p.recommandation);
    }
  }

  // 4. Croiser : pour chaque alumni lié, associer la filière + statut.
  const parFiliereMap = new Map<
    string,
    { nbTotal: number; nbInsere: number }
  >();
  let nbLiesAvecRecommandation = 0;

  for (const a of alumni) {
    if (!a.eleveId) continue;
    const filiere = recommandationParEleve.get(a.eleveId);
    if (!filiere) continue; // élève sans recommandation de filière exploitable
    nbLiesAvecRecommandation += 1;

    const slot = parFiliereMap.get(filiere) ?? { nbTotal: 0, nbInsere: 0 };
    slot.nbTotal += 1;
    if (a.statut === "EN_EMPLOI" || a.statut === "ENTREPRENEUR") {
      slot.nbInsere += 1;
    }
    parFiliereMap.set(filiere, slot);
  }

  // 5. Construire la ventilation et identifier la filière leader.
  const parFiliere = Array.from(parFiliereMap.entries())
    .map(([filiere, v]) => ({
      filiere,
      libelle: LIBELLE_FILIERE[filiere] ?? filiere,
      nbTotal: v.nbTotal,
      nbInsere: v.nbInsere,
      taux: taux(v.nbInsere, v.nbTotal),
    }))
    .sort((a, b) => (b.taux ?? -1) - (a.taux ?? -1));

  const leader = parFiliere[0] ?? null;

  return {
    filiereLeader: leader?.filiere ?? null,
    tauxFiliereLeader: leader?.taux ?? null,
    parFiliere,
    nbAlumniLies: nbLiesAvecRecommandation,
    donneesInsuffisantes: nbLiesAvecRecommandation === 0,
  };
}

// ============================================================
// I28 — ACTIVITÉ DU RÉSEAU ALUMNI
// ============================================================

/**
 * Vitalité du réseau alumni : participation au réseau et présence LinkedIn.
 */
export interface ReseauAlumni {
  /** Taux de participation au réseau (accepteContact = true) sur le total. */
  tauxParticipation: number | null;
  /** Nombre d'alumni acceptant le contact. */
  nbAcceptentContact: number;
  /** Taux de présence LinkedIn (linkedin renseigné) sur le total. */
  tauxLinkedin: number | null;
  /** Nombre d'alumni avec un profil LinkedIn renseigné. */
  nbLinkedin: number;
  /** Nombre total d'alumni dans le périmètre. */
  nbTotal: number;
  /** Ventilation par année de diplôme. */
  parAnnee: {
    anneeDiplome: string;
    nbTotal: number;
    nbAcceptentContact: number;
    nbLinkedin: number;
    tauxParticipation: number | null;
    tauxLinkedin: number | null;
  }[];
  /** Ventilation par site. */
  parSite: {
    siteId: string | null;
    nbTotal: number;
    nbAcceptentContact: number;
    nbLinkedin: number;
    tauxParticipation: number | null;
    tauxLinkedin: number | null;
  }[];
  /** Diplômés les plus engageables pour le réseau (accepteContact + linkedin). */
  plusEngageables: {
    id: string;
    nom: string;
    prenom: string;
    anneeDiplome: string;
    linkedin: string | null;
    scoreEngagement: number;
  }[];
  /** `true` si aucun alumni n'est disponible dans le périmètre. */
  donneesInsuffisantes: boolean;
}

/**
 * Analyse l'activité du réseau alumni (I28).
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function analyserReseauAlumni(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<ReseauAlumni> {
  // 1. Charger tous les alumni du périmètre.
  const alumni = await prisma.alumni.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("alumni", claims),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      anneeDiplome: true,
      siteId: true,
      linkedin: true,
      accepteContact: true,
    },
  });

  if (alumni.length === 0) {
    return {
      tauxParticipation: null,
      nbAcceptentContact: 0,
      tauxLinkedin: null,
      nbLinkedin: 0,
      nbTotal: 0,
      parAnnee: [],
      parSite: [],
      plusEngageables: [],
      donneesInsuffisantes: true,
    };
  }

  const nbTotal = alumni.length;
  const nbAcceptentContact = alumni.filter((a) => a.accepteContact).length;
  const nbLinkedin = alumni.filter((a) => a.linkedin !== null && a.linkedin.trim() !== "").length;

  // 2. Ventilation par année de diplôme.
  const parAnneeMap = new Map<
    string,
    {
      nbTotal: number;
      nbAcceptentContact: number;
      nbLinkedin: number;
    }
  >();
  for (const a of alumni) {
    const cle = a.anneeDiplome;
    const slot = parAnneeMap.get(cle) ?? {
      nbTotal: 0,
      nbAcceptentContact: 0,
      nbLinkedin: 0,
    };
    slot.nbTotal += 1;
    if (a.accepteContact) slot.nbAcceptentContact += 1;
    if (a.linkedin !== null && a.linkedin.trim() !== "") slot.nbLinkedin += 1;
    parAnneeMap.set(cle, slot);
  }
  const parAnnee = Array.from(parAnneeMap.entries())
    .map(([anneeDiplome, v]) => ({
      anneeDiplome,
      nbTotal: v.nbTotal,
      nbAcceptentContact: v.nbAcceptentContact,
      nbLinkedin: v.nbLinkedin,
      tauxParticipation: taux(v.nbAcceptentContact, v.nbTotal),
      tauxLinkedin: taux(v.nbLinkedin, v.nbTotal),
    }))
    .sort((a, b) => a.anneeDiplome.localeCompare(b.anneeDiplome));

  // 3. Ventilation par site.
  const parSiteMap = new Map<
    string | null,
    {
      nbTotal: number;
      nbAcceptentContact: number;
      nbLinkedin: number;
    }
  >();
  for (const a of alumni) {
    const cle = a.siteId;
    const slot = parSiteMap.get(cle) ?? {
      nbTotal: 0,
      nbAcceptentContact: 0,
      nbLinkedin: 0,
    };
    slot.nbTotal += 1;
    if (a.accepteContact) slot.nbAcceptentContact += 1;
    if (a.linkedin !== null && a.linkedin.trim() !== "") slot.nbLinkedin += 1;
    parSiteMap.set(cle, slot);
  }
  const parSite = Array.from(parSiteMap.entries())
    .map(([siteId, v]) => ({
      siteId,
      nbTotal: v.nbTotal,
      nbAcceptentContact: v.nbAcceptentContact,
      nbLinkedin: v.nbLinkedin,
      tauxParticipation: taux(v.nbAcceptentContact, v.nbTotal),
      tauxLinkedin: taux(v.nbLinkedin, v.nbTotal),
    }))
    .sort((a, b) => b.nbTotal - a.nbTotal);

  // 4. Diplômés les plus engageables.
  //    Score d'engagement : accepteContact (1 pt) + linkedin renseigné (1 pt)
  //    + bonus ancienneté (année de diplôme récente = plus facile à mobiliser).
  const plusEngageables = alumni
    .map((a) => {
      let score = 0;
      if (a.accepteContact) score += 1;
      if (a.linkedin !== null && a.linkedin.trim() !== "") score += 1;
      return {
        id: a.id,
        nom: a.nom,
        prenom: a.prenom,
        anneeDiplome: a.anneeDiplome,
        linkedin: a.linkedin,
        scoreEngagement: score,
      };
    })
    .filter((a) => a.scoreEngagement > 0)
    .sort((a, b) => {
      // Score décroissant, puis année de diplôme la plus récente d'abord.
      if (b.scoreEngagement !== a.scoreEngagement) {
        return b.scoreEngagement - a.scoreEngagement;
      }
      return b.anneeDiplome.localeCompare(a.anneeDiplome);
    })
    .slice(0, 20);

  return {
    tauxParticipation: taux(nbAcceptentContact, nbTotal),
    nbAcceptentContact,
    tauxLinkedin: taux(nbLinkedin, nbTotal),
    nbLinkedin,
    nbTotal,
    parAnnee,
    parSite,
    plusEngageables,
    donneesInsuffisantes: false,
  };
}
