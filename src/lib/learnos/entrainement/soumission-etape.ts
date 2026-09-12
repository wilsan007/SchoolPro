import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { proposerAttestationsApresSeance } from "@/lib/learnos/attestation";
import { parseStructure } from "./structure-question";
import { corrigerEtape, creditTentative, TENTATIVES_MAX } from "./correction";
import type { EtapeFaite } from "./deroule-seance";
import { detokeniser, graineEtape, corrigeLisible } from "./vue-eleve";
import { filtreFeuille, SELECT_EXERCICE, etapesFaites } from "./acces-base";
import { produirePreuve, cloturerSiTerminee } from "./preuve-apprentissage";

// ------------------------------------------------------------
// Soumission d'une étape
// ------------------------------------------------------------

export interface ResultatEtape {
  correcte: boolean;
  /** Tentatives consommées après celle-ci. */
  tentatives: number;
  /** L'étape est-elle close (réussie, ou tentatives épuisées) ? */
  close: boolean;
  /** Réponse attendue — présente uniquement si l'étape est close. */
  corrige: string | null;
  /** Indice, si un essai a échoué et que l'étape en propose un. */
  indice: string | null;
  /** L'exercice entier est-il terminé ? */
  exerciceTermine: boolean;
  /** La feuille entière est-elle terminée ? */
  seanceTerminee: boolean;
  /**
   * Attestations en classe demandées à l'issue de la séance.
   *
   * Remonté jusqu'à l'élève : c'est la contrepartie visible de son travail, et
   * la seule chose qui donne un sens au plafond posé sur l'entraînement seul.
   */
  attestationsProposees: number;
  /** Score de l'exercice, une fois celui-ci terminé. */
  score: number | null;
  maxScore: number | null;
}

export class ErreurSeance extends Error {
  constructor(
    message: string,
    readonly code:
      | "introuvable"
      | "structure_invalide"
      | "etape_hors_sequence"
      | "etape_close"
  ) {
    super(message);
    this.name = "ErreurSeance";
  }
}

/**
 * Temps écoulé depuis la dernière écriture sur cet exercice.
 *
 * Mesuré **serveur**, jamais annoncé par le client : c'est précisément la
 * valeur qu'un élève pressé aurait intérêt à falsifier. Conséquence assumée :
 * la première étape d'un exercice n'a pas de repère antérieur et reste non
 * mesurée (`null`). Créer la ligne de réponse à l'affichage pour gagner cette
 * mesure la fabriquerait pour des exercices jamais commencés.
 */
function dureeEcoulee(precedente: Date | null | undefined, maintenant: Date): number | null {
  if (!precedente) return null;
  const ms = maintenant.getTime() - precedente.getTime();
  // Une pause de plus d'une heure n'est pas du temps de travail : la compter
  // ferait passer un élève parti dîner pour un élève appliqué.
  if (ms < 0 || ms > 3_600_000) return null;
  return ms;
}

/**
 * Enregistre et corrige une réponse d'étape.
 *
 * Séquentiel par construction : on ne peut soumettre que l'étape courante. Sans
 * cette contrainte, un client modifié sauterait les étapes intermédiaires pour
 * ne répondre qu'à la dernière — et le découpage, qui existe pour localiser la
 * difficulté, ne mesurerait plus rien.
 */
