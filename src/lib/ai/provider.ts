/**
 * EcolPro / LEARNOS — Abstraction de fournisseur LLM
 * ==================================================
 *
 * Spécification LEARNOS §37 : « Créer une interface `AIProvider` permettant de
 * remplacer le fournisseur de modèle sans réécrire LEARNOS. »
 *
 * Toute opération IA de LEARNOS passe par cette interface — jamais par un
 * client concret. Le choix du fournisseur revient au routeur
 * (`src/lib/ai/router.ts`), qui privilégie le moins cher disponible.
 *
 * Contrat de défaillance
 * ----------------------
 * Un fournisseur momentanément inutilisable (quota atteint, service injoignable,
 * clé absente) lève `AiUnavailableError` : le routeur passe alors au suivant.
 * Toute autre erreur (payload invalide, bug applicatif) remonte telle quelle —
 * la masquer par un repli silencieux cacherait un défaut réel.
 */

/**
 * Fragment d'un message multimodal.
 *
 * La forme suit celle de l'API OpenAI parce que Groq et OpenRouter l'acceptent
 * telle quelle : un message dont le contenu est un tableau de fragments passe
 * sans conversion. Les fournisseurs qui parlent un autre dialecte (Ollama, qui
 * attend un champ `images` séparé) convertissent chez eux.
 */
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  /**
   * Texte, ou fragments quand le message porte une ou plusieurs images (OCR de
   * copies, lecture d'un programme scanné).
   */
  content: string | AiContentPart[] | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

/** Le message porte-t-il au moins une image ? */
export function contientImage(message: AiMessage): boolean {
  return Array.isArray(message.content) && message.content.some((p) => p.type === "image_url");
}

/** Texte seul d'un message, images écartées. Sert aux fournisseurs texte. */
export function texteDeMessage(message: AiMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export interface AiToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiToolCall {
  id: string;
  name: string;
  /** JSON brut renvoyé par le modèle — à parser ET valider par l'appelant. */
  arguments: string;
}

/**
 * Traçabilité obligatoire (LEARNOS §37 et §40) : toute sortie de modèle doit
 * pouvoir être rattachée au modèle et au prompt qui l'ont produite, sans quoi
 * une recommandation devient inexplicable a posteriori.
 */
export interface AiGenerationMeta {
  providerName: string;
  modelName: string;
  modelVersion: string;
  promptVersion: string;
  latencyMs: number;
  /** `null` quand le fournisseur ne remonte pas la consommation. */
  tokensIn: number | null;
  tokensOut: number | null;
  /** Vrai lorsque la réponse provient du cache et non d'un appel réseau. */
  cached: boolean;
}

export interface AiResult {
  content: string | null;
  toolCalls: AiToolCall[];
  meta: AiGenerationMeta;
}

export interface AiGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: AiToolDefinition[];
  /** Version du prompt, propagée dans `meta` puis dans `AiDecisionLog`. */
  promptVersion?: string;
  /** Coupe l'appel au-delà de ce délai (défaut : 30 s). */
  timeoutMs?: number;
  /**
   * Validateur de sortie, optionnel.
   *
   * Un fournisseur peut répondre avec un statut 200 et un contenu pourtant
   * inutilisable : un petit modèle local renvoie de la prose là où l'appelant
   * attend un JSON structuré. Sans ce crochet, le routeur servirait cette
   * réponse telle quelle — et l'appelant conclurait à « aucun résultat » sans
   * comprendre que le fournisseur suivant l'aurait produit.
   *
   * Quand le validateur renvoie `false` (ou lève), le routeur essaie le
   * fournisseur suivant au lieu de retourner la sortie invalide. Le validateur
   * ne doit faire confiance qu'au contenu (`result.content`,
   * `result.toolCalls`), jamais au fait que la requête ait réussi.
   */
  validate?: (result: AiResult) => boolean;
}

export interface AiProvider {
  readonly name: string;
  /**
   * Coût indicatif — le routeur essaie les fournisseurs par ordre croissant.
   * 0 = local/gratuit illimité, 1 = cloud à palier gratuit, 2 = payant à l'usage.
   */
  readonly costTier: 0 | 1 | 2;
  /** Le fournisseur supporte-t-il le function calling ? */
  readonly supportsTools: boolean;
  /** `false` si la configuration est absente : le routeur passe au suivant. */
  isAvailable(): boolean;
  /**
   * Modèle actuellement configuré. Entre dans la clé de cache : changer de
   * modèle dans l'environnement doit invalider les réponses mémorisées, sans
   * quoi on servirait indéfiniment les sorties de l'ancien modèle.
   */
  modelId(): string;
  /**
   * Modèle capable de lire des images, ou `null` si ce fournisseur n'en a pas.
   *
   * Modèle **distinct** de `modelId()` et non simple drapeau : lire une copie
   * manuscrite et rédiger une appréciation ne se font pas avec le même modèle,
   * et un fournisseur configuré en texte seul ne doit pas se voir confier un
   * scan — il répondrait en décrivant l'image qu'il n'a pas reçue.
   */
  visionModelId(): string | null;
  generate(messages: AiMessage[], options?: AiGenerateOptions): Promise<AiResult>;
}

/**
 * Fournisseur momentanément indisponible — le routeur doit essayer le suivant.
 * À distinguer d'une erreur applicative, qui elle doit remonter.
 */
export class AiUnavailableError extends Error {
  constructor(
    message: string,
    readonly providerName: string
  ) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Aucun fournisseur n'a pu répondre. */
export class AiAllProvidersFailedError extends Error {
  constructor(
    message: string,
    readonly attempts: { provider: string; reason: string }[]
  ) {
    super(message);
    this.name = "AiAllProvidersFailedError";
  }
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * POST JSON avec délai maximal, et classification des échecs.
 *
 * La distinction est délibérée : un 400 signale un payload que *nous* avons mal
 * construit — le repli sur un autre fournisseur produirait la même erreur en
 * masquant le bug. Les autres cas (quota, panne, clé refusée, réseau) sont des
 * indisponibilités du fournisseur, pour lesquelles le repli est le bon geste.
 */
export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  providerName: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Réseau injoignable, DNS, ou dépassement du délai.
    const reason = error instanceof Error ? error.message : String(error);
    throw new AiUnavailableError(`${providerName} injoignable : ${reason}`, providerName);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const extrait = text.slice(0, 300);

    if (res.status === 400) {
      // Exception à la règle « 400 = notre faute » : certains fournisseurs
      // (Groq) répondent 400 `failed_generation` quand la REQUÊTE est correcte
      // mais que le modèle n'a pas su produire l'appel d'outil demandé. C'est
      // une défaillance de génération, pas un payload invalide — et c'est
      // exactement le cas que la chaîne de repli existe pour absorber.
      //
      // La reconnaissance est volontairement étroite : hors de ce marqueur, un
      // 400 continue de remonter, sinon on masquerait un vrai bug d'appel en
      // le rejouant chez trois fournisseurs successifs.
      if (extrait.includes("failed_generation")) {
        throw new AiUnavailableError(
          `${providerName} n'a pas su produire la sortie structurée demandée`,
          providerName
        );
      }
      throw new Error(`${providerName} a rejeté la requête (400) : ${extrait}`);
    }
    throw new AiUnavailableError(
      `${providerName} indisponible (${res.status}) : ${extrait}`,
      providerName
    );
  }

  return res.json();
}
