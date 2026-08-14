import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    aiCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    aiDecisionLog: {
      create: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { routeAi, availableProviders, type AiTask } from "@/lib/ai/router";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";

const mockPrisma = prisma as unknown as {
  aiCache: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  aiDecisionLog: { create: ReturnType<typeof vi.fn> };
};

const ENV_KEYS = [
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "GLM_API_KEY",
  "GLM_MODEL",
  "OLLAMA_VISION_MODEL",
  "GROQ_VISION_MODEL",
  "GLM_VISION_MODEL",
] as const;

let saved: Record<string, string | undefined>;

const TASK: AiTask = {
  complexity: "simple",
  promptVersion: "test-v1",
  action: "test.action",
  tenantId: "tenant1",
};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  vi.clearAllMocks();
  mockPrisma.aiCache.findUnique.mockResolvedValue(null);
  mockPrisma.aiCache.upsert.mockResolvedValue({});
  mockPrisma.aiDecisionLog.create.mockResolvedValue({});
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

function mockFetchOnce(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Le corps d'une `Response` ne se lit qu'une fois : rendre le *même* objet à
 * chaque appel ferait échouer le deuxième avec « Body has already been read ».
 * On en construit donc un neuf à chaque interception.
 */
function mockFetchAlways(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => mockFetchOnce(status, body));
}

const OLLAMA_OK = { model: "gemma2:2b", message: { content: "réponse locale" } };
const GROQ_OK = {
  model: "llama-3.1-8b-instant",
  choices: [{ message: { content: "réponse cloud" } }],
};

describe("garde-fou déterministe", () => {
  // LEARNOS §38 : le coût d'un LLM n'est justifié que si une règle ne suffit
  // pas. Laisser passer une tâche déterministe coûterait ET rendrait le
  // résultat non reproductible.
  it("refuse une tâche déclarée déterministe au lieu d'appeler un modèle", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    const spy = vi.spyOn(globalThis, "fetch");

    await expect(
      routeAi({ ...TASK, complexity: "deterministic" }, [{ role: "user", content: "1+1" }])
    ).rejects.toThrow(/déterministe/);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("ordre de préférence par coût", () => {
  it("utilise le fournisseur local gratuit quand il répond", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";
    process.env.GLM_API_KEY = "sk-test";
    process.env.GLM_MODEL = "z-ai/glm-4.6";

    mockFetchAlways(200, OLLAMA_OK);

    const r = await routeAi(TASK, [{ role: "user", content: "bonjour" }]);

    expect(r.meta.providerName).toBe("ollama");
    expect(r.content).toBe("réponse locale");
  });

  it("bascule sur le fournisseur suivant quand le quota du premier est dépassé", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockFetchOnce(429, "rate limited"))
      .mockResolvedValueOnce(mockFetchOnce(200, GROQ_OK));

    const r = await routeAi(TASK, [{ role: "user", content: "bonjour" }]);

    expect(r.meta.providerName).toBe("groq");
    expect(r.content).toBe("réponse cloud");
  });

  it("écarte le fournisseur local pour une tâche à outils, qu'il ne sait pas traiter", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";

    const spy = mockFetchAlways(200, GROQ_OK);

    const r = await routeAi(TASK, [{ role: "user", content: "liste" }], {
      tools: [{ type: "function", function: { name: "f", description: "d", parameters: {} } }],
    });

    expect(r.meta.providerName).toBe("groq");
    // Un seul appel : Ollama n'a même pas été sollicité.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("groq.com");
  });

  it("échoue explicitement, sans inventer de réponse, quand aucun fournisseur n'est configuré", async () => {
    await expect(routeAi(TASK, [{ role: "user", content: "x" }])).rejects.toBeInstanceOf(
      AiAllProvidersFailedError
    );
  });

  it("récapitule toutes les tentatives quand tous les fournisseurs échouent", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";

    mockFetchAlways(503, "down");

    // `[\s\S]` plutôt que le drapeau `s`, non disponible avec la cible TS du projet.
    await expect(routeAi(TASK, [{ role: "user", content: "x" }])).rejects.toThrow(
      /ollama[\s\S]*groq|groq[\s\S]*ollama/
    );
  });

  it("laisse remonter une erreur applicative au lieu de la masquer par un repli", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";

    const spy = mockFetchAlways(400, "invalid payload");

    await expect(routeAi(TASK, [{ role: "user", content: "x" }])).rejects.toThrow(/400/);
    // Aucun repli : le second fournisseur n'a pas été essayé.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("cache", () => {
  it("sert une réponse mémorisée sans rappeler le modèle", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockPrisma.aiCache.findUnique.mockResolvedValue({
      id: "c1",
      cacheKey: "k",
      expiresAt: new Date(Date.now() + 60_000),
      response: {
        content: "depuis le cache",
        toolCalls: [],
        meta: {
          providerName: "ollama",
          modelName: "gemma2:2b",
          modelVersion: "gemma2:2b",
          promptVersion: "test-v1",
          latencyMs: 12,
          tokensIn: 1,
          tokensOut: 2,
          cached: false,
        },
      },
    });
    const spy = vi.spyOn(globalThis, "fetch");

    const r = await routeAi(TASK, [{ role: "user", content: "bonjour" }]);

    expect(r.content).toBe("depuis le cache");
    expect(r.meta.cached).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignore et purge une entrée périmée", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockPrisma.aiCache.findUnique.mockResolvedValue({
      id: "c1",
      cacheKey: "k",
      expiresAt: new Date(Date.now() - 60_000),
      response: { content: "périmé", toolCalls: [], meta: {} },
    });
    mockPrisma.aiCache.delete.mockResolvedValue({});
    mockFetchAlways(200, OLLAMA_OK);

    const r = await routeAi(TASK, [{ role: "user", content: "bonjour" }]);

    expect(r.content).toBe("réponse locale");
    expect(mockPrisma.aiCache.delete).toHaveBeenCalled();
  });

  // Sans cela, changer OLLAMA_MODEL servirait indéfiniment les sorties de
  // l'ancien modèle.
  it("change de clé quand le modèle configuré change", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockFetchAlways(200, OLLAMA_OK);

    process.env.OLLAMA_MODEL = "gemma2:2b";
    await routeAi(TASK, [{ role: "user", content: "bonjour" }]);
    const premiereCle = mockPrisma.aiCache.findUnique.mock.calls[0][0].where.cacheKey;

    process.env.OLLAMA_MODEL = "llama3.2";
    await routeAi(TASK, [{ role: "user", content: "bonjour" }]);
    const secondeCle = mockPrisma.aiCache.findUnique.mock.calls[1][0].where.cacheKey;

    expect(secondeCle).not.toBe(premiereCle);
  });

  it("n'échoue pas si l'écriture du cache échoue — la génération est déjà obtenue", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockPrisma.aiCache.upsert.mockRejectedValue(new Error("base indisponible"));
    mockFetchAlways(200, OLLAMA_OK);

    const r = await routeAi(TASK, [{ role: "user", content: "bonjour" }]);
    expect(r.content).toBe("réponse locale");
  });
});

