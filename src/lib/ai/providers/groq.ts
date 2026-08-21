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
  contientImage,
  postJson,
  listeModeles,
  type AiProvider,
  type AiMessage,
  type AiGenerateOptions,
  type AiResult,
  type AiToolCall,
} from "@/lib/ai/provider";

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.1-8b-instant";

/**
 * Modèle multimodal par défaut, servi par le même quota gratuit.
 *
 * Le modèle texte configuré (`llama-3.1-8b-instant`) ne lit pas les images : lui
 * envoyer un scan produirait une réponse plausible et entièrement inventée — le
 * pire des résultats pour une copie d'élève. D'où un modèle dédié, choisi
 * séparément.
 */
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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
    return process.env.GROQ_MODEL ?? DEFAULT_MODEL;
  },

  modelIds() {
    return listeModeles(process.env.GROQ_MODEL, DEFAULT_MODEL);
  },

  visionModelId() {
    // `"off"` désactive la lecture d'images chez ce fournisseur sans avoir à lui
    // retirer sa clé — utile à un établissement qui accepte l'IA sur du texte
    // mais pas l'envoi de copies d'élèves à un tiers.
    const configure = process.env.GROQ_VISION_MODEL ?? DEFAULT_VISION_MODEL;
    return configure === "off" ? null : configure;
  },

  async generate(messages: AiMessage[], options?: AiGenerateOptions): Promise<AiResult> {
    const apiKey = process.env.GROQ_API_KEY;
    const avecImage = messages.some(contientImage);
    const model = avecImage
      ? (groqProvider.visionModelId() ?? DEFAULT_VISION_MODEL)
      : (process.env.GROQ_MODEL ?? DEFAULT_MODEL);
    const baseUrl = process.env.GROQ_API_BASE_URL ?? DEFAULT_BASE_URL;

    // `isAvailable()` est vérifié par le routeur, mais un appel direct reste
    // possible : on échoue explicitement plutôt que d'envoyer un Bearer vide.
    if (!apiKey) {
      throw new Error("groq : GROQ_API_KEY absent de l'environnement");
    }

    const started = Date.now();
    const data = (await postJson(
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
    )) as OpenAiCompatibleResponse;

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
