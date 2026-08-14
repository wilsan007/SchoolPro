/**
 * EcolPro — Client Assistant IA (GLM via OpenRouter, API compatible OpenAI)
 * ============================================================
 * Variables d'environnement :
 *   GLM_API_KEY=...
 *   GLM_API_BASE_URL=https://openrouter.ai/api/v1
 *   GLM_MODEL=z-ai/glm-4.6   (identifiant exact affiché sur openrouter.ai/models)
 *
 * Si la clé ou le modèle sont absents, l'appel échoue avec une erreur
 * explicite (contrairement aux canaux de notification, on ne peut pas
 * "simuler" un texte généré par IA sans induire l'utilisateur en erreur).
 */

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON brut renvoyé par le modèle — à parser et valider par l'appelant
}

/**
 * Fragment d'un message multimodal (format OpenAI, accepté tel quel par
 * OpenRouter). Défini ici et non importé de `provider.ts` : ce client est plus
 * ancien que l'abstraction de fournisseur et ne doit pas en dépendre.
 */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
}

export class AiConfigError extends Error {}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Filet de sécurité : OpenRouter route un même modèle vers plusieurs
 * fournisseurs backend, et certains ne traduisent pas le tool calling natif
 * — le modèle écrit alors son appel d'outil en texte brut au format
 * "<tool_call>nom\n<arg_key>k</arg_key><arg_value>v</arg_value>...</tool_call>"
 * au lieu de remplir le champ structuré `tool_calls`. On le détecte et le
 * convertit ici pour ne jamais laisser fuir ce format vers l'utilisateur.
 */
function parseFallbackToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const blockRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let blockMatch: RegExpExecArray | null;
  let index = 0;

  while ((blockMatch = blockRegex.exec(content))) {
    const body = blockMatch[1];
    const nameMatch = body.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const args: Record<string, string> = {};
    const argRegex = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g;
    let argMatch: RegExpExecArray | null;
    while ((argMatch = argRegex.exec(body))) {
      args[argMatch[1].trim()] = argMatch[2].trim();
    }

    calls.push({ id: `fallback_${index++}`, name, arguments: JSON.stringify(args) });
  }

  return calls;
}

/** Retire toute balise <tool_call> résiduelle du texte, pour ne jamais l'afficher à l'utilisateur. */
function stripToolCallTags(content: string): string {
  return content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
}

/**
 * Appelle le modèle GLM configuré. Retourne le texte généré et, le cas
 * échéant, les appels d'outils (function calling) demandés par le modèle —
 * à l'appelant de les exécuter et de renvoyer leur résultat dans un tour
 * suivant (rôle "tool").
 *
 * GLM-5.2 est un modèle "raisonneur" : par défaut il consomme une partie du
 * budget de tokens à réfléchir (champ `reasoning`) avant de produire la
 * réponse finale, ce qui peut la tronquer si `maxTokens` est trop bas. Pour
 * nos cas d'usage (texte court, pas de résolution de problème complexe), on
 * désactive ce raisonnement par défaut — plus rapide, moins cher, et évite
 * les réponses vides coupées par `finish_reason: "length"`.
 */
export async function generateChat(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    reasoning?: boolean;
    tools?: ToolDefinition[];
    /**
     * Modèle à employer pour cet appel, à la place de `GLM_MODEL`.
     *
     * Existe pour la lecture d'images : le modèle texte configuré ne sait pas
     * les lire, et un modèle multimodal n'a pas de raison de traiter les
     * appréciations. Absent, le comportement est inchangé.
     */
    model?: string;
  }
): Promise<ChatResult> {
  const apiKey = process.env.GLM_API_KEY;
  const model = options?.model ?? process.env.GLM_MODEL;

  if (!apiKey || !model) {
    throw new AiConfigError(
      "Assistant IA non configuré (GLM_API_KEY / GLM_MODEL manquants dans l'environnement)"
    );
  }

  const baseUrl = process.env.GLM_API_BASE_URL ?? DEFAULT_BASE_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecolpro.app";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // Recommandé par OpenRouter pour l'attribution des requêtes.
      "HTTP-Referer": appUrl,
      "X-Title": "EcolPro",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.6,
      max_tokens: options?.maxTokens ?? 400,
      reasoning: { enabled: options?.reasoning ?? false },
      ...(options?.tools ? { tools: options.tools, tool_choice: "auto" } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Erreur API IA (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  let toolCalls: ToolCall[] = (message?.tool_calls ?? []).map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })
  );
  let content: string | null = message?.content ?? null;

  if (toolCalls.length === 0 && typeof content === "string" && content.includes("<tool_call>")) {
    // On ne convertit en toolCalls que si des outils étaient réellement
    // proposés pour cet appel — sinon l'appelant (ex: generateCompletion,
    // qui ignore les toolCalls) se retrouverait avec un contenu vidé sans
    // rien à exécuter. Dans tous les cas, on nettoie la balise du texte.
    if (options?.tools && options.tools.length > 0) {
      const fallback = parseFallbackToolCalls(content);
      if (fallback.length > 0) {
        toolCalls = fallback;
        content = null;
      }
    } else {
      content = stripToolCallTags(content);
    }
  }

  return { content, toolCalls };
}

/**
 * Variante simple : retourne uniquement le texte généré (pas d'outils).
 * Si la première tentative revient vide (ex: le modèle a répété un réflexe
 * d'appel d'outil sous forme de texte alors qu'aucun outil n'était proposé),
 * on retente une fois avec une consigne explicite avant d'abandonner.
 */
export async function generateCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; reasoning?: boolean }
): Promise<string> {
  const { content } = await generateChat(messages, options);
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  const retry = await generateChat(
    [
      ...messages,
      {
        role: "user",
        content:
          "Réponds uniquement par un message en texte simple pour l'utilisateur, sans appel d'outil ni balise technique.",
      },
    ],
    options
  );
  if (typeof retry.content === "string" && retry.content.trim()) {
    return retry.content.trim();
  }

  throw new Error("Réponse IA vide ou invalide");
}
