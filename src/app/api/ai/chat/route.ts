import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import {
  generateChat,
  generateCompletion,
  AiConfigError,
  type ChatMessage,
  type ToolCall,
  type ToolDefinition,
} from "@/lib/ai/glm-client";
import {
  CRENEAU_TOOL,
  CreneauArgsSchema,
  resolveCreneauProposal,
  type CreneauProposal,
  LISTER_TOOL,
  ListerArgsSchema,
  listCreneaux,
  LISTER_CLASSES_TOOL,
  ListerClassesArgsSchema,
  listClasses,
  LISTER_ENSEIGNANTS_TOOL,
  ListerEnseignantsArgsSchema,
  listEnseignants,
  LISTER_SALLES_TOOL,
  listSalles,
  SUGGERER_TOOL,
  SuggererArgsSchema,
  suggererCreneaux,
  RESTRUCTURER_TOOL,
  RestructurerArgsSchema,
  resolveRestructuration,
} from "@/lib/ai/schedule-tool";
import type { BulkCreneauProposal } from "@/lib/emploi-du-temps/bulk-generate";
import type { Role } from "@prisma/client";
import { siteFilterForModel, siteFilterForRelation, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

type PendingAction = CreneauProposal & { type: "create_emploi_du_temps" };

interface BulkPlan {
  type: "bulk_replace_emploi_du_temps";
  classeId: string;
  classeNom: string;
  nbCreneauxExistants: number;
  plan: BulkCreneauProposal[];
  warnings: string[];
}

async function executeScheduleTool(
  call: ToolCall,
  tenantId: string,
  siteClaims: SessionSiteClaims
): Promise<{ payload: unknown; pendingAction?: PendingAction; suggestedActions?: PendingAction[]; bulkPlan?: BulkPlan }> {
  if (call.name === "proposer_creneau_emploi_du_temps") {
    try {
      const args = CreneauArgsSchema.parse(JSON.parse(call.arguments));
      const resolution = await resolveCreneauProposal(tenantId, args, siteClaims);
      if (resolution.ok) {
        return {
          payload: { ok: true, proposal: resolution.proposal },
          pendingAction: { type: "create_emploi_du_temps", ...resolution.proposal },
        };
      }
      return { payload: { ok: false, message: resolution.message } };
    } catch {
      return { payload: { ok: false, message: "Arguments invalides fournis pour la proposition de créneau." } };
    }
  }

  if (call.name === "lister_creneaux_emploi_du_temps") {
    try {
      const args = ListerArgsSchema.parse(JSON.parse(call.arguments));
      const result = await listCreneaux(tenantId, args, siteClaims);
      return { payload: result };
    } catch {
      return { payload: { ok: false, message: "Arguments invalides fournis pour la consultation de l'emploi du temps." } };
    }
  }

  if (call.name === "lister_classes") {
    try {
      const args = ListerClassesArgsSchema.parse(JSON.parse(call.arguments || "{}"));
      return { payload: await listClasses(tenantId, args, siteClaims) };
    } catch {
      return { payload: { ok: false, message: "Arguments invalides fournis pour lister les classes." } };
    }
  }

  if (call.name === "lister_enseignants") {
    try {
      const args = ListerEnseignantsArgsSchema.parse(JSON.parse(call.arguments || "{}"));
      return { payload: await listEnseignants(tenantId, args, siteClaims) };
    } catch {
      return { payload: { ok: false, message: "Arguments invalides fournis pour lister les enseignants." } };
    }
  }

  if (call.name === "lister_salles") {
    return { payload: await listSalles(tenantId, siteClaims) };
  }

  if (call.name === "suggerer_creneaux_emploi_du_temps") {
    try {
      const args = SuggererArgsSchema.parse(JSON.parse(call.arguments));
      const result = await suggererCreneaux(tenantId, args, siteClaims);
      if (!result.ok) {
        return { payload: result };
      }
      // Chaque suggestion devient directement cliquable dans l'interface,
      // sans dépendre du modèle pour rappeler proposer_creneau_emploi_du_temps.
      const suggestedActions: PendingAction[] = result.suggestions.map((s) => ({
        type: "create_emploi_du_temps",
        classeId: result.classeId,
        classeNom: result.classeNom,
        matiereId: result.matiereId,
        matiereNom: result.matiereNom,
        enseignantId: s.enseignantId,
        enseignantNom: s.enseignantNom,
        jour: s.jour,
        heureDebut: s.heureDebut,
        heureFin: s.heureFin,
        salle: s.salle,
      }));
      return { payload: result, suggestedActions };
    } catch {
      return { payload: { ok: false, message: "Arguments invalides fournis pour la suggestion de créneaux." } };
    }
  }

  if (call.name === "restructurer_emploi_du_temps") {
    try {
      const args = RestructurerArgsSchema.parse(JSON.parse(call.arguments));
      const result = await resolveRestructuration(tenantId, args, siteClaims);
      if (!result.ok) {
        return { payload: result };
      }
      const bulkPlan: BulkPlan = {
        type: "bulk_replace_emploi_du_temps",
        classeId: result.classeId,
        classeNom: result.classeNom,
        nbCreneauxExistants: result.nbCreneauxExistants,
        plan: result.plan,
        warnings: result.warnings,
      };
      // On renvoie au modèle un résumé (pas tout le plan détaillé, potentiellement
      // long) pour qu'il commente le nombre de créneaux et les avertissements.
      return {
        payload: {
          ok: true,
          classeNom: result.classeNom,
          nbCreneauxExistants: result.nbCreneauxExistants,
          nbCreneauxGeneres: result.plan.length,
          matieresUtilisees: result.matieresUtilisees,
          warnings: result.warnings,
        },
        bulkPlan,
      };
    } catch {
      return { payload: { ok: false, message: "Arguments invalides fournis pour la restructuration de l'emploi du temps." } };
    }
  }

  return { payload: { ok: false, message: "Outil inconnu." } };
}

const Schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(80),
});

