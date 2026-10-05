/**
 * Fournisseur Groq — cloud à palier gratuit (`costTier: 1`).
 *
 * Deuxième choix du routeur, après Ollama : rapide et gratuit dans les limites
 * d'un quota par minute, mais les données transitent par un tiers. À réserver
 * aux tâches qu'un petit modèle local ne traite pas correctement.
 *
 * Le dépassement de quota renvoie un 429, converti en `AiUnavailableError` par
 * `postJson` : le routeur bascule alors sur le fournisseur suivant plutôt que
 * de faire échouer l'opération.
 *
 * Clé : https://console.groq.com/keys
 * API compatible OpenAI : POST /openai/v1/chat/completions
 */

import {
  AiUnavailableError,
  contientImage,
  essayerModeles,
  postJson,
  listeModeles,
  type AiProvider,
  type AiMessage,
  type AiGenerateOptions,
  type AiResult,
  type AiToolCall,
} from "@/lib/ai/provider";

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "openai/gpt-oss-20b";

interface OpenAiCompatibleResponse {
  model?: string;
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id: string; function: { name: string; arguments: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export const groqProvider: AiProvider = {
  name: "groq",
  costTier: 1,
  supportsTools: true,
  interactif: true,

  isAvailable() {
    return Boolean(process.env.GROQ_API_KEY);
  },

  modelId() {
    return groqProvider.modelIds()[0];
  },

  modelIds() {
    return listeModeles(process.env.GROQ_MODEL, DEFAULT_MODEL);
  },

  /**
   * Aucun modèle multimodal supposé : le catalogue Groq change, et un défaut
   * retiré ferait échouer chaque lecture de copie. Le modèle texte, lui, ne lit
   * pas les images — lui envoyer un scan produirait une transcription plausible
   * et entièrement inventée. Sans `GROQ_VISION_MODEL`, Groq ne reçoit donc
   * aucune image.
   */
  visionModelId() {
    // `"off"` reste accepté : c'est ainsi qu'un établissement coupait l'envoi de
    // copies d'élèves à ce tiers quand un modèle par défaut existait.
    const configure = process.env.GROQ_VISION_MODEL;
    return !configure || configure === "off" ? null : configure;
  },

  async generate(messages: AiMessage[], options?: AiGenerateOptions): Promise<AiResult> {
    const apiKey = process.env.GROQ_API_KEY;
    const avecImage = messages.some(contientImage);
    const modelVision = groqProvider.visionModelId();
    const baseUrl = process.env.GROQ_API_BASE_URL ?? DEFAULT_BASE_URL;

    // `isAvailable()` est vérifié par le routeur, mais un appel direct reste
    // possible : on échoue explicitement plutôt que d'envoyer un Bearer vide.
    if (!apiKey) {
      throw new Error("groq : GROQ_API_KEY absent de l'environnement");
    }
    if (avecImage && !modelVision) {
      throw new AiUnavailableError(
        "groq : aucun modèle vision configuré (GROQ_VISION_MODEL)",
        "groq"
      );
    }

    const started = Date.now();
    // `GROQ_MODEL` peut énumérer plusieurs modèles : chacun a son propre quota
    // par minute, et le nom envoyé à l'API doit être UN modèle, jamais la liste.
    const modeles = avecImage ? [modelVision as string] : groqProvider.modelIds();
    const { data, model } = await essayerModeles(modeles, "groq", async (model) => ({
      model,
      data: (await postJson(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages,
          temperature: options?.temperature ?? 0.6,
          max_tokens: options?.maxTokens ?? 400,
          ...(options?.tools?.length ? { tools: options.tools, tool_choice: "auto" } : {}),
        },
        { Authorization: `Bearer ${apiKey}` },
        "groq",
        options?.timeoutMs
      )) as OpenAiCompatibleResponse,
    }));

    const message = data.choices?.[0]?.message;
    const toolCalls: AiToolCall[] = (message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      content: message?.content ?? null,
      toolCalls,
      meta: {
        providerName: "groq",
        modelName: model,
        modelVersion: data.model ?? model,
        promptVersion: options?.promptVersion ?? "unversioned",
        latencyMs: Date.now() - started,
        tokensIn: data.usage?.prompt_tokens ?? null,
        tokensOut: data.usage?.completion_tokens ?? null,
        cached: false,
      },
    };
  },
};
