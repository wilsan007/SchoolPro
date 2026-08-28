/**
 * Fournisseur Ollama — modèle local, gratuit et illimité (`costTier: 0`).
 *
 * C'est le fournisseur privilégié par le routeur : aucune donnée pédagogique ne
 * quitte l'infrastructure, et aucun coût par appel. Adapté au contexte visé par
 * LEARNOS §48 (connexion intermittente, budget contraint) — un poste enseignant
 * ou un petit serveur d'établissement suffit.
 *
 * Installation :
 *   1. https://ollama.com  →  installer
 *   2. `ollama pull gemma2:2b`   (≈1,6 Go, tourne sur 8 Go de RAM)
 *   3. renseigner OLLAMA_BASE_URL dans .env
 *
 * API : POST {base}/api/chat  (documentée sur github.com/ollama/ollama)
 */

import {
  postJson,
  AiUnavailableError,
  contientImage,
  texteDeMessage,
  listeModeles,
  type AiProvider,
  type AiMessage,
  type AiGenerateOptions,
  type AiResult,
} from "@/lib/ai/provider";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "gemma2:2b";

/**
 * Ollama attend les images à part du texte, en base64 nu — pas de fragments
 * `image_url` ni de préfixe `data:`. La conversion se fait donc ici, et non dans
 * l'appelant, qui n'a pas à connaître le dialecte de chaque fournisseur.
 */
function versMessageOllama(message: AiMessage): {
  role: string;
  content: string;
  images?: string[];
} {
  if (!contientImage(message)) {
    return { role: message.role, content: texteDeMessage(message) };
  }
  const images = (Array.isArray(message.content) ? message.content : [])
    .filter((p): p is { type: "image_url"; image_url: { url: string } } => p.type === "image_url")
    // `data:image/png;base64,XXX` → `XXX`
    .map((p) => p.image_url.url.replace(/^data:[^;]+;base64,/, ""));
  return { role: message.role, content: texteDeMessage(message), images };
}

interface OllamaResponse {
  model?: string;
  message?: { role?: string; content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export const ollamaProvider: AiProvider = {
  name: "ollama",
  costTier: 0,
  // Le tool calling d'Ollama dépend du modèle chargé : les petits modèles
  // recommandés ici (gemma2:2b) ne le supportent pas. On l'annonce donc à
  // `false` — le routeur enverra les tâches à outils vers un autre fournisseur
  // plutôt que de recevoir une réponse silencieusement dégradée.
  supportsTools: false,
  get interactif() {
    return process.env.OLLAMA_INTERACTIF === "true";
  },

  isAvailable() {
    return Boolean(process.env.OLLAMA_BASE_URL);
  },

  modelId() {
    return process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  },

  modelIds() {
    return listeModeles(process.env.OLLAMA_MODEL, DEFAULT_MODEL);
  },

  /**
   * Aucune valeur par défaut, contrairement au modèle texte : un modèle vision
   * local doit avoir été téléchargé (`ollama pull llama3.2-vision`, ~8 Go).
   * Supposer sa présence ferait échouer chaque lecture de copie sur une
   * installation ordinaire, alors que le routeur peut simplement passer au
   * fournisseur suivant.
   */
  visionModelId() {
    return process.env.OLLAMA_VISION_MODEL ?? null;
  },

  async generate(messages: AiMessage[], options?: AiGenerateOptions): Promise<AiResult> {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
    if (process.env.NODE_ENV === "production" && baseUrl.startsWith("http://")) {
      throw new AiUnavailableError(
        "ollama : OLLAMA_BASE_URL doit utiliser HTTPS en production",
        "ollama"
      );
    }
    const avecImage = messages.some(contientImage);
    const modelVision = process.env.OLLAMA_VISION_MODEL;
    if (avecImage && !modelVision) {
      throw new AiUnavailableError(
        "ollama : aucun modèle vision configuré (OLLAMA_VISION_MODEL)",
        "ollama"
      );
    }
    const model = avecImage
      ? (modelVision as string)
      : (process.env.OLLAMA_MODEL ?? DEFAULT_MODEL);

    if (options?.tools && options.tools.length > 0) {
      throw new AiUnavailableError(
        "ollama : function calling non supporté par le modèle configuré",
        "ollama"
      );
    }

    const started = Date.now();
    const data = (await postJson(
      `${baseUrl}/api/chat`,
      {
        model,
        // Ollama n'accepte que `role`, `content` et `images` ; les champs de tool
        // calling provoqueraient une erreur de désérialisation côté serveur.
        messages: messages.map(versMessageOllama),
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.6,
          num_predict: options?.maxTokens ?? 400,
        },
      },
      {},
      "ollama",
      options?.timeoutMs
    )) as OllamaResponse;

    return {
      content: data.message?.content ?? null,
      toolCalls: [],
      meta: {
        providerName: "ollama",
        modelName: model,
        // Ollama ne distingue pas nom et version : le tag du modèle
        // (« gemma2:2b ») fait office de version.
        modelVersion: data.model ?? model,
        promptVersion: options?.promptVersion ?? "unversioned",
        latencyMs: Date.now() - started,
        tokensIn: data.prompt_eval_count ?? null,
        tokensOut: data.eval_count ?? null,
        cached: false,
      },
    };
  },
};