export async function soumettreEtape(
  tenantId: string,
  claims: SessionSiteClaims,
  input: { feuilleId: string; exerciceId: string; index: number; reponse: string },
  maintenant: Date = new Date()
): Promise<ResultatEtape> {
  const exercice = await prisma.exerciceAssigne.findFirst({
    where: {
      id: input.exerciceId,
      feuille: {
        id: input.feuilleId,
        ...filtreFeuille(tenantId, claims),
        statut: { in: ["ASSIGNEE", "EN_COURS"] },
        // Même exigence qu'à la lecture : une feuille non mise à disposition
        // ne se répond pas non plus. Sans cette ligne, le verrou de
        // `chargerSeance` se contournerait en postant directement.
        assigneeLe: { not: null },
      },
    },
    select: {
      ...SELECT_EXERCICE,
      competenceId: true,
      feuille: {
        select: { id: true, eleveId: true, siteId: true, type: true, matiereId: true },
      },
    },
  });
  if (!exercice) throw new ErreurSeance("Exercice introuvable.", "introuvable");

  const structure = parseStructure(exercice.question.structure);
  if (!structure) {
    throw new ErreurSeance("Structure d'exercice inexploitable.", "structure_invalide");
  }

  const faites = etapesFaites(exercice.reponse);
  const parIndex = new Map(faites.map((e) => [e.index, e]));

  let courante = structure.etapes.length;
  for (let i = 0; i < structure.etapes.length; i++) {
    const f = parIndex.get(i);
    if (!f || (!f.correcte && f.tentatives < TENTATIVES_MAX)) {
      courante = i;
      break;
    }
  }
  if (courante >= structure.etapes.length) {
    throw new ErreurSeance("Exercice déjà terminé.", "etape_close");
  }
  if (input.index !== courante) {
    throw new ErreurSeance(
      `Étape ${input.index} soumise alors que l'étape ${courante} est attendue.`,
      "etape_hors_sequence"
    );
  }

  const etape = structure.etapes[courante];

  // Le client répond en jetons ; on les retraduit avant de corriger, et on
  // enregistre la forme retraduite. Stocker les jetons rendrait l'historique
  // illisible et le lierait à un algorithme de dérivation qui peut changer.
  const reponse = detokeniser(etape, graineEtape(exercice.id, courante), input.reponse);

  const correction = corrigerEtape(etape, reponse);
  const precedente = parIndex.get(courante);
  const tentatives = (precedente?.tentatives ?? 0) + 1;
  const close = correction.correcte || tentatives >= TENTATIVES_MAX;

  const faite: EtapeFaite = {
    index: courante,
    reponse,
    correcte: correction.correcte,
    tentatives,
    credit: correction.correcte ? creditTentative(tentatives) * etape.points : 0,
    erreur: correction.erreur,
    dureeMs: dureeEcoulee(exercice.reponse?.updatedAt, maintenant),
  };

  const misesAJour = [...faites.filter((e) => e.index !== courante), faite].sort(
    (a, b) => a.index - b.index
  );

  // Terminé seulement quand la DERNIÈRE étape se referme. Une étape ratée trois
  // fois n'interrompt pas l'exercice : elle s'ouvre avec sa correction et la
  // suite continue — c'est là que l'élève apprend quelque chose.
  const exerciceTermine = close && courante === structure.etapes.length - 1;

  const maxScore = structure.etapes.reduce((s, e) => s + e.points, 0);
  const score = misesAJour.reduce((s, e) => s + e.credit, 0);
  const dureeMs = misesAJour.reduce((s, e) => s + (e.dureeMs ?? 0), 0) || null;
  const tentativesTotal = misesAJour.reduce((s, e) => s + e.tentatives, 0);

  const donnees = {
    reponse: misesAJour.map((e) => e.reponse).join(" | "),
    etapes: misesAJour as unknown as Prisma.InputJsonValue,
    tentatives: tentativesTotal,
    dureeMs,
    // Le score n'est écrit qu'une fois l'exercice fini : un score partiel
    // deviendrait une preuve fausse si l'élève s'interrompait au milieu.
    score: exerciceTermine ? score : null,
    maxScore: exerciceTermine ? maxScore : null,
    corrigeeLe: exerciceTermine ? maintenant : null,
  };

  await prisma.exerciceReponse.upsert({
    where: { exerciceAssigneId: exercice.id },
    create: { exerciceAssigneId: exercice.id, ...donnees },
    update: donnees,
  });

  // Première réponse sur la feuille : elle passe en cours.
  await prisma.feuilleExercices.updateMany({
    where: { id: exercice.feuille.id, tenantId, statut: "ASSIGNEE" },
    data: { statut: "EN_COURS" },
  });

  let seanceTerminee = false;
  let attestationsProposees = 0;
  if (exerciceTermine) {
    await produirePreuve(tenantId, exercice, {
      score,
      maxScore,
      etapes: misesAJour,
      maintenant,
    });
    seanceTerminee = await cloturerSiTerminee(
      tenantId,
      exercice.feuille.id,
      exercice.feuille.eleveId,
      maintenant
    );

    // La boucle se referme ici : quand l'entraînement finit par dire « cet
    // élève sait faire », le système ne conclut pas — il demande à un adulte
    // de vérifier. C'est le seul chemin vers `MASTERED`, et c'est ce qui
    // empêche le plafond posé sur le travail autonome d'être une impasse.
    //
    // Déclenché à la clôture de la feuille, et non après chaque exercice : la
    // dernière preuve de la séance peut à elle seule franchir le seuil, mais
    // rien n'oblige à interroger la base trois fois pour s'en apercevoir.
    if (seanceTerminee) {
      const feuilles = await proposerAttestationsApresSeance(
        tenantId,
        exercice.feuille.eleveId,
        claims,
        maintenant
      );
      attestationsProposees = feuilles.length;
    }
  }

  return {
    correcte: correction.correcte,
    attestationsProposees,
    tentatives,
    close,
    corrige: close ? corrigeLisible(etape) : null,
    indice: !correction.correcte && !close ? (etape.indice ?? null) : null,
    exerciceTermine,
    seanceTerminee,
    score: exerciceTermine ? score : null,
    maxScore: exerciceTermine ? maxScore : null,
  };
}