describe("traçabilité", () => {
  it("journalise la décision avec le modèle et la version de prompt", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockFetchAlways(200, OLLAMA_OK);

    await routeAi(
      { ...TASK, action: "evidence.classify", inputRef: "ev_1", siteId: "site1" },
      [{ role: "user", content: "analyse" }]
    );

    const data = mockPrisma.aiDecisionLog.create.mock.calls[0][0].data;
    expect(data.action).toBe("evidence.classify");
    expect(data.inputRef).toBe("ev_1");
    expect(data.siteId).toBe("site1");
    expect(data.tenantId).toBe("tenant1");
    expect(data.providerName).toBe("ollama");
    expect(data.promptVersion).toBe("test-v1");
  });

  it("distingue une décision autonome de l'IA d'une demande d'un utilisateur", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockFetchAlways(200, OLLAMA_OK);

    await routeAi(TASK, [{ role: "user", content: "x" }]);
    expect(mockPrisma.aiDecisionLog.create.mock.calls[0][0].data.actorType).toBe("AI");

    await routeAi({ ...TASK, actorId: "user1" }, [{ role: "user", content: "y" }]);
    expect(mockPrisma.aiDecisionLog.create.mock.calls[1][0].data.actorType).toBe("USER");
  });

  it("n'échoue pas si la journalisation échoue — LEARNOS ne doit pas casser l'ERP", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockPrisma.aiDecisionLog.create.mockRejectedValue(new Error("base indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchAlways(200, OLLAMA_OK);

    const r = await routeAi(TASK, [{ role: "user", content: "bonjour" }]);
    expect(r.content).toBe("réponse locale");
  });
});

