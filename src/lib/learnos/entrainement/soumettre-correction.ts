import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { routeAi } from "@/lib/ai/router";
import { mergeFilters, siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { parseGrille } from "./grille-correction";
import {
  LONGUEUR_MAX_REPONSE,
  construireProposition,
  type Proposition,
} from "./correction-assistee";
import { ACTION_CORRECTION, budgetDuJour } from "./budget-ia";
import {
  CONSIGNE_SYSTEME,
  OUTIL_CORRECTION,
  VERSION_PROMPT_CORRECTION,
  composerMessage,
} from "./prompt-correction";

// ------------------------------------------------------------
// Soumission d'une production à la correction assistée
// ------------------------------------------------------------

/** Erreurs métier, traduites en statuts HTTP par la route. */
export class ErreurCorrection extends Error {
  constructor(
    message: string,
    readonly code:
      | "question_introuvable"
      | "eleve_introuvable"
      | "sans_grille"
      | "reponse_vide"
      | "budget_epuise"
      | "sortie_inexploitable"
  ) {
    super(message);
    this.name = "ErreurCorrection";
  }
}

export interface ResultatSoumission {
  correctionId: string;
  proposition: Proposition;
  modele: string;
}

/**
 * Soumet une production à la correction assistée et enregistre la PROPOSITION.
 *
 * Écrit dans `CorrectionAssistee`, JAMAIS dans `LearningEvidence` : tant qu'un
 * adulte n'a pas relu, la production ne pèse sur aucun profil.
 *
 * @throws {ErreurCorrection}
 */
export async function soumettreCorrection(
  tenantId: string,
  claims: SessionSiteClaims,
  input: { eleveId: string; questionId: string; reponse: string },
  actorId: string
): Promise<ResultatSoumission> {
  const reponse = input.reponse.trim();
  if (reponse === "") throw new ErreurCorrection("Production vide.", "reponse_vide");

  const question = await prisma.question.findFirst({
    where: mergeFilters(
      { id: input.questionId, tenantId, actif: true },
      siteFilterForModel("question", claims)
    ),
    select: { id: true, enonce: true, grille: true, grilleVersion: true, siteId: true },
  });
  if (!question) throw new ErreurCorrection("Question introuvable.", "question_introuvable");

  const grille = parseGrille(question.grille);
  if (!grille) throw new ErreurCorrection("Cette question n'a pas de grille.", "sans_grille");

  // L'élève est vérifié AVANT l'appel : payer un appel pour découvrir ensuite
  // que l'élève est hors périmètre serait gaspiller du budget.
  const eleve = await prisma.eleve.findFirst({
    where: mergeFilters({ id: input.eleveId, tenantId }, siteFilterForModel("eleve", claims)),
    select: { id: true, siteId: true },
  });
  if (!eleve) throw new ErreurCorrection("Élève introuvable.", "eleve_introuvable");

  // Le budget se contrôle AVANT l'appel : un plafond vérifié après coup a déjà
  // été dépassé.
  const budget = await budgetDuJour(tenantId);
  if (budget.epuise) {
    throw new ErreurCorrection("Budget quotidien de corrections assistées épuisé.", "budget_epuise");
  }

  const bornee = reponse.slice(0, LONGUEUR_MAX_REPONSE);

  const resultat = await routeAi(
    {
      complexity: "complex",
      promptVersion: VERSION_PROMPT_CORRECTION,
      action: ACTION_CORRECTION,
      tenantId,
      siteId: question.siteId,
      inputRef: question.id,
      actorId,
    },
    [
      { role: "system", content: CONSIGNE_SYSTEME },
      { role: "user", content: composerMessage(question.enonce, grille, bornee) },
    ],
    {
      tools: [OUTIL_CORRECTION],
      // Température nulle : on veut le jugement le plus stable possible. Deux
      // fois la même copie doit recevoir le même avis.
      temperature: 0,
      maxTokens: 1500,
    }
  );

  const proposition = construireProposition(
    grille,
    resultat.toolCalls[0]?.arguments ?? resultat.content
  );
  if (!proposition) {
    throw new ErreurCorrection("Sortie du modèle inexploitable.", "sortie_inexploitable");
  }

  const modele = `${resultat.meta.providerName}/${resultat.meta.modelName}`;

  const creee = await prisma.correctionAssistee.create({
    data: {
      tenantId,
      siteId: eleve.siteId,
      eleveId: eleve.id,
      questionId: question.id,
      grilleVersion: question.grilleVersion,
      reponse: bornee,
      statut: proposition.statut,
      score: proposition.score,
      maxScore: proposition.maxScore,
      criteresReussis: proposition.criteresReussis as unknown as Prisma.InputJsonValue,
      details: proposition.details as unknown as Prisma.InputJsonValue,
      erreurs: proposition.erreurs as unknown as Prisma.InputJsonValue,
      explication: proposition.explication,
      questionVerification: proposition.questionVerification,
      confiance: proposition.confiance,
      motifs: proposition.motifs as unknown as Prisma.InputJsonValue,
      modele,
      promptVersion: VERSION_PROMPT_CORRECTION,
    },
    select: { id: true },
  });

  return { correctionId: creee.id, proposition, modele };
}
