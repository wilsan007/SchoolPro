/**
 * Diagnostic des fournisseurs IA (LEARNOS)
 * ========================================
 *
 *   npx tsx scripts/test-ai-providers.ts
 *
 * Vérifie, dans l'ordre :
 *   1. quels fournisseurs sont configurés dans .env ;
 *   2. qu'un appel réel aboutit, et lequel a répondu ;
 *   3. que le cache évite un second appel réseau.
 *
 * Aucune écriture métier : seules les tables techniques AiCache et
 * AiDecisionLog sont alimentées, comme en fonctionnement normal.
 */

import { PrismaClient } from "@prisma/client";

/**
 * Le routeur consomme le singleton `@/lib/prisma`, configuré avec `log:
 * ["error"]`. Sur une base sans établissement, l'échec — attendu — d'écriture
 * du journal de décisions déverserait une trace Prisma à chaque appel et
 * noierait le diagnostic. On amorce donc le singleton global avec un client
 * silencieux AVANT que le routeur ne soit chargé (d'où l'import différé dans
 * `main()` : un import statique s'exécuterait trop tôt).
 */
const prisma = new PrismaClient({ log: [] });
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

function ligne(char = "─") {
  console.log(char.repeat(64));
}

async function main() {
  const { routeAi, availableProviders } = await import("../src/lib/ai/router");
  const { AiAllProvidersFailedError } = await import("../src/lib/ai/provider");

  ligne("═");
  console.log("  DIAGNOSTIC DES FOURNISSEURS IA — LEARNOS");
  ligne("═");

  // ── 1. Configuration détectée ───────────────────────────────────
  console.log("\n1. Configuration détectée dans .env\n");

  const variables: [string, string | undefined, string][] = [
    ["OLLAMA_BASE_URL", process.env.OLLAMA_BASE_URL, "local, gratuit illimité"],
    ["OLLAMA_MODEL", process.env.OLLAMA_MODEL, "(défaut : gemma2:2b)"],
    ["GROQ_API_KEY", process.env.GROQ_API_KEY && "gsk_…(masquée)", "cloud, palier gratuit"],
    ["GROQ_MODEL", process.env.GROQ_MODEL, "(défaut : llama-3.1-8b-instant)"],
    ["GLM_API_KEY", process.env.GLM_API_KEY && "sk-…(masquée)", "payant à l'usage"],
    ["GLM_MODEL", process.env.GLM_MODEL, ""],
  ];
  for (const [cle, valeur, note] of variables) {
    const etat = valeur ? `✓ ${valeur}` : "— absent";
    console.log(`   ${cle.padEnd(18)} ${etat.padEnd(30)} ${note}`);
  }

  const dispo = availableProviders();
  console.log(`\n   Fournisseurs utilisables : ${dispo.length ? dispo.join(" → ") : "AUCUN"}`);
  console.log(`   Avec function calling    : ${availableProviders(true).join(" → ") || "AUCUN"}`);

  if (dispo.length === 0) {
    console.log("\n❌ Aucun fournisseur configuré.");
    console.log("   Renseignez OLLAMA_BASE_URL (gratuit local) ou GROQ_API_KEY dans .env.");
    return;
  }

  // Le journal des décisions exige un tenant existant (clé étrangère).
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) {
    console.log(
      "\n⚠️  Aucun établissement en base : le test LLM fonctionne, mais la décision\n" +
        "   n'est pas journalisée dans AiDecisionLog (contrainte de clé étrangère).\n" +
        "   C'est le comportement voulu — la journalisation ne casse jamais l'opération."
    );
    // On vient de l'expliquer : le routeur signale chaque échec d'écriture avec
    // sa trace complète (utile en production, illisible ici). On le tait.
    console.error = () => {};
  }

  const tache = {
    complexity: "simple" as const,
    promptVersion: "diagnostic-v1",
    action: "diagnostic.ping",
    tenantId: tenant?.id ?? "diagnostic-sans-tenant",
  };
  const question = "Réponds en une seule phrase courte : qu'est-ce qu'une moyenne pondérée ?";
  const options = { maxTokens: 120, temperature: 0.2 };

  // ── 2. Appel réel ───────────────────────────────────────────────
  ligne();
  console.log("\n2. Appel réel au modèle\n");
  console.log(`   Question : « ${question} »\n`);

  const t0 = Date.now();
  let premier;
  try {
    premier = await routeAi(tache, [{ role: "user", content: question }], options);
  } catch (error) {
    if (error instanceof AiAllProvidersFailedError) {
      console.log("❌ Aucun fournisseur n'a pu répondre.\n");
      for (const t of error.attempts) {
        console.log(`   • ${t.provider} : ${t.reason}`);
      }
      console.log(
        "\n   Si ollama figure ci-dessus : le service tourne-t-il ?\n" +
          "   Vérifiez avec  curl http://localhost:11434/api/tags"
      );
      return;
    }
    throw error;
  }
  const dureeTotale = Date.now() - t0;

  console.log(`   ✓ Réponse obtenue en ${dureeTotale} ms\n`);
  console.log(`   « ${premier.content?.trim()} »\n`);
  console.log(`   Fournisseur : ${premier.meta.providerName}`);
  console.log(`   Modèle      : ${premier.meta.modelName}`);
  console.log(`   Latence     : ${premier.meta.latencyMs} ms`);
  console.log(
    `   Tokens      : ${premier.meta.tokensIn ?? "?"} entrée / ${premier.meta.tokensOut ?? "?"} sortie`
  );

  if (premier.meta.providerName === "glm") {
    console.log(
      "\n   ⚠️  C'est le fournisseur PAYANT qui a répondu. Pour du gratuit,\n" +
        "      configurez OLLAMA_BASE_URL ou GROQ_API_KEY."
    );
  } else {
    console.log("\n   ✅ Fournisseur GRATUIT — aucun coût pour cet appel.");
  }

  // ── 3. Cache ────────────────────────────────────────────────────
  ligne();
  console.log("\n3. Cache (la même question ne doit pas repayer un appel)\n");

  const second = await routeAi(tache, [{ role: "user", content: question }], options);

  if (second.meta.cached) {
    console.log(`   ✅ Servi depuis le cache — 0 appel réseau, 0 attente.`);
  } else {
    console.log("   ⚠️  Non servi par le cache — vérifiez l'accès à la table AiCache.");
  }

  // ── 4. Function calling ─────────────────────────────────────────
  // Chemin distinct : le modèle local ne sait pas appeler d'outil, donc c'est
  // ici — et seulement ici — que le fournisseur payant peut être sollicité.
  // Ce test vérifie qu'un fournisseur GRATUIT couvre bien ce cas.
  ligne();
  console.log("\n4. Function calling (le chemin qui, sans Groq, coûte de l'argent)\n");

  const avecOutils = availableProviders(true);
  if (avecOutils.length === 0) {
    console.log("   ⚠️  Aucun fournisseur ne supporte les outils. Configurez GROQ_API_KEY.");
  } else {
    console.log(`   Chaîne : ${avecOutils.join(" → ")}\n`);
    try {
      const outil = await routeAi(
        { ...tache, action: "diagnostic.tools", promptVersion: "diagnostic-tools-v1" },
        [
          {
            role: "user",
            content: "Enregistre la note 14 sur 20 de l'élève Amina en mathématiques.",
          },
        ],
        {
          maxTokens: 200,
          temperature: 0,
          tools: [
            {
              type: "function",
              function: {
                name: "enregistrer_note",
                description: "Enregistre la note d'un élève dans une matière.",
                parameters: {
                  type: "object",
                  properties: {
                    eleve: { type: "string", description: "Prénom de l'élève" },
                    matiere: { type: "string", description: "Matière concernée" },
                    valeur: { type: "number", description: "Note obtenue" },
                    noteMax: { type: "number", description: "Barème" },
                  },
                  required: ["eleve", "matiere", "valeur"],
                },
              },
            },
          ],
        }
      );

      console.log(`   Fournisseur : ${outil.meta.providerName} (${outil.meta.modelName})`);
      if (outil.toolCalls.length > 0) {
        console.log(`   Outil appelé : ${outil.toolCalls[0].name}`);
        console.log(`   Arguments    : ${outil.toolCalls[0].arguments}`);
      } else {
        console.log("   ⚠️  Aucun appel d'outil — le modèle a répondu en texte libre.");
      }

      if (outil.meta.providerName === "glm") {
        console.log("\n   ⚠️  Fournisseur PAYANT. Vérifiez que GROQ_API_KEY est valide.");
      } else {
        console.log("\n   ✅ Fournisseur GRATUIT — le payant n'est plus jamais sollicité.");
      }
    } catch (error) {
      if (error instanceof AiAllProvidersFailedError) {
        console.log("   ❌ Échec :\n");
        for (const t of error.attempts) console.log(`   • ${t.provider} : ${t.reason}`);
      } else {
        throw error;
      }
    }
  }

  ligne("═");
  console.log("  Diagnostic terminé.");
  ligne("═");
}

main()
  .catch((e) => {
    console.error("\n❌ Erreur :", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
