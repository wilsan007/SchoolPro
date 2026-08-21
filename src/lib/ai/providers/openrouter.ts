/**
 * Fournisseurs OpenRouter — deux instances d'un même mécanisme.
 *
 * OpenRouter sert aussi bien des modèles gratuits (identifiants suffixés
 * `:free`) que des modèles facturés au jeton. Le protocole est le même, seuls
 * changent la liste de modèles et le palier de coût annoncé au routeur. D'où
 * une fabrique plutôt que deux copies :
 *
 *   - `openrouterGratuitProvider` (`costTier: 1`) — modèles `:free`, essayés
 *     AVANT le palier payant. C'est lui qui évite la facture quand le quota
 *     Groq est épuisé.
 *   - `glmProvider` (`costTier: 2`) — dernier recours facturé. Il lit
 *     `GLM_MODEL`, que l'assistant emploi du temps (`api/ai/chat`) et la
 *     génération d'appréciations utilisent aussi en direct : le laisser
 *     inchangé évite de dégrader ces deux fonctions en réglant le chatbot.
 *
 * Les deux partagent `GLM_API_KEY` et `GLM_API_BASE_URL` — c'est le même compte
 * OpenRouter. Ne pas configurer `OPENROUTER_MODELES_GRATUITS` désactive
 * simplement l'instance gratuite.
 *
 * Ce module **enrobe** `glm-client.ts` sans le modifier : ce client porte un
 * repli maison sur les balises `<tool_call>` que certains backends OpenRouter
 * émettent au lieu du champ structuré. Le réécrire ferait régresser l'assistant
 * emploi du temps sans bénéfice.
 */

import {
  generateChat,
  AiConfigError,
  type ChatMessage,
  type ToolDefinition,
} from "@/lib/ai/glm-client";
import {
  AiUnavailableError,
  contientImage,
  type AiProvider,
  type AiMessage,
  type AiGenerateOptions,
  type AiResult,
  listeModeles,
} from "@/lib/ai/provider";

interface ConfigOpenRouter {
  nom: string;
  costTier: 0 | 1 | 2;
  /** Variable portant la liste de modèles, séparés par des virgules. */
  varModeles: string;
  /** Variable portant le modèle multimodal, s'il y en a un. */
  varVision: string;
}

function creerFournisseurOpenRouter(config: ConfigOpenRouter): AiProvider {
  const fournisseur: AiProvider = {
    name: config.nom,
    costTier: config.costTier,
    supportsTools: true,
    interactif: true,

    isAvailable() {
      return Boolean(process.env.GLM_API_KEY) && fournisseur.modelIds().length > 0;
    },

    modelIds() {
      return listeModeles(process.env[config.varModeles]);
    },

    modelId() {
      return fournisseur.modelIds()[0] ?? "unknown";
    },

    /**
     * Aucun modèle multimodal supposé : sans la variable dédiée, ce
     * fournisseur ne reçoit aucune image — le modèle texte configuré en
     * décrirait une qu'il n'a pas vue.
     */
    visionModelId() {
      return process.env[config.varVision] ?? null;
    },

    async generate(messages: AiMessage[], options?: AiGenerateOptions): Promise<AiResult> {
      const started = Date.now();
      const avecImage = messages.some(contientImage);
      const modelVision = process.env[config.varVision];
      if (avecImage && !modelVision) {
        throw new AiUnavailableError(
          `${config.nom} : aucun modèle vision configuré (${config.varVision})`,
          config.nom
        );
      }

      const model = avecImage ? modelVision : (options?.model ?? fournisseur.modelIds()[0]);

      let result: Awaited<ReturnType<typeof generateChat>>;
      try {
        result = await generateChat(messages as ChatMessage[], {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          tools: options?.tools as ToolDefinition[] | undefined,
          model,
        });
      } catch (error) {
        // Convertir en indisponibilité laisse le routeur essayer le modèle
        // suivant, puis produire un `AiAllProvidersFailedError` qui récapitule
        // *toutes* les tentatives. Le message d'origine (dont le code HTTP)
        // est conservé, donc rien n'est masqué.
        const reason = error instanceof Error ? error.message : String(error);
        if (error instanceof AiConfigError) {
          throw new AiUnavailableError(`${config.nom} non configuré : ${reason}`, config.nom);
        }
        throw new AiUnavailableError(`${config.nom} : ${reason}`, config.nom);
      }

      return {
        content: result.content,
        toolCalls: result.toolCalls,
        meta: {
          providerName: config.nom,
          modelName: model ?? "unknown",
          modelVersion: model ?? "unknown",
          promptVersion: options?.promptVersion ?? "unversioned",
          latencyMs: Date.now() - started,
          // `glm-client` n'expose pas le bloc `usage` d'OpenRouter.
          tokensIn: null,
          tokensOut: null,
          cached: false,
        },
      };
    },
  };

  return fournisseur;
}

/**
 * Modèles gratuits d'OpenRouter, essayés avant tout palier payant.
 *
 * `costTier: 1` — même palier que Groq : gratuit mais contingenté. Le quota y
 * est journalier et compté par compte, là où celui de Groq est par minute et
 * par modèle : les deux se complètent bien.
 */
export const openrouterGratuitProvider = creerFournisseurOpenRouter({
  nom: "openrouter-gratuit",
  costTier: 1,
  varModeles: "OPENROUTER_MODELES_GRATUITS",
  varVision: "OPENROUTER_VISION_GRATUIT",
});

/** Palier facturé au jeton — dernier recours, et seulement s'il est configuré. */
export const glmProvider = creerFournisseurOpenRouter({
  nom: "glm",
  costTier: 2,
  varModeles: "GLM_MODEL",
  varVision: "GLM_VISION_MODEL",
});
