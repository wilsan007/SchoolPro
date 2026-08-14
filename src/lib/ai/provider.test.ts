import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postJson, AiUnavailableError } from "@/lib/ai/provider";
import { ollamaProvider } from "@/lib/ai/providers/ollama";
import { groqProvider } from "@/lib/ai/providers/groq";
import { glmProvider } from "@/lib/ai/providers/glm";

/**
 * Ces tests portent sur le **contrat de défaillance** des fournisseurs, pas sur
 * leur capacité à produire du texte : c'est ce contrat qui permet au routeur de
 * basculer d'un fournisseur à l'autre sans faire échouer l'opération.
 */

const ENV_KEYS = [
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "GLM_API_KEY",
  "GLM_MODEL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("postJson — classification des échecs", () => {
  it("convertit un quota dépassé (429) en indisponibilité, pour laisser le routeur basculer", async () => {
    mockFetch(429, "rate limit exceeded");
    await expect(postJson("https://x/y", {}, {}, "groq")).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("convertit une panne serveur (503) en indisponibilité", async () => {
    mockFetch(503, "service unavailable");
    await expect(postJson("https://x/y", {}, {}, "groq")).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("convertit une clé refusée (401) en indisponibilité", async () => {
    mockFetch(401, "invalid api key");
    await expect(postJson("https://x/y", {}, {}, "groq")).rejects.toBeInstanceOf(AiUnavailableError);
  });

  // Distinction délibérée : un 400 vient d'un payload que NOUS avons mal
  // construit. Basculer sur un autre fournisseur reproduirait l'erreur tout en
  // masquant le bug — il doit donc remonter.
  it("laisse remonter un payload invalide (400) au lieu de le masquer", async () => {
    mockFetch(400, "invalid request body");
    const p = postJson("https://x/y", {}, {}, "groq");
    await expect(p).rejects.toThrow(/400/);
    await expect(p).rejects.not.toBeInstanceOf(AiUnavailableError);
  });

  it("convertit une panne réseau en indisponibilité", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(postJson("https://x/y", {}, {}, "ollama")).rejects.toBeInstanceOf(
      AiUnavailableError
    );
  });
});

describe("isAvailable — sans configuration, aucun fournisseur ne s'annonce disponible", () => {
  it("ollama exige OLLAMA_BASE_URL", () => {
    expect(ollamaProvider.isAvailable()).toBe(false);
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    expect(ollamaProvider.isAvailable()).toBe(true);
  });

  it("groq exige GROQ_API_KEY", () => {
    expect(groqProvider.isAvailable()).toBe(false);
    process.env.GROQ_API_KEY = "gsk_test";
    expect(groqProvider.isAvailable()).toBe(true);
  });

  it("glm exige clé ET modèle — une clé seule ne suffit pas", () => {
    expect(glmProvider.isAvailable()).toBe(false);
    process.env.GLM_API_KEY = "sk-test";
    expect(glmProvider.isAvailable()).toBe(false);
    process.env.GLM_MODEL = "z-ai/glm-4.6";
    expect(glmProvider.isAvailable()).toBe(true);
  });
});

describe("ordre de coût", () => {
  // Le routeur trie sur ce champ : l'inverser enverrait tout le trafic
  // sur le fournisseur payant.
  it("classe le local gratuit avant le cloud gratuit, avant le payant", () => {
    expect(ollamaProvider.costTier).toBeLessThan(groqProvider.costTier);
    expect(groqProvider.costTier).toBeLessThan(glmProvider.costTier);
  });
});

describe("ollama", () => {
  it("refuse une tâche à outils au lieu de renvoyer une réponse dégradée", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    await expect(
      ollamaProvider.generate([{ role: "user", content: "x" }], {
        tools: [
          { type: "function", function: { name: "f", description: "d", parameters: {} } },
        ],
      })
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("renseigne toujours la traçabilité du modèle et du prompt", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.OLLAMA_MODEL = "gemma2:2b";
    mockFetch(200, {
      model: "gemma2:2b",
      message: { role: "assistant", content: "Bonjour" },
      prompt_eval_count: 12,
      eval_count: 5,
    });

    const r = await ollamaProvider.generate([{ role: "user", content: "Salut" }], {
      promptVersion: "test-v1",
    });

    expect(r.content).toBe("Bonjour");
    expect(r.meta.providerName).toBe("ollama");
    expect(r.meta.modelName).toBe("gemma2:2b");
    expect(r.meta.promptVersion).toBe("test-v1");
    expect(r.meta.tokensIn).toBe(12);
    expect(r.meta.tokensOut).toBe(5);
    expect(r.meta.cached).toBe(false);
  });

  it("n'envoie que role/content — les champs de tool calling casseraient l'API Ollama", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    const spy = mockFetch(200, { message: { content: "ok" } });

    await ollamaProvider.generate([
      { role: "assistant", content: "x", tool_call_id: "abc", tool_calls: [] },
    ]);

    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0]).toEqual({ role: "assistant", content: "x" });
  });
});

describe("groq", () => {
  it("remonte le texte, les appels d'outils et la consommation de tokens", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    mockFetch(200, {
      model: "llama-3.1-8b-instant",
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: "call_1", function: { name: "lister", arguments: '{"a":1}' } }],
          },
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 8 },
    });

    const r = await groqProvider.generate([{ role: "user", content: "liste" }], {
      promptVersion: "tools-v1",
    });

    expect(r.toolCalls).toEqual([{ id: "call_1", name: "lister", arguments: '{"a":1}' }]);
    expect(r.meta.tokensIn).toBe(30);
    expect(r.meta.tokensOut).toBe(8);
    expect(r.meta.providerName).toBe("groq");
  });

  it("échoue explicitement plutôt que d'envoyer un Bearer vide", async () => {
    await expect(groqProvider.generate([{ role: "user", content: "x" }])).rejects.toThrow(
      /GROQ_API_KEY/
    );
  });
});
