/**
 * EcolPro / LEARNOS — Routeur IA hybride
 * ======================================
 *
 * Spécification LEARNOS §36 et §38 :
 *
 *   Règles déterministes  →  local gratuit  →  cloud gratuit  →  payant
 *
 * Toute opération IA de LEARNOS passe par `routeAi()`, jamais par un
 * fournisseur en direct. Cela garantit trois propriétés que le reste du
 * système suppose acquises :
 *
 *   1. **Le moins cher d'abord.** Les fournisseurs sont essayés par coût
 *      croissant ; un quota dépassé fait basculer au suivant au lieu de faire
 *      échouer l'opération.
 *   2. **Idempotence et coût maîtrisé.** Une même question posée deux fois ne
 *      coûte qu'un appel (cache 24 h, table `AiCache`).
 *   3. **Traçabilité.** Chaque décision est journalisée dans `AiDecisionLog`
 *      avec le modèle et la version de prompt qui l'ont produite (§40) —
 *      sans quoi une recommandation devient inexplicable a posteriori.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  AiUnavailableError,
  AiAllProvidersFailedError,
  contientImage,
  type AiProvider,
  type AiMessage,
  type AiGenerateOptions,
  type AiResult,
} from "@/lib/ai/provider";
import { ollamaProvider } from "@/lib/ai/providers/ollama";
import { groqProvider } from "@/lib/ai/providers/groq";
import { glmProvider } from "@/lib/ai/providers/glm";

/**
 * `deterministic` n'est pas une option de routage : c'est une assertion que la
 * tâche N'A PAS sa place ici. Le routeur la refuse (voir `routeAi`).
 */
export type AiTaskComplexity = "deterministic" | "simple" | "complex";

export interface AiTask {
  complexity: AiTaskComplexity;
  /** Versionner tout changement de prompt : entre dans la clé de cache et le journal. */
  promptVersion: string;
  /** Action journalisée, ex. "evidence.classify", "intervention.propose". */
  action: string;
  tenantId: string;
  siteId?: string | null;
  /** Entité analysée (evidenceId, eleveId…), pour remonter Insight → Evidence. */
  inputRef?: string | null;
  /** Utilisateur à l'origine de la demande, si elle n'est pas autonome. */
  actorId?: string | null;
  /**
   * Un humain attend la réponse devant son écran.
   *
   * Ne change pas QUELS fournisseurs sont candidats — seulement leur ORDRE :
   * ceux qui se déclarent trop lents pour l'interactif (le modèle local sur un
   * poste sans GPU) passent en dernier au lieu de passer en premier. La chaîne
   * reste complète, donc une installation qui n'a que le modèle local répond
   * toujours ; elle répond simplement lentement, ce qui est le comportement
   * attendu quand il n'y a rien d'autre.
   *
   * À laisser absent pour tout traitement de fond : là, le moins cher d'abord
   * reste la bonne règle (LEARNOS §36).
   */
  interactif?: boolean;
}

/** Durée de vie du cache. Une génération identique reste servie 24 h. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Ordre d'essai : trié par coût croissant à l'initialisation, pas à l'appel. */
const PROVIDERS: AiProvider[] = [ollamaProvider, groqProvider, glmProvider].sort(
  (a, b) => a.costTier - b.costTier
);

/**
 * Fournisseurs utilisables pour cette tâche, du moins cher au plus cher.
 * Un fournisseur sans function calling est écarté dès que la tâche en demande :
 * il répondrait du texte libre là où l'appelant attend un appel structuré.
 *
 * Même raisonnement, en pire, pour les images : un modèle texte à qui l'on
 * envoie une copie scannée ne répond pas « je ne vois rien », il **invente** une
 * transcription crédible. Un fournisseur sans modèle vision est donc écarté.
 */
