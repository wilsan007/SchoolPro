/**
 * EcolPro / LEARNOS — Modèle hybride d'alimentation de la banque
 * ==============================================================
 *
 * Deux temps, un même garde-fou : la banque ne doit jamais être le goulot
 * d'étranglement de l'entraînement, sans que la génération ne devienne une
 * machine à écrire des exercices faux.
 *
 * **1. La nuit (batch).** `comblerTrous` cible les couples compétence × palier
 * dont le stock passe sous `STOCK_CIBLE_PAR_PALIER`, en partant des
 * compétences les plus travaillées. Prévoir coûte un appel par trou au lieu
 * d'un appel panique devant un élève ; on produit deux questions par trou pour
 * que la variété existe dès la première séance.
 *
 * **2. Le jour (secours).** `questionDeSecours` ne s'active QUE quand
 * `composerFeuille` n'a plus rien à servir sur une cible — la banque est
 * épuisée, l'alternative serait de resservir la même question. Un seul appel,
 * un seul QCM, budget vérifié à l'avance. L'indisponibilité de l'IA n'est
 * pas une erreur ici : la composition continue sur la banque restante, à
 * l'identique d'aujourd'hui.
 *
 * Ce que ce module ne fait PAS : choisir ce qu'un élève doit travailler
 * (c'est `exercice-selector`, déterministe) et pondérer les preuves (c'est
 * `deroule-seance` avec `FACTEUR_QUESTION_NON_RELUE`). Les questions créées
 * ici arrivent `origine: "ia"`, non relues : servables, mais décotées.
 */

import type { FormatQuestion, PalierExercice } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import { type SessionSiteClaims, siteFilterForModel } from "@/lib/site-scope";
import { genererQuestions } from "@/lib/learnos/generation-questions";
import { budgetGenerationDuJour } from "@/lib/learnos/entrainement/budget-ia";

// ------------------------------------------------------------
// Constantes de pilotage
// ------------------------------------------------------------

/**
 * Paliers entretenus par le batch.
 *
 * TRANSFERT et OUVERTURE en sont exclus : ce sont des paliers d'excellence,
 * servis quand la maîtrise est déjà haute. Les combler au robot produit des
 * exercices plausibles que personne n'est capable de relire — et une banque
 * gonflée de questions jamais servies, qui noie les utiles dans le tirage.
 */
export const PALIERS_DE_STOCK: readonly PalierExercice[] = [
  "RESTITUTION",
  "APPLICATION",
  "CONSOLIDATION",
];

/** Sous ce nombre de questions auto-corrigeables, un couple est un trou. */
export const STOCK_CIBLE_PAR_PALIER = 3;

/**
 * Format du secours à la volée : le QCM mono-étape.
 *
 * C'est le format le plus robuste au décodage (mesuré dans
 * `generation-questions` : les petits modèles échouent sur les structures
 * longues) et le plus rapide à valider. Le secours survient devant un élève
 * qui attend : on minimise le risque de rejet, pas la variété de forme.
 */
export const FORMAT_SECOURS: FormatQuestion = "CHOIX_UNIQUE";

/** Questions générées par le secours lors d'une seule composition. */
export const SECOURS_MAX_PAR_COMPOSITION = 1;

/** Couples compétence × palier maximum comblés par exécution de cron. */
export const TROUS_MAX_PAR_CRON = 15;

/** Questions produites par couple comblé (variété immédiate). */
export const QUESTIONS_PAR_TROU = 2;

/** Fenêtre d'activité récente, en jours, pour prioriser le batch. */
export const FENETRE_ACTIVITE_JOURS = 30;

/**
 * Désactive le secours à la volée (et le cron en est indépendant).
 *
 * Coupé quand : aucun fournisseur IA configuré coûterait un délai pour rien,
 * ou quand on veut mesurer la banque seule. Le défaut est ACTIF : le secours
 * est borné par le budget quotidien, et son échec silencieux est le
 * comportement d'aujourd'hui.
 */
export function secoursActif(): boolean {
  return process.env.AI_GENERATION_AUTONOME !== "false";
}

// ------------------------------------------------------------
// Calculs purs — testables sans base
// ------------------------------------------------------------

export interface CompteStock {
  competenceId: string;
  palier: PalierExercice;
  nombre: number;
}

export interface TrouStock {
  competenceId: string;
  palier: PalierExercice;
  /** Questions auto-corrigeables déjà présentes (0 si couple absent). */
  actuel: number;
}

