/**
 * EcolPro / LEARNOS — Point d'entrée du bot parent depuis un webhook
 * ==================================================================
 *
 * Sépare le *transport* (WhatsApp, SMS, Telegram) de la *logique* du bot :
 * chaque webhook appelle `repondreAuParent`, et rien d'autre.
 *
 * DEUX RÈGLES DE SÛRETÉ
 * --------------------
 * **1. Un incident ne remonte jamais au fournisseur.** Meta considère une
 * réponse non-200 comme un échec de livraison et rejoue le message, en boucle.
 * Une erreur interne ne doit donc pas se propager : elle est journalisée, le
 * webhook répond 200.
 *
 * **2. Le silence est la réponse par défaut.** Numéro inconnu, aucun enfant
 * actif, question incompréhensible : on n'envoie rien plutôt qu'un message
 * d'erreur. Répondre « ce numéro n'est rattaché à aucun élève » confirmerait
 * à un inconnu qu'il a trouvé le bon établissement.
 */

import prisma from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";
import { traducteurPour } from "@/lib/learnos/traducteur";
import {
  identifierParent,
  traiterQuestion,
  type ParentIdentifie,
} from "@/lib/learnos/bot-parent";

export interface MessageEntrant {
  telephone: string;
  texte: string;
  canal: "whatsapp" | "sms" | "telegram";
}

/** Longueur au-delà de laquelle un message entrant est tronqué avant stockage. */
const LONGUEUR_MAX_QUESTION = 1000;

export async function repondreAuParent(message: MessageEntrant): Promise<void> {
  try {
    const parent = await identifierParent(message.telephone);
    if (!parent) {
      console.log("[bot-parent] numéro non rattaché — aucune réponse envoyée");
      return;
    }

    // La langue est celle de la famille, pas celle d'un cookie : l'appelant
    // du webhook est Meta, pas un humain.
    const t = await traducteurPour(parent.langue, "learnos.bot");

    const reponse = await traiterQuestion(parent, message.texte, t);
    if (!reponse) return;

    await envoyer(message, reponse.texte);
    await journaliser(parent, message, reponse);
  } catch (error) {
    // Voir règle 1 : on avale, sans quoi Meta rejoue indéfiniment.
    console.error("[bot-parent] traitement du message entrant échoué", error);
  }
}

async function envoyer(message: MessageEntrant, texte: string): Promise<void> {
  if (message.canal === "whatsapp") {
    const resultat = await sendWhatsAppMessage(message.telephone, texte);
    if (!resultat.success) {
      console.error("[bot-parent] envoi WhatsApp échoué :", resultat.error);
    }
    return;
  }
  // SMS et Telegram passeront par le même point d'entrée le jour où le canal
  // est ouvert ; les laisser silencieux vaut mieux qu'un envoi sur le mauvais
  // transport.
  console.warn(`[bot-parent] canal ${message.canal} non encore branché`);
}

async function journaliser(
  parent: ParentIdentifie,
  message: MessageEntrant,
  reponse: { intention: string; texte: string; eleveId: string | null; modele: string | null }
): Promise<void> {
  const siteId =
    parent.enfants.find((e) => e.id === reponse.eleveId)?.siteId ?? null;

  await prisma.echangeParent.create({
    data: {
      tenantId: parent.tenantId,
      siteId,
      parentId: parent.id,
      eleveId: reponse.eleveId,
      canal: message.canal,
      question: message.texte.slice(0, LONGUEUR_MAX_QUESTION),
      intention: reponse.intention,
      reponse: reponse.texte,
      modele: reponse.modele,
    },
  });
}
