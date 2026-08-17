/**
 * EcolPro / LEARNOS — Efficacité pédagogique
 * ==========================================
 *
 * MESURER CE QUI MARCHE POUR LE REPRODUIRE
 * ----------------------------------------
 * Les plans de remédiation, les interventions ciblées et les propositions IA
 * ne valent que par leur effet sur la maîtrise des élèves. Ce module croise
 * les mesures avant/après pour répondre à cinq questions :
 *
 *  A15 — Les plans de remédiation font-ils progresser la maîtrise ?
 *  A14 — Quels enseignants obtiennent les meilleurs résultats ?
 *  A16 — Quel type d'intervention est le plus efficace ?
 *  A17 — La validation des étapes corrèle-t-elle avec le succès du plan ?
 *  A19 — L'IA générative est-elle adoptée (validée) par les enseignants ?
 *
 * Aucune intuition, aucun modèle : des moyennes, des taux et un coefficient
 * de corrélation. La donnée avant/après existe déjà dans le schéma
 * (`masteryAvant`/`masteryApres`, `masteryBefore`/`masteryAfter`) — il
 * suffisait de l'interroger.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

/** Seuil de maîtrise à partir duquel un plan est considéré comme réussi. */
const SEUIL_MASTERY_SUCCES = 0.55;

/** Nombre minimum d'échantillons pour qu'une corrélation soit interprétable. */
const MIN_ECHANTILLONS_CORRELATION = 5;

// ------------------------------------------------------------
// Types exportés
// ------------------------------------------------------------

export interface EfficacitePlans {
  deltaMasteryMoyen: number;
  tauxSucces: number; // % plans où masteryApres ≥ 0.55
  totalPlans: number;
  parType: { type: string; delta: number; tauxSucces: number; count: number }[];
  parMatiere: { matiereId: string; matiereNom: string; delta: number; count: number }[];
}

export interface EfficaciteEnseignant {
  userId: string;
  nom: string;
  plansTermines: number;
  elevesAides: number;
  deltaMasteryMoyen: number;
  vsMoyenneTenant: number; // delta - moyenne tenant
  topPerformer: boolean;
}

export interface EfficaciteIntervention {
  parType: { type: string; deltaMoyen: number; echantillon: number }[];
  typeLePlusEfficace: string | null;
}

export interface CorrelationEtapes {
  ratioEtapesValidees: number[]; // par plan
  succesPlan: boolean[]; // masteryApres ≥ 0.55
  correlation: number; // coefficient de corrélation de Pearson
  /** `false` si moins de 5 échantillons — la corrélation n'est pas fiable. */
  donneesSuffisantes: boolean;
}

export interface AdoptionIA {
  questions: { generee: number; validee: number; taux: number };
  plansLecon: { genere: number; valide: number; taux: number };
  rubriques: { genere: number; valide: number; taux: number };
}

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/**
 * Résout les bornes d'une année scolaire. Les `PlanProgression` n'ont pas
 * d'`anneeId` : on filtre par `dateFin` dans l'intervalle de l'année.
 *
 * Retourne `null` si l'année n'existe pas — l'appelant renvoie alors un
 * résultat vide.
 */
async function bornesAnnee(
  tenantId: string,
  anneeId: string
): Promise<{ debut: Date; fin: Date } | null> {
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { dateDebut: true, dateFin: true },
  });
  return annee ? { debut: annee.dateDebut, fin: annee.dateFin } : null;
}

/**
 * Coefficient de corrélation de Pearson entre deux séries de même longueur.
 * Retourne 0 si l'une des séries a une variance nulle (pas de discriminant).
 */
function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }

  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

/** Résultat vide pour `EfficacitePlans` (aucun plan terminé avec mesures). */
function videEfficacitePlans(): EfficacitePlans {
  return {
    deltaMasteryMoyen: 0,
    tauxSucces: 0,
    totalPlans: 0,
    parType: [],
    parMatiere: [],
  };
}

// ------------------------------------------------------------
// A15 — Efficacité des plans de remédiation
// ------------------------------------------------------------

/**
 * Mesure l'effet des plans terminés sur la maîtrise des élèves.
 *
 * Ne retient que les `PlanProgression` dont `statut = TERMINE` et dont les
 * mesures `masteryAvant` / `masteryApres` sont renseignées : sans mesure
 * avant ET après, il n'y a rien à comparer.
 *
 * @param anneeId  Optionnel — borne les plans par `dateFin` dans l'année.
 */