/**
 * Couples compétence × palier dont le stock passe sous le seuil.
 *
 * On déduit des COMPÉTENCES fournies, pas des comptes : un couple sans
 * aucune question n'apparaît dans aucun compte, et c'est précisément le trou
 * le plus grave.
 */
export function trousDeStock(
  competenceIds: readonly string[],
  comptes: readonly CompteStock[],
  seuil: number = STOCK_CIBLE_PAR_PALIER,
  paliers: readonly PalierExercice[] = PALIERS_DE_STOCK
): TrouStock[] {
  const connus = new Map(comptes.map((c) => [`${c.competenceId}|${c.palier}`, c.nombre]));
  const trous: TrouStock[] = [];
  for (const competenceId of competenceIds) {
    for (const palier of paliers) {
      const actuel = connus.get(`${competenceId}|${palier}`) ?? 0;
      if (actuel < seuil) trous.push({ competenceId, palier, actuel });
    }
  }
  return trous;
}

/**
 * Trie les trous : les compétences les plus travaillées d'abord.
 *
 * Une compétence sans aucune preuve récente n'a besoin de rien ce soir-ci —
 * peut-être que le chapitre n'est pas encore ouvert. Celle qui accumule des
 * séances voit son stock fondre vite : c'est elle qu'il faut remplir.
 */
export function prioriteParActivite(
  trous: readonly TrouStock[],
  activite: ReadonlyMap<string, number>
): TrouStock[] {
  return [...trous].sort(
    (a, b) =>
      (activite.get(b.competenceId) ?? 0) - (activite.get(a.competenceId) ?? 0) ||
      // À activité égale, on comble d'abord ce qui est le plus vide, puis un
      // ordre stable pour qu'une exécution se répète à l'identique.
      a.actuel - b.actuel ||
      a.competenceId.localeCompare(b.competenceId) ||
      a.palier.localeCompare(b.palier)
  );
}

// ------------------------------------------------------------
// Lecture de l'état du stock (curriculum du tenant)
// ------------------------------------------------------------

export interface EtatStock {
  competenceIds: string[];
  comptes: CompteStock[];
  /** Preuves d'apprentissage récentes par compétence (priorisation). */
  activite: Map<string, number>;
}

/**
 * État du stock pour tout le curriculum du tenant, dans une langue donnée.
 *
 * Ne compte que les formats auto-corrigeables : une question de rédaction ne
 * sauve pas un élève en entraînement autonome, et compter le rempli gonflerait
 * un stock qui reste vide là où ça compte.
 */
export async function stockCurriculum(
  tenantId: string,
  claims: SessionSiteClaims,
  langue: "fr" | "so" = "fr",
  maintenant: Date = new Date()
): Promise<EtatStock> {
  const chapitres = await prisma.chapitre.findMany({
    where: { tenantId, ...siteFilterForModel("chapitre", claims) },
    select: { competences: { select: { id: true } } },
  });
  const competenceIds = chapitres.flatMap((c) => c.competences.map((cp) => cp.id));
  if (competenceIds.length === 0) {
    return { competenceIds: [], comptes: [], activite: new Map() };
  }

  const [comptes, activite] = await Promise.all([
    prisma.question.groupBy({
      by: ["competenceId", "palier"],
      where: {
        tenantId,
        actif: true,
        langue,
        competenceId: { in: competenceIds },
        format: {
          in: ["SAISIE_COURTE", "CHOIX_UNIQUE", "ETAPES_GUIDEES", "REMISE_EN_ORDRE", "APPARIEMENT"],
        },
        ...siteFilterForModel("question", claims),
      },
      _count: { _all: true },
    }),
    // Preuves et non feuilles : une feuille peut être composée sans jamais
    // être terminée ; une preuve est un élève qui a réellement travaillé.
    prisma.learningEvidence.groupBy({
      by: ["competenceId"],
      where: {
        tenantId,
        competenceId: { in: competenceIds },
        occurredAt: {
          gte: new Date(maintenant.getTime() - FENETRE_ACTIVITE_JOURS * 24 * 60 * 60 * 1000),
        },
        ...siteFilterForModel("learningEvidence", claims),
      },
      _count: { _all: true },
    }),
  ]);

  return {
    competenceIds,
    comptes: comptes.map((c) => ({
      competenceId: c.competenceId,
      palier: c.palier,
      nombre: c._count._all,
    })),
    activite: new Map(
      activite.flatMap((a) => (a.competenceId ? ([[a.competenceId, a._count._all]] as const) : []))
    ),
  };
}

// ------------------------------------------------------------
// Comblement (batch) — appelé par le cron de nuit
// ------------------------------------------------------------