function candidates(
  needsTools: boolean,
  needsVision = false,
  interactif = false
): AiProvider[] {
  const utilisables = PROVIDERS.filter(
    (p) =>
      p.isAvailable() &&
      (!needsTools || p.supportsTools) &&
      (!needsVision || p.visionModelId() !== null)
  );

  if (!interactif) return utilisables;

  // Tri STABLE en deux groupes : les fournisseurs assez rapides d'abord, les
  // autres ensuite. À l'intérieur de chaque groupe, l'ordre par coût croissant
  // est conservé — on ne renonce pas au « moins cher d'abord », on le
  // subordonne à « qui peut répondre pendant que l'utilisateur regarde ».
  return [
    ...utilisables.filter((p) => p.interactif),
    ...utilisables.filter((p) => !p.interactif),
  ];
}

/**
 * Clé de cache.
 *
 * Inclut la chaîne de fournisseurs candidats (nom + modèle) : changer de modèle
 * dans l'environnement invalide donc naturellement les entrées, au lieu de
 * servir indéfiniment les réponses de l'ancien modèle. Inclut aussi température
 * et longueur maximale, qui changent la sortie à prompt identique.
 */
function cacheKey(
  chain: AiProvider[],
  promptVersion: string,
  messages: AiMessage[],
  options?: AiGenerateOptions
): string {
  const material = JSON.stringify({
    chain: chain.map((p) => `${p.name}:${p.modelId()}:${p.visionModelId() ?? "-"}`),
    promptVersion,
    messages,
    temperature: options?.temperature ?? null,
    maxTokens: options?.maxTokens ?? null,
    tools: options?.tools ?? null,
  });
  return createHash("sha256").update(material).digest("hex");
}

async function readCache(key: string): Promise<AiResult | null> {
  const hit = await prisma.aiCache.findUnique({ where: { cacheKey: key } });
  if (!hit) return null;

  if (hit.expiresAt.getTime() < Date.now()) {
    // Purge paresseuse : l'entrée périmée est supprimée à la lecture, ce qui
    // évite d'avoir à planifier un nettoyage pour un volume aussi faible.
    await prisma.aiCache.delete({ where: { id: hit.id } }).catch(() => {});
    return null;
  }

  const cached = hit.response as unknown as AiResult;
  return { ...cached, meta: { ...cached.meta, cached: true } };
}

async function writeCache(key: string, result: AiResult): Promise<void> {
  const payload = {
    cacheKey: key,
    response: result as unknown as object,
    expiresAt: new Date(Date.now() + CACHE_TTL_MS),
  };
  // Le cache est une optimisation : son échec (course entre deux requêtes
  // concurrentes sur la même clé, base momentanément indisponible) ne doit
  // jamais faire échouer une génération déjà obtenue et payée.
  await prisma.aiCache
    .upsert({ where: { cacheKey: key }, create: payload, update: payload })
    .catch(() => {});
}

async function logDecision(
  task: AiTask,
  result: AiResult,
  outcome: "ok" | "failed",
  extra?: Record<string, unknown>
): Promise<void> {
  // Le type JSON récursif de Prisma n'accepte pas les interfaces sans signature
  // d'index (`AiToolCall[]`) : la conversion est purement structurelle, la
  // valeur est bien du JSON sérialisable.
  const output = {
    outcome,
    content: result.content,
    toolCalls: result.toolCalls,
    cached: result.meta.cached,
    latencyMs: result.meta.latencyMs,
    tokensIn: result.meta.tokensIn,
    tokensOut: result.meta.tokensOut,
    ...extra,
  } as unknown as Prisma.InputJsonValue;

  // Même principe que le cache : la journalisation ne doit pas casser
  // l'opération métier. Un échec d'écriture est signalé en console, pas propagé.
  await prisma.aiDecisionLog
    .create({
      data: {
        tenantId: task.tenantId,
        siteId: task.siteId ?? null,
        actorType: task.actorId ? "USER" : "AI",
        actorId: task.actorId ?? null,
        action: task.action,
        inputRef: task.inputRef ?? null,
        output,
        providerName: result.meta.providerName,
        modelName: result.meta.modelName,
        modelVersion: result.meta.modelVersion,
        promptVersion: result.meta.promptVersion,
      },
    })
    .catch((error) => {
      console.error("[learnos/ai-router] journalisation de la décision échouée", error);
    });
}