export async function analyserEfficacitePlans(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId?: string
): Promise<EfficacitePlans> {
  // Résoudre les bornes de l'année scolaire si demandée.
  let bornes: { debut: Date; fin: Date } | null = null;
  if (anneeId) {
    bornes = await bornesAnnee(tenantId, anneeId);
    if (!bornes) return videEfficacitePlans();
  }

  const plans = await prisma.planProgression.findMany({
    where: {
      tenantId,
      statut: "TERMINE",
      masteryAvant: { not: null },
      masteryApres: { not: null },
      ...(bornes ? { dateFin: { gte: bornes.debut, lte: bornes.fin } } : {}),
      ...siteFilterForModel("planProgression", claims),
    },
    select: {
      id: true,
      type: true,
      matiereId: true,
      masteryAvant: true,
      masteryApres: true,
    },
  });

  if (plans.length === 0) return videEfficacitePlans();

  // --- Agrégats globaux ---
  const deltas = plans.map((p) => p.masteryApres! - p.masteryAvant!);
  const deltaMasteryMoyen = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const nbSucces = plans.filter((p) => p.masteryApres! >= SEUIL_MASTERY_SUCCES).length;
  const tauxSucces = nbSucces / plans.length;

  // --- Grouper par type (remediation vs approfondissement) ---
  const parTypeMap = new Map<string, { deltas: number[]; succ: number }>();
  for (const p of plans) {
    const e = parTypeMap.get(p.type) ?? { deltas: [], succ: 0 };
    e.deltas.push(p.masteryApres! - p.masteryAvant!);
    if (p.masteryApres! >= SEUIL_MASTERY_SUCCES) e.succ++;
    parTypeMap.set(p.type, e);
  }
  const parType = Array.from(parTypeMap.entries()).map(([type, e]) => ({
    type,
    delta: e.deltas.reduce((a, b) => a + b, 0) / e.deltas.length,
    tauxSucces: e.succ / e.deltas.length,
    count: e.deltas.length,
  }));
  parType.sort((a, b) => b.count - a.count);

  // --- Grouper par matière (les plans sans matière sont ignorés ici) ---
  const parMatiereMap = new Map<string, number[]>();
  for (const p of plans) {
    if (!p.matiereId) continue;
    const arr = parMatiereMap.get(p.matiereId) ?? [];
    arr.push(p.masteryApres! - p.masteryAvant!);
    parMatiereMap.set(p.matiereId, arr);
  }

  const matiereIds = Array.from(parMatiereMap.keys());
  const matieres = matiereIds.length
    ? await prisma.matiere.findMany({
        where: { id: { in: matiereIds }, tenantId, ...siteFilterForModel("matiere", claims) },
        select: { id: true, nom: true },
      })
    : [];
  const matiereNom = new Map(matieres.map((m) => [m.id, m.nom]));

  const parMatiere = Array.from(parMatiereMap.entries()).map(([matiereId, arr]) => ({
    matiereId,
    matiereNom: matiereNom.get(matiereId) ?? "—",
    delta: arr.reduce((a, b) => a + b, 0) / arr.length,
    count: arr.length,
  }));
  parMatiere.sort((a, b) => b.delta - a.delta);

  return {
    deltaMasteryMoyen,
    tauxSucces,
    totalPlans: plans.length,
    parType,
    parMatiere,
  };
}

// ------------------------------------------------------------
// A14 — Progression de mastery par enseignant
// ------------------------------------------------------------

/**
 * Compare l'efficacité des enseignants responsables de plans terminés.
 *
 * Pour chaque enseignant ayant au moins un plan terminé avec mesures, on
 * calcule son Δ mastery moyen et le nombre d'élèves distincts aidés. La
 * comparaison avec la moyenne du tenant identifie les top performers (au-dessus
 * de la moyenne ET avec un delta positif) et, implicitement, ceux en difficulté.
 *
 * @param anneeId  Optionnel — borne les plans par `dateFin` dans l'année.
 */