export interface BilanCombler {
  trousConsideres: number;
  trousTotal: number;
  generees: number;
  rejetees: number;
  echecs: number;
  /** Budget épuisé : on arrête, la nuit suivante reprendra. */
  budgetEpuise: boolean;
  /** Fournisseurs IA tous indisponibles : arrêt précoce. */
  iaIndisponible: boolean;
}

/**
 * Comble les trous fournis, dans l'ordre donné, sous plafond de budget.
 *
 * Un trou qui échoue ne bloque pas les suivants (compétence introuvable,
 * rejet de format…) ; seuls l'épuisement de budget et l'indisponibilité de
 * tous les fournisseurs arrêtent en tournée — les suivants échoueraient
 * pareil, et chaque tentative coûterait un délai.
 */
export async function comblerTrous(
  tenantId: string,
  claims: SessionSiteClaims,
  trous: readonly TrouStock[],
  actorId: string,
  opts: { langue?: "fr" | "so"; max?: number; parTrou?: number } = {}
): Promise<BilanCombler> {
  const langue = opts.langue ?? "fr";
  const max = Math.min(opts.max ?? TROUS_MAX_PAR_CRON, trous.length);
  const parTrou = Math.min(opts.parTrou ?? QUESTIONS_PAR_TROU, 2);

  const bilan: BilanCombler = {
    trousConsideres: 0,
    trousTotal: trous.length,
    generees: 0,
    rejetees: 0,
    echecs: 0,
    budgetEpuise: false,
    iaIndisponible: false,
  };

  for (const trou of trous.slice(0, max)) {
    const budget = await budgetGenerationDuJour(tenantId);
    if (budget.epuise) {
      bilan.budgetEpuise = true;
      break;
    }
    bilan.trousConsideres++;
    try {
      const resultat = await genererQuestions(
        tenantId,
        claims,
        {
          competenceId: trou.competenceId,
          palier: trou.palier,
          format: FORMAT_SECOURS,
          nombre: parTrou,
          langue,
        },
        actorId
      );
      bilan.generees += resultat.creees.length;
      bilan.rejetees += resultat.rejetees;
      // Un trou sans aucune question produite reste un trou : il est compté
      // pour que le récapitulatif du cron le remonte au lieu de le taire.
      if (resultat.creees.length === 0) bilan.echecs++;
    } catch (error) {
      if (error instanceof AiAllProvidersFailedError) {
        bilan.iaIndisponible = true;
        break;
      }
      bilan.echecs++;
      console.warn("[stock-questions] échec de génération", {
        tenantId,
        competenceId: trou.competenceId,
        palier: trou.palier,
        error,
      });
    }
  }

  return bilan;
}

// ------------------------------------------------------------
// Secours à la volée — appelé par composerFeuille devant un élève
// ------------------------------------------------------------

/**
 * Une question de secours quand la banque n'a plus rien sur une cible.
 *
 * Retourne l'identifiant de la question créée, ou `null` dans TOUS les cas
 * où la composition doit continuer sans elle : budget épuisé, IA absente,
 * génération rejetée. Ce chemin tourne devant un élève qui attend — une
 * exception ici ne doit jamais remonter et vider sa feuille.
 */
export async function questionDeSecours(
  tenantId: string,
  claims: SessionSiteClaims,
  competenceId: string,
  palier: PalierExercice,
  langue: "fr" | "so" = "fr"
): Promise<string | null> {
  if (!secoursActif()) return null;
  // Le palier de secours est borné à ceux que le batch entretient : servir un
  // TRANSFERT généré à la volée à un élève en difficulté inverse le sens du
  // dispositif.
  if (!(PALIERS_DE_STOCK as readonly string[]).includes(palier)) return null;

  try {
    const budget = await budgetGenerationDuJour(tenantId);
    if (budget.epuise) return null;

    const resultat = await genererQuestions(
      tenantId,
      claims,
      { competenceId, palier, format: FORMAT_SECOURS, nombre: 1, langue },
      // Pas d'adulte à l'origine : c'est la composition elle-même qui déclenche
      // l'appel. L'acteur reste identifiable dans le journal pour le tracer.
      "auto:secours-entrainement"
    );
    return resultat.creees[0]?.id ?? null;
  } catch (error) {
    // Indisponibilité, timeout, rejet total : la banque restante sert, comme
    // avant ce module. On journalise pour que l'opérateur voie le secours
    // silencieux tomber en panne.
    console.warn("[stock-questions] secours indisponible", {
      tenantId,
      competenceId,
      palier,
      error,
    });
    return null;
  }
}