/**
 * Achemine une génération vers le fournisseur le moins cher qui réponde.
 *
 * @throws {Error} si la tâche est déclarée `deterministic` — c'est un défaut de
 *   conception à corriger côté appelant, pas une condition d'exécution.
 * @throws {AiAllProvidersFailedError} si aucun fournisseur n'a pu répondre.
 */
export async function routeAi(
  task: AiTask,
  messages: AiMessage[],
  options?: AiGenerateOptions
): Promise<AiResult> {
  if (task.complexity === "deterministic") {
    // LEARNOS §38 : « Do not call an LLM when deterministic logic is
    // sufficient. » Une tâche déterministe doit être écrite comme une règle —
    // la laisser passer ici coûterait cher ET rendrait le résultat non
    // reproductible.
    throw new Error(
      `routeAi: tâche "${task.action}" déclarée déterministe — implémentez une règle ` +
        `plutôt qu'un appel LLM (LEARNOS §38).`
    );
  }

  const needsTools = Boolean(options?.tools?.length);
  const needsVision = messages.some(contientImage);
  const chain = candidates(needsTools, needsVision, task.interactif);

  if (chain.length === 0) {
    throw new AiAllProvidersFailedError(
      needsVision
        ? "Aucun fournisseur IA configuré ne lit les images (voir GROQ_VISION_MODEL / GLM_VISION_MODEL / OLLAMA_VISION_MODEL)."
        : needsTools
          ? "Aucun fournisseur IA configuré ne supporte le function calling (voir GROQ_API_KEY / GLM_API_KEY)."
          : "Aucun fournisseur IA configuré (voir OLLAMA_BASE_URL / GROQ_API_KEY / GLM_API_KEY dans .env).",
      []
    );
  }

  const key = cacheKey(chain, task.promptVersion, messages, options);
  const cached = await readCache(key).catch(() => null);
  if (cached) {
    await logDecision(task, cached, "ok");
    return cached;
  }

  const generateOptions: AiGenerateOptions = { ...options, promptVersion: task.promptVersion };
  const attempts: { provider: string; reason: string }[] = [];

  for (const provider of chain) {
    try {
      const result = await provider.generate(messages, generateOptions);

      // Un 200 ne garantit pas une sortie exploitable : un modèle sous-capable
      // répond en prose au lieu du JSON demandé. Le validateur optionnel laisse
      // l'appelant définir ce qui est acceptable, et déclenche le repli vers le
      // fournisseur suivant quand ça ne l'est pas — plutôt que de servir une
      // réponse vide déguisée en succès.
      if (options?.validate) {
        let acceptable = false;
        try {
          acceptable = options.validate(result);
        } catch (reason) {
          acceptable = false;
        }
        if (!acceptable) {
          attempts.push({
            provider: provider.name,
            reason: "sortie rejetée par le validateur de l'appelant",
          });
          continue;
        }
      }

      await writeCache(key, result);
      await logDecision(task, result, "ok");
      return result;
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        attempts.push({ provider: provider.name, reason: error.message });
        continue; // fournisseur suivant
      }
      // Erreur applicative (payload invalide, bug) : la propager telle quelle.
      // Basculer de fournisseur la reproduirait en masquant sa cause.
      throw error;
    }
  }

  throw new AiAllProvidersFailedError(
    `Aucun fournisseur IA n'a pu traiter "${task.action}" : ` +
      attempts.map((a) => `${a.provider} (${a.reason})`).join(" ; "),
    attempts
  );
}

/** Exposé pour les tests et le diagnostic : quels fournisseurs sont utilisables ? */
export function availableProviders(needsTools = false, needsVision = false): string[] {
  return candidates(needsTools, needsVision).map((p) => p.name);
}