export async function analyserEfficaciteEnseignants(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId?: string
): Promise<EfficaciteEnseignant[]> {
  let bornes: { debut: Date; fin: Date } | null = null;
  if (anneeId) {
    bornes = await bornesAnnee(tenantId, anneeId);
    if (!bornes) return [];
  }

  // Un seul aller-retour : tous les plans terminés avec mesures.
  // Les plans sans responsable sont inclus dans la moyenne du tenant mais
  // exclus du classement individuel.
  const plans = await prisma.planProgression.findMany({
    where: {
      tenantId,
      statut: "TERMINE",
      masteryAvant: { not: null },
      masteryApres: { not: null },
      ...(bornes ? { dateFin: { gte: bornes.debut, lte: bornes.fin } } : {}),
      ...siteFilterForModel("planProgression", claims),
    },
    select: {
      id: true,
      responsableUserId: true,
      eleveId: true,
      masteryAvant: true,
      masteryApres: true,
    },
  });

  if (plans.length === 0) return [];

  // Moyenne du tenant (tous plans confondus, avec ou sans responsable).
  const moyenneTenant =
    plans.reduce((sum, p) => sum + (p.masteryApres! - p.masteryAvant!), 0) /
    plans.length;

  // Grouper par enseignant responsable.
  const parEns = new Map<string, { deltas: number[]; eleves: Set<string> }>();
  for (const p of plans) {
    if (!p.responsableUserId) continue;
    const e = parEns.get(p.responsableUserId) ?? {
      deltas: [] as number[],
      eleves: new Set<string>(),
    };
    e.deltas.push(p.masteryApres! - p.masteryAvant!);
    e.eleves.add(p.eleveId);
    parEns.set(p.responsableUserId, e);
  }

  if (parEns.size === 0) return [];

  // Charger les noms des enseignants responsables.
  const userIds = Array.from(parEns.keys());
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, tenantId, ...siteFilterForModel("user", claims) },
    select: { id: true, name: true, firstName: true, lastName: true },
  });
  const nomUser = new Map(users.map((u) => [u.id, u]));

  const resultats: EfficaciteEnseignant[] = Array.from(parEns.entries()).map(
    ([userId, e]) => {
      const delta = e.deltas.reduce((a, b) => a + b, 0) / e.deltas.length;
      const vs = delta - moyenneTenant;
      const u = nomUser.get(userId);
      // Préférer prénom + nom si renseignés, sinon le champ `name`.
      const nom = u
        ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name
        : "—";
      return {
        userId,
        nom,
        plansTermines: e.deltas.length,
        elevesAides: e.eleves.size,
        deltaMasteryMoyen: delta,
        vsMoyenneTenant: vs,
        // Top performer : au-dessus de la moyenne du tenant ET delta positif.
        // Un enseignant au-dessus d'une moyenne négative n'est pas un « top ».
        topPerformer: vs > 0 && delta > 0,
      };
    }
  );

  // Tri : top performers en premier (delta décroissant).
  resultats.sort((a, b) => b.deltaMasteryMoyen - a.deltaMasteryMoyen);
  return resultats;
}

// ------------------------------------------------------------
// A16 — Comparaison des types d'intervention
// ------------------------------------------------------------

/**
 * Compare l'efficacité des types d'intervention (`remediation`, `retest`,
 * `prerequisite_review`) sur la maîtrise des élèves.
 *
 * Ne retient que les `StudentIntervention` dont `status = COMPLETED` et dont
 * les mesures `masteryBefore` / `masteryAfter` sont renseignées.
 */