// Nombre de messages de conversation (hors system prompt) transmis au
// modèle. Une conversation plus longue est tronquée aux plus récents plutôt
// que rejetée — les tâches à plusieurs étapes (ex: restructuration d'emploi
// du temps) génèrent facilement une dizaine de messages par échange.
const MAX_CONTEXT_MESSAGES = 30;

type AiScope = "ai:admin" | "ai:teacher" | "ai:parent";

function scopeForRole(role: Role): AiScope | null {
  if (role === "SUPER_ADMIN" || role === "TENANT_ADMIN" || role === "PRINCIPAL") return "ai:admin";
  if (role === "TEACHER" || role === "CLASS_TEACHER") return "ai:teacher";
  if (role === "PARENT") return "ai:parent";
  return null;
}

async function buildSystemPrompt(scope: AiScope, tenantId: string, userId: string, ecoleNom: string, siteFilter: Record<string, unknown>, absenceFilter: Record<string, unknown>, anneeCourante: string | null): Promise<string> {
  const base = `Tu es l'assistant IA intégré à EcolPro, le logiciel de gestion scolaire de "${ecoleNom}". Réponds toujours en français, de façon concise, concrète et actionnable. Si tu n'as pas une information précise, dis-le clairement plutôt que d'inventer des chiffres ou des noms.`;

  if (scope === "ai:admin") {
    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);
    const finJour = new Date();
    finJour.setHours(23, 59, 59, 999);

    const [nbEleves, nbClasses, nbAbsencesAujourdhui] = await Promise.all([
      prisma.eleve.count({ where: { tenantId, ...siteFilter, statut: "ACTIF" } }),
      prisma.classe.count({ where: { tenantId, ...siteFilter, ...(anneeCourante ? { annee: anneeCourante } : {}) } }),
      // eslint-disable-next-line ecolpro/require-site-filter -- absenceFilter = siteFilterForRelation(session.user, "eleve"), spread sous un nom de variable
      prisma.absence.count({ where: { tenantId, ...absenceFilter, ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}), date: { gte: debutJour, lte: finJour } } }),
    ]);

    return `${base}
Tu aides un directeur / chef d'établissement à être plus productif : synthèses, aide à la décision, rédaction de communications, analyse de tendances, priorisation.
Chiffres actuels de l'établissement : ${nbEleves} élèves actifs, ${nbClasses} classes, ${nbAbsencesAujourdhui} absences enregistrées aujourd'hui.
Tu n'as pas accès au détail nominatif des élèves dans cette conversation : pour des données précises sur un élève ou une classe, oriente l'utilisateur vers les écrans Élèves / Analytics / Rapports PDF.
Pour toute question ou action liée à l'emploi du temps, tu disposes d'outils de recherche à utiliser AVANT de répondre ou de proposer quoi que ce soit — ne devine jamais un nom, une disponibilité ou un horaire :
- "lister_classes" : quelles classes existent (nom, niveau, effectif).
- "lister_enseignants" : quels enseignants existent, filtrable par matière (spécialité) — utilise-le pour "trouve-moi tous les profs de français/maths".
- "lister_salles" : quelles salles existent (capacité, type, bâtiment).
- "lister_creneaux_emploi_du_temps" : les créneaux déjà occupés d'une classe.
- "suggerer_creneaux_emploi_du_temps" : calcule automatiquement les meilleurs créneaux pour une classe+matière en croisant disponibilités enseignants, conflits et salles libres — utilise-le en priorité quand on te demande de trouver ou choisir un créneau, plutôt que de tout recalculer toi-même. Chaque suggestion renvoyée est déjà cliquable (bouton "Confirmer") directement dans l'interface : tu n'as PAS besoin d'appeler ensuite "proposer_creneau_emploi_du_temps" pour les mêmes suggestions, contente-toi de les présenter clairement à l'utilisateur.
Si l'utilisateur te demande explicitement de créer un créneau précis qui ne vient pas d'une suggestion (horaire/prof/salle qu'il a lui-même choisis), utilise "proposer_creneau_emploi_du_temps" : il prépare la proposition mais ne l'exécute jamais lui-même, l'utilisateur confirme ensuite dans l'interface.
- "restructurer_emploi_du_temps" : génère un plan COMPLET de remplacement de l'emploi du temps d'une classe (toutes matières, toute la semaine). Utilise cet outil dès qu'on te demande de restructurer, régénérer ou reconstruire tout l'emploi du temps d'une classe — n'essaie jamais de faire ça en boucle avec proposer_creneau_emploi_du_temps. Trois façons d'organiser une matière, à répartir toi-même selon la demande :
  • Classe entière (défaut) : mets-la dans "matieres" sans groupesAB. Ex: Anglais, Arabe, Histoire-Géo, EPS quand toute la classe est ensemble.
  • Matière dédoublée seule (groupesAB:true dans "matieres") : les deux groupes font la MÊME matière en parallèle avec deux profs — n'utilise ça QUE si la matière a effectivement deux enseignants.
  • Matières APPARIÉES (tableau "paires") : au même créneau le groupe A fait une matière et le groupe B en fait une autre, puis on inverse à la séance suivante avec les mêmes profs. C'est LE bon choix pour "quand un groupe fait maths l'autre fait français" ou "physique-chimie / SVT par groupe". Un seul prof par matière suffit. Ex: paires=[{matiereANom:"Mathématiques", matiereBNom:"Français", heuresParSemaine:2}, {matiereANom:"Physique-Chimie", matiereBNom:"SVT", heuresParSemaine:1.5, dureeSessionMinutes:90}].
Précise dureeSessionMinutes quand une durée fixe est demandée (ex: 90 pour 1h30, 120 pour 2h). Il ne remplace RIEN tant que l'utilisateur n'a pas confirmé le plan dans l'interface (l'opération supprime alors tous les créneaux existants de la classe). Explique que c'est un remplacement total avant qu'il confirme, et signale les avertissements renvoyés (sessions non placées, écarts d'heures).`;
  }

  if (scope === "ai:teacher") {
    return `${base}
Tu aides un enseignant à gagner du temps : préparation de cours, idées d'exercices et d'évaluations, reformulation d'appréciations, conseils pédagogiques et de gestion de classe.
Tu n'as pas accès aux notes ou dossiers d'élèves réels dans cette conversation. Pour générer une appréciation basée sur les vraies notes d'un élève, dis à l'enseignant d'utiliser le bouton ✨ dans Bulletins > Conseil de classe.
Pour toute question sur l'emploi du temps, les classes, les enseignants ou les salles, utilise les outils "lister_creneaux_emploi_du_temps", "lister_classes", "lister_enseignants", "lister_salles" ou "suggerer_creneaux_emploi_du_temps" pour voir les données réelles avant de répondre — ne devine jamais.`;
  }

  // ai:parent — grounded strictly on this parent's own linked children.
  // eslint-disable-next-line ecolpro/require-site-filter -- parent scoping via userId (personal scope), not site-based access
  const parent = await prisma.parent.findFirst({
    where: { userId, tenantId },
    include: {
      // `enfants` est la liste des liens de CE parent, retrouvé par son propre
      // `userId` : le périmètre est personnel, pas géographique. Un parent peut
      // d'ailleurs avoir des enfants sur plusieurs sites, filtrer par site serait
      // faux (voir RELATION_SCOPED_ROLES dans site-scope.ts).
      // eslint-disable-next-line ecolpro/require-site-filter
      enfants: {
        include: {
          // eslint-disable-next-line ecolpro/require-site-filter -- eleve scoping via parent.userId (personal scope)
          eleve: {
            select: {
              nom: true,
              prenom: true,
              classe: { select: { nom: true, niveau: true } },
              bulletins: {
                where: { isPublie: true },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { moyenneGenerale: true, rang: true, appreciation: true },
              },
              absences: { where: { statut: "INJUSTIFIEE" }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  const enfants = parent?.enfants ?? [];
  const details = enfants
    .map(({ eleve }) => {
      const dernierBulletin = eleve.bulletins[0];
      return `- ${eleve.prenom} ${eleve.nom} (classe ${eleve.classe?.nom ?? "N/A"}) : ${
        dernierBulletin?.moyenneGenerale != null
          ? `moyenne ${dernierBulletin.moyenneGenerale.toFixed(2)}/20, rang ${dernierBulletin.rang ?? "N/A"}`
          : "pas encore de bulletin publié"
      }, ${eleve.absences.length} absence(s) injustifiée(s) au total.`;
    })
    .join("\n");

  return `${base}
Tu aides un parent à suivre la scolarité de son/ses enfant(s). Voici les SEULES données que tu as le droit d'utiliser, concernant uniquement les enfants de ce parent :
${details || "(aucun enfant lié à ce compte pour le moment)"}
Ne parle jamais d'autres élèves que ceux listés ci-dessus : tu n'as aucune information sur le reste de l'établissement.`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const scope = scopeForRole(session.user.role);
    if (!scope) {
      return NextResponse.json(
        { error: "Assistant IA non disponible pour ce rôle" },
        { status: 403 }
      );
    }
    const denied = checkPermission(session.user.role, scope);
    if (denied) return denied;

    const ip = getClientIP(req);
    const rl = rateLimit({ max: 20, windowSec: 60, key: `ai-chat:${session.user.id}:${ip}` });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const tenantId = session.user.tenantId;
    const siteFilter = siteFilterForModel("eleve", session.user);
    const absenceFilter = siteFilterForRelation(session.user, "eleve");
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const anneeCourante = await getAnneeCouranteLibelle(tenantId);
    const systemPrompt = await buildSystemPrompt(scope, tenantId, session.user.id, tenant?.name ?? "votre établissement", siteFilter, absenceFilter, anneeCourante);

    const recentMessages = parsed.data.messages.slice(-MAX_CONTEXT_MESSAGES);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages,
    ];

    // Les outils ne sont proposés au modèle que si le rôle a réellement les
    // droits correspondants — défense en profondeur : l'écriture effective
    // (création du créneau) revalide de toute façon ce droit via la route
    // /api/emploi-du-temps existante. Jamais exposés au scope "ai:parent" :
    // ces outils ne filtrent pas par élève, seulement par tenant.
    const staffScope = scope === "ai:admin" || scope === "ai:teacher";
    const canScheduleRead = staffScope && checkPermission(session.user.role, "emploi-du-temps:read") === null;
    const canScheduleWrite = scope === "ai:admin" && checkPermission(session.user.role, "emploi-du-temps:write") === null;
    const tools: ToolDefinition[] = [];
    if (canScheduleRead) {
      tools.push(LISTER_TOOL, LISTER_CLASSES_TOOL, LISTER_ENSEIGNANTS_TOOL, LISTER_SALLES_TOOL, SUGGERER_TOOL);
    }
    if (canScheduleWrite) tools.push(CRENEAU_TOOL, RESTRUCTURER_TOOL);

    // Boucle d'appels d'outils : le modèle peut d'abord consulter l'emploi du
    // temps puis, dans un tour suivant, proposer un créneau informé. Plafond
    // pour éviter une boucle infinie en cas de comportement inattendu du modèle.
    const MAX_TOOL_ROUNDS = 4;
    let pendingAction: PendingAction | undefined;
    let suggestedActions: PendingAction[] | undefined;
    let bulkPlan: BulkPlan | undefined;
    let replyText: string | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await generateChat(messages, {
        temperature: 0.7,
        maxTokens: 500,
        tools: tools.length > 0 ? tools : undefined,
      });

      if (result.toolCalls.length === 0) {
        replyText = result.content;
        break;
      }

      messages.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.toolCalls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: c.arguments },
        })),
      });

      let writeProposed = false;
      for (const call of result.toolCalls) {
        const {
          payload,
          pendingAction: actionFromCall,
          suggestedActions: suggestionsFromCall,
          bulkPlan: bulkPlanFromCall,
        } = await executeScheduleTool(call, tenantId, session.user as SessionSiteClaims);
        if (actionFromCall) {
          pendingAction = actionFromCall;
          writeProposed = true;
        }
        if (suggestionsFromCall) {
          suggestedActions = suggestionsFromCall;
        }
        if (bulkPlanFromCall) {
          bulkPlan = bulkPlanFromCall;
          writeProposed = true;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(payload) });
      }

      if (writeProposed) {
        replyText = await generateCompletion(messages, { temperature: 0.7, maxTokens: 400 });
        break;
      }
    }

    if (replyText === null) {
      replyText = await generateCompletion(messages, { temperature: 0.7, maxTokens: 400 });
    }

    if (!replyText.trim()) {
      throw new Error("Réponse IA vide");
    }

    return NextResponse.json({ reply: replyText, pendingAction, suggestedActions, bulkPlan });
  } catch (error) {
    console.error("[API/ai/chat]", error);
    if (error instanceof AiConfigError) {
      return NextResponse.json({ error: "IA non configurée" }, { status: 503 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
