/**
 * EcolPro / LEARNOS — Chatbot directeur : analyse de données en langage naturel
 * ==============================================================================
 *
 * Permet au directeur, principal ou tenant-admin de poser des questions en
 * langage naturel sur les données de l'établissement. Inspiré de PowerBuddy
 * for Data Analysis, avec un garde-fou LEARNOS fondamental :
 *
 *   - L'IA **ne génère jamais de SQL**. Elle choisit un **outil fermé** parmi
 *     une liste fixe, et les données viennent de requêtes Prisma codées en dur.
 *   - L'IA ne fait que **formuler la conclusion** à partir des données.
 *   - Si la question ne correspond à aucun outil → réponse bornée qui le signale.
 *
 * POURQUOI PAS DE SQL LIBRE ?
 * ---------------------------
 *   1. **Sécurité** : un SQL libre pourrait lire des données hors périmètre
 *      (autre tenant, autre site) ou faire des écritures destructrices.
 *   2. **Reproductibilité** : deux directeurs posant la même question doivent
 *      avoir la même réponse. Un SQL généré par IA peut varier.
 *   3. **Coût** : les outils fermés sont des requêtes déterministes — gratuites.
 *      L'IA ne coûte que pour l'identification de l'intention + la formulation.
 *
 * LE PÉRIMÈTRE EST VERROUILLÉ
 * ---------------------------
 *   - Le chatbot ne répond qu'aux questions qui correspondent à un outil.
 *   - Hors périmètre → message clair : "Je ne peux répondre qu'aux questions
 *     sur l'établissement (effectifs, notes, absences, finances, programme,
 *     intelligence, risque, équité, climat, alumni, etc.)."
 *   - Aucune question sur un élève nommé, aucune donnée hors tenant/site.
 *
 * Module refactorisé en 4 sous-modules :
 *   - chatbot-queries.ts    — requêtes Prisma pures (data fetching)
 *   - chatbot-analytics.ts  — agrégations statistiques et calculs
 *   - chatbot-formatter.ts  — formatage multilingue (FR/EN/SO)
 *   - chatbot-intents.ts    — analyse d'intention et routage
 *
 * Ce fichier est un barrel qui re-exporte l'API publique inchangée.
 */

export { CHATBOT_DIRECTION_ACTIF, poserQuestion } from "./chatbot-intents";
export type { ReponseChatbot, TourConversation } from "./chatbot-intents";