export async function comparerTypesIntervention(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<EfficaciteIntervention> {
  const interventions = await prisma.studentIntervention.findMany({
    where: {
      tenantId,
      status: "COMPLETED",
      masteryBefore: { not: null },
      masteryAfter: { not: null },
      ...siteFilterForModel("studentIntervention", claims),
    },
    select: {
      interventionType: true,
      masteryBefore: true,
      masteryAfter: true,
    },
  });

  if (interventions.length === 0) {
    return { parType: [], typeLePlusEfficace: null };
  }

  const parTypeMap = new Map<string, number[]>();
  for (const i of interventions) {
    const arr = parTypeMap.get(i.interventionType) ?? [];
    arr.push(i.masteryAfter! - i.masteryBefore!);
    parTypeMap.set(i.interventionType, arr);
  }

  const parType = Array.from(parTypeMap.entries()).map(([type, arr]) => ({
    type,
    deltaMoyen: arr.reduce((a, b) => a + b, 0) / arr.length,
    echantillon: arr.length,
  }));

  // Type le plus efficace : delta moyen le plus élevé.
  parType.sort((a, b) => b.deltaMoyen - a.deltaMoyen);
  const typeLePlusEfficace = parType.length > 0 ? parType[0].type : null;

  return { parType, typeLePlusEfficace };
}

// ------------------------------------------------------------
// A17 — Corrélation validation des étapes → succès du plan
// ------------------------------------------------------------

/**
 * Corrèle le ratio d'étapes validées avec le succès du plan.
 *
 * Hypothèse : plus un plan voit ses étapes validées, meilleur est son
 * résultat (masteryApres ≥ 0.55). Le coefficient de Pearson quantifie cette
 * relation.
 *
 * Les plans sans étape sont exclus : un ratio 0/0 n'a pas de sens et
 * n'apporterait que du bruit à la corrélation.
 *
 * Si moins de 5 échantillons sont disponibles, `donneesSuffisantes` vaut
 * `false` et la corrélation est ramenée à 0 — une corrélation sur 3 points
 * n'a aucune valeur statistique.
 */
export async function correlerEtapesSucces(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<CorrelationEtapes> {
  const plans = await prisma.planProgression.findMany({
    where: {
      tenantId,
      statut: "TERMINE",
      masteryApres: { not: null },
      ...siteFilterForModel("planProgression", claims),
    },
    select: {
      id: true,
      masteryApres: true,
      etapes: { select: { statut: true } },
    },
  });

  const ratioEtapesValidees: number[] = [];
  const succesPlan: boolean[] = [];

  for (const p of plans) {
    const total = p.etapes.length;
    // Pas d'étape = pas de signal : on exclut plutôt que d'injecter un 0.
    if (total === 0) continue;
    const validees = p.etapes.filter((e) => e.statut === "VALIDE").length;
    ratioEtapesValidees.push(validees / total);
    succesPlan.push(p.masteryApres! >= SEUIL_MASTERY_SUCCES);
  }

  const n = ratioEtapesValidees.length;
  const donneesSuffisantes = n >= MIN_ECHANTILLONS_CORRELATION;

  if (!donneesSuffisantes) {
    return { ratioEtapesValidees, succesPlan, correlation: 0, donneesSuffisantes: false };
  }

  // Pearson entre le ratio d'étapes validées (x) et le succès du plan (y : 1/0).
  const y = succesPlan.map((s) => (s ? 1 : 0));
  const correlation = pearson(ratioEtapesValidees, y);

  return { ratioEtapesValidees, succesPlan, correlation, donneesSuffisantes: true };
}

// ------------------------------------------------------------
// A19 — Adoption de l'IA générative
// ------------------------------------------------------------

/**
 * Mesure le taux d'adoption de l'IA générative par les enseignants.
 *
 * Trois familles de propositions IA sont suivies :
 *
 *  - **Questions** : générées par l'IA (`origine = "ia"`), validées par une
 *    relecture humaine (`relueParId ≠ null`).
 *  - **Plans de leçon** : générés par l'IA (`modeleIa ≠ null`), validés par
 *    la direction (`statut = VALIDE`).
 *  - **Rubriques d'évaluation** : même calcul que les plans de leçon.
 *
 * Le taux est le ratio validées / générées. Une question non relue est
 * servie (le dispositif ne peut pas attendre une file de relecture), mais
 * elle n'est pas « adoptée » au sens de cette métrique.
 */
export async function mesurerAdoptionIA(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<AdoptionIA> {
  // --- Questions : générées par l'IA, et parmi elles celles relues ---
  const [questionsGen, questionsVal] = await Promise.all([
    prisma.question.count({
      where: {
        tenantId,
        origine: "ia",
        ...siteFilterForModel("question", claims),
      },
    }),
    prisma.question.count({
      where: {
        tenantId,
        origine: "ia",
        relueParId: { not: null },
        ...siteFilterForModel("question", claims),
      },
    }),
  ]);

  // --- Plans de leçon : générés par l'IA, et parmi eux ceux validés ---
  const [plansGen, plansVal] = await Promise.all([
    prisma.planLecon.count({
      where: {
        tenantId,
        modeleIa: { not: null },
        ...siteFilterForModel("planLecon", claims),
      },
    }),
    prisma.planLecon.count({
      where: {
        tenantId,
        modeleIa: { not: null },
        statut: "VALIDE",
        ...siteFilterForModel("planLecon", claims),
      },
    }),
  ]);

  // --- Rubriques d'évaluation : même calcul ---
  const [rubGen, rubVal] = await Promise.all([
    prisma.rubriqueEvaluation.count({
      where: {
        tenantId,
        modeleIa: { not: null },
        ...siteFilterForModel("rubriqueEvaluation", claims),
      },
    }),
    prisma.rubriqueEvaluation.count({
      where: {
        tenantId,
        modeleIa: { not: null },
        statut: "VALIDE",
        ...siteFilterForModel("rubriqueEvaluation", claims),
      },
    }),
  ]);

  return {
    questions: {
      generee: questionsGen,
      validee: questionsVal,
      taux: questionsGen > 0 ? questionsVal / questionsGen : 0,
    },
    plansLecon: {
      genere: plansGen,
      valide: plansVal,
      taux: plansGen > 0 ? plansVal / plansGen : 0,
    },
    rubriques: {
      genere: rubGen,
      valide: rubVal,
      taux: rubGen > 0 ? rubVal / rubGen : 0,
    },
  };
}
