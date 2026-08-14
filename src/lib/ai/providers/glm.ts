/**
 * Fournisseur GLM (via OpenRouter) — payant à l'usage (`costTier: 2`).
 *
 * Dernier recours du routeur : n'est sollicité que si Ollama et Groq sont
 * indisponibles, conformément à LEARNOS §38 (« Ne pas appeler un LLM lorsque
 * des règles déterministes suffisent » — et, à défaut, le moins cher d'abord).
 *
 * Ce module **enrobe** `glm-client.ts` sans le modifier : ce client est utilisé
 * en production par l'assistant emploi du temps (`api/ai/chat`), avec un
 * repli maison sur les balises `<tool_call>` que certains backends OpenRouter
 * émettent au lieu du champ structuré. Le réécrire ferait régresser cet
 * assistant sans bénéfice pour LEARNOS.
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
} from "@/lib/ai/provider";

export const glmProvider: AiProvider = {
  name: "glm",
  costTier: 2,
  supportsTools: true,

  isAvailable() {
    return Boolean(process.env.GLM_API_KEY && process.env.GLM_MODEL);
  },

  modelId() {
    return process.env.GLM_MODEL ?? "unknown";
  },

  /**
   * OpenRouter expose plusieurs modèles multimodaux ; aucun n'est supposé ici.
   * Sans `GLM_VISION_MODEL`, ce fournisseur ne reçoit aucune image — le modèle
   * texte configuré en décrirait une qu'il n'a pas vue.
   */
  visionModelId() {
    return process.env.GLM_VISION_MODEL ?? null;
  },

  async generate(messages: AiMessage[], options?: AiGenerateOptions): Promise<AiResult> {
    const started = Date.now();
    const avecImage = messages.some(contientImage);
    const modelVision = process.env.GLM_VISION_MODEL;
    if (avecImage && !modelVision) {
      throw new AiUnavailableError(
        "glm : aucun modèle vision configuré (GLM_VISION_MODEL)",
        "glm"
      );
    }

    let result: Awaited<ReturnType<typeof generateChat>>;
    try {
      result = await generateChat(messages as ChatMessage[], {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        tools: options?.tools as ToolDefinition[] | undefined,
        ...(avecImage ? { model: modelVision } : {}),
      });
    } catch (error) {
      // GLM est le dernier fournisseur essayé : convertir en indisponibilité
      // laisse le routeur produire un `AiAllProvidersFailedError` qui récapitule
      // *toutes* les tentatives. Le message d'origine (dont le code HTTP) est
      // conservé, donc rien n'est masqué.
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof AiConfigError) {
        throw new AiUnavailableError(`glm non configuré : ${reason}`, "glm");
      }
      throw new AiUnavailableError(`glm : ${reason}`, "glm");
    }

    const model = (avecImage ? modelVision : process.env.GLM_MODEL) ?? "unknown";

    return {
      content: result.content,
      toolCalls: result.toolCalls,
      meta: {
        providerName: "glm",
        modelName: model,
        modelVersion: model,
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