describe("repli sur sortie inexploitable", () => {
  // Un fournisseur 200 qui répond hors format n'est pas un succès : sans
  // validateur, l'appelant reçoit du texte libre là où il attendait du JSON
  // structuré, et conclut à « aucun résultat » sans savoir que le fournisseur
  // suivant l'aurait produit.
  it("essaie le fournisseur suivant quand le validateur rejette la sortie", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";

    const GROQ_JSON = {
      model: "llama-3.1-8b-instant",
      choices: [{ message: { content: '[{"nom":"A"}]' } }],
    };

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockFetchOnce(200, OLLAMA_OK)) // prose, pas du JSON
      .mockResolvedValueOnce(mockFetchOnce(200, GROQ_JSON));

    const r = await routeAi(TASK, [{ role: "user", content: "x" }], {
      validate: (res) => res.content?.trim().startsWith("[") ?? false,
    });

    expect(r.meta.providerName).toBe("groq");
    // Ollama a été sollicité puis rejeté, Groq a répondu avec du JSON.
    expect(r.content).toBe('[{"nom":"A"}]');
  });

  it("ne rejette rien sans validateur — la prose reste un succès légitime", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockFetchAlways(200, OLLAMA_OK);

    const r = await routeAi(TASK, [{ role: "user", content: "x" }]);
    expect(r.meta.providerName).toBe("ollama");
    expect(r.content).toBe("réponse locale");
  });

  it("échoue si tous les fournisseurs sont rejetés par le validateur", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";
    mockFetchAlways(200, OLLAMA_OK);

    await expect(
      routeAi(TASK, [{ role: "user", content: "x" }], {
        validate: () => false,
      })
    ).rejects.toThrow(/rejetée/);
  });

  it("traite un validateur qui lève comme un rejet, sans propager l'erreur", async () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockFetchOnce(200, OLLAMA_OK))
      .mockResolvedValueOnce(mockFetchOnce(200, GROQ_OK));

    let appel = 0;
    const r = await routeAi(TASK, [{ role: "user", content: "x" }], {
      validate: () => {
        appel++;
        if (appel === 1) throw new Error("bug dans le validateur");
        return true;
      },
    });

    expect(r.meta.providerName).toBe("groq");
  });
});

describe("availableProviders", () => {
  it("ne liste que les fournisseurs réellement configurés", () => {
    expect(availableProviders()).toEqual([]);
    process.env.GROQ_API_KEY = "gsk_test";
    expect(availableProviders()).toEqual(["groq"]);
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    expect(availableProviders()).toEqual(["ollama", "groq"]);
    // Pour une tâche à outils, le local est écarté.
    expect(availableProviders(true)).toEqual(["groq"]);
  });

  it("écarte de la vision les fournisseurs sans modèle multimodal", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.GROQ_API_KEY = "gsk_test";

    // Ollama n'a pas de modèle vision par défaut (il faut l'avoir téléchargé) ;
    // Groq en a un, servi par le même quota gratuit.
    expect(availableProviders(false, true)).toEqual(["groq"]);

    process.env.OLLAMA_VISION_MODEL = "llama3.2-vision";
    expect(availableProviders(false, true)).toEqual(["ollama", "groq"]);

    // Un établissement qui refuse d'envoyer des copies d'élèves à un tiers coupe
    // la vision chez ce fournisseur sans perdre l'IA de texte.
    process.env.GROQ_VISION_MODEL = "off";
    expect(availableProviders(false, true)).toEqual(["ollama"]);
    expect(availableProviders()).toEqual(["ollama", "groq"]);
  });
});

describe("lecture d'images", () => {
  const AVEC_IMAGE = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: "Transcris cette page." },
        {
          type: "image_url" as const,
          image_url: { url: "data:image/jpeg;base64,AAAA" },
        },
      ],
    },
  ];

  it("refuse la tâche quand aucun fournisseur ne lit les images", async () => {
    // Ollama seul, sans modèle vision : échouer est le bon comportement. Un
    // modèle texte à qui l'on envoie un scan n'annonce pas qu'il ne voit rien,
    // il invente une transcription plausible.
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";

    await expect(routeAi(TASK, AVEC_IMAGE)).rejects.toBeInstanceOf(
      AiAllProvidersFailedError
    );
    await expect(routeAi(TASK, AVEC_IMAGE)).rejects.toThrow(/images/i);
  });

  it("emploie le modèle multimodal, pas le modèle texte configuré", async () => {
    process.env.GROQ_API_KEY = "gsk_test";
    process.env.GROQ_MODEL = "llama-3.1-8b-instant";
    const fetchMock = mockFetchAlways(200, {
      model: "vision",
      choices: [{ message: { content: "Exercice 1 : 3/4" } }],
    });

    const r = await routeAi(TASK, AVEC_IMAGE);
    expect(r.content).toBe("Exercice 1 : 3/4");

    const corps = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(corps.model).not.toBe("llama-3.1-8b-instant");
    // Les fragments passent tels quels : l'API de Groq est compatible OpenAI.
    expect(corps.messages[0].content[1].type).toBe("image_url");
  });
});
