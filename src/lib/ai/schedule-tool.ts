/**
 * EcolPro — Outil IA : proposition de créneau d'emploi du temps
 * ============================================================
 * L'IA ne crée JAMAIS de créneau directement. Elle résout les noms
 * (classe/matière/enseignant) en identifiants réels, vérifie les conflits
 * (mêmes règles que POST /api/emploi-du-temps), puis renvoie une proposition
 * structurée. La création effective passe par la route existante
 * POST /api/emploi-du-temps, appelée uniquement après confirmation explicite
 * de l'utilisateur dans l'interface.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import type { ToolDefinition } from "@/lib/ai/glm-client";
import { fuzzyFind, normalizeHeure } from "@/lib/text-match";
import { suggestSlots, ALL_DAYS, type CreneauSuggestion, type Jour } from "@/lib/emploi-du-temps/suggest";
import { generateBulkPlan, type MatiereCible, type PaireCible } from "@/lib/emploi-du-temps/bulk-generate";

export const CRENEAU_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "proposer_creneau_emploi_du_temps",
    description:
      "Prépare la proposition de création d'un créneau dans l'emploi du temps d'une classe (matière, enseignant, jour, horaires, salle). N'exécute AUCUNE écriture en base : l'utilisateur devra confirmer explicitement dans l'interface avant que le créneau soit réellement créé. Utilise cet outil dès qu'on te demande d'ajouter, créer ou planifier un cours dans l'emploi du temps.",
    parameters: {
      type: "object",
      properties: {
        classeNom: { type: "string", description: "Nom de la classe concernée, ex: '1ère L', 'Terminale S2'" },
        matiereNom: { type: "string", description: "Nom de la matière enseignée, ex: 'Mathématiques'" },
        enseignantNom: { type: "string", description: "Nom de l'enseignant assigné (optionnel)" },
        jour: {
          type: "string",
          enum: ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"],
        },
        heureDebut: { type: "string", description: "Heure de début sur 24h, deux chiffres:deux chiffres, ex: '08:00' (jamais '8h')" },
        heureFin: { type: "string", description: "Heure de fin sur 24h, deux chiffres:deux chiffres, ex: '09:00' (jamais '9h')" },
        salle: { type: "string", description: "Salle de cours (optionnel)" },
      },
      required: ["classeNom", "matiereNom", "jour", "heureDebut", "heureFin"],
    },
  },
};

export const LISTER_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "lister_creneaux_emploi_du_temps",
    description:
      "Liste les créneaux déjà occupés de l'emploi du temps d'une classe (matière, enseignant, salle, jour, horaires). Utilise cet outil pour répondre à toute question sur l'emploi du temps d'une classe : quels créneaux sont pris, quels créneaux sont libres (raisonne sur les trous entre les créneaux renvoyés), quel jour un cours a lieu, etc. Appelle-le AVANT de proposer un nouveau créneau si tu ne connais pas déjà l'emploi du temps de la classe.",
    parameters: {
      type: "object",
      properties: {
        classeNom: { type: "string", description: "Nom de la classe, ex: '5ème B'" },
        jour: {
          type: "string",
          enum: ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"],
          description: "Optionnel : filtrer sur un seul jour de la semaine",
        },
      },
      required: ["classeNom"],
    },
  },
};

export const ListerArgsSchema = z.object({
  classeNom: z.string().min(1),
  jour: z.enum(["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]).optional(),
});

export const LISTER_CLASSES_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "lister_classes",
    description:
      "Liste les classes de l'établissement (nom, niveau, effectif maximum). Utilise cet outil pour savoir quelles classes existent avant de proposer ou consulter un emploi du temps, ou si l'utilisateur demande simplement la liste des classes.",
    parameters: {
      type: "object",
      properties: {
        niveau: { type: "string", description: "Optionnel : filtrer sur un niveau, ex: '5ème', 'Terminale'" },
      },
      required: [],
    },
  },
};

export const ListerClassesArgsSchema = z.object({ niveau: z.string().min(1).optional() });

export const LISTER_ENSEIGNANTS_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "lister_enseignants",
    description:
      "Liste les enseignants de l'établissement, avec leur spécialité (matière). Utilise cet outil pour trouver tous les enseignants d'une matière donnée (ex: 'tous les profs de français ou de mathématiques') avant de choisir qui affecter à un créneau.",
    parameters: {
      type: "object",
      properties: {
        matiereNom: { type: "string", description: "Optionnel : filtrer sur les enseignants dont la spécialité correspond à cette matière, ex: 'Mathématiques'" },
      },
      required: [],
    },
  },
};

export const ListerEnseignantsArgsSchema = z.object({ matiereNom: z.string().min(1).optional() });

export const LISTER_SALLES_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "lister_salles",
    description: "Liste les salles de l'établissement (nom, capacité, type, bâtiment). Utilise cet outil si l'utilisateur demande quelles salles existent.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

export const SUGGERER_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "suggerer_creneaux_emploi_du_temps",
    description:
      "Calcule les meilleurs créneaux possibles pour une classe et une matière, en croisant automatiquement : les disponibilités déclarées des enseignants de cette matière, les créneaux déjà occupés (classe, enseignants, salles), et les salles libres. Renvoie une liste triée par pertinence. Utilise TOUJOURS cet outil avant de proposer un créneau si tu n'as pas déjà une disponibilité précise confirmée par l'utilisateur — il fait tout le travail de recherche (profs de la matière + disponibilité + salle) à ta place.",
    parameters: {
      type: "object",
      properties: {
        classeNom: { type: "string", description: "Nom de la classe concernée, ex: '5ème B'" },
        matiereNom: { type: "string", description: "Nom de la matière, ex: 'Mathématiques'" },
        enseignantNom: { type: "string", description: "Optionnel : se limiter à un enseignant précis déjà identifié" },
        duree: { type: "number", description: "Durée du cours en minutes (par défaut 60)" },
      },
      required: ["classeNom", "matiereNom"],
    },
  },
};

export const SuggererArgsSchema = z.object({
  classeNom: z.string().min(1),
  matiereNom: z.string().min(1),
  enseignantNom: z.string().min(1).optional(),
  // z.coerce : le parseur de secours (tool call en texte brut) ne fournit que
  // des chaînes, jamais des nombres JSON natifs.
  duree: z.coerce.number().int().min(15).max(240).optional(),
});

const JOUR_ENUM = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"] as const;

export const RESTRUCTURER_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "restructurer_emploi_du_temps",
    description:
      "Génère un plan COMPLET de remplacement de l'emploi du temps d'une classe (toutes les matières, tous les jours), sous contraintes globales. N'écrit RIEN en base : renvoie un plan que l'utilisateur devra confirmer dans l'interface (cela supprime tous les créneaux existants de la classe et les remplace). Utilise cet outil dès qu'on te demande de restructurer, régénérer ou reconstruire tout l'emploi du temps d'une classe. Trois façons d'organiser une matière : (1) classe entière (défaut) ; (2) matière dédoublée seule (groupesAB:true sur la matière — les deux groupes suivent la MÊME matière en parallèle, exige 2 profs de cette matière) ; (3) matières APPARIÉES (paires) — au même créneau le groupe A suit une matière et le groupe B en suit une autre, puis on inverse à la séance suivante avec les mêmes profs (ex: groupe A fait Maths pendant que B fait Français, puis A fait Français pendant que B fait Maths). Les paires sont le bon choix pour 'quand un groupe fait X l'autre fait Y' — un seul prof par matière suffit.",
    parameters: {
      type: "object",
      properties: {
        classeNom: { type: "string", description: "Nom de la classe concernée, ex: '3ème D'" },
        heureDebutJournee: { type: "string", description: "Heure de début de la plage quotidienne, format HH:MM, ex: '07:30'" },
        heureFinJournee: { type: "string", description: "Heure de fin de la plage quotidienne, format HH:MM, ex: '12:30'" },
        pourcentageSessions2h: { type: "number", description: "Pour les matières sans durée précisée : pourcentage cible de sessions de 2h. Défaut 80." },
        jours: {
          type: "array",
          items: { type: "string", enum: JOUR_ENUM as unknown as string[] },
          description: "Jours autorisés (défaut : lundi à samedi, sans dimanche).",
        },
        matieres: {
          type: "array",
          description:
            "Matières enseignées en classe entière OU dédoublées seules. Ne PAS inclure ici les matières mises dans 'paires'. Si 'matieres' et 'paires' sont tous deux omis, reprend l'emploi du temps existant.",
          items: {
            type: "object",
            properties: {
              matiereNom: { type: "string" },
              heuresParSemaine: { type: "number", description: "Volume hebdomadaire en heures" },
              groupesAB: { type: "boolean", description: "true = matière dédoublée en groupes A/B (deux profs de la même matière en parallèle). Défaut false (classe entière)." },
              dureeSessionMinutes: { type: "number", description: "Durée d'une séance en minutes (ex: 90 pour 1h30). Si omis, réparti en 2h/1h selon pourcentageSessions2h." },
            },
            required: ["matiereNom", "heuresParSemaine"],
          },
        },
        paires: {
          type: "array",
          description:
            "Matières APPARIÉES en groupes A/B : au même créneau, un groupe fait matiereA et l'autre matiereB, en alternant à chaque séance. Ex: {matiereANom:'Mathématiques', matiereBNom:'Français'} ou {matiereANom:'Physique-Chimie', matiereBNom:'SVT'}.",
          items: {
            type: "object",
            properties: {
              matiereANom: { type: "string" },
              matiereBNom: { type: "string" },
              heuresParSemaine: { type: "number", description: "Heures hebdomadaires par groupe pour ce bloc apparié" },
              dureeSessionMinutes: { type: "number", description: "Durée d'une séance en minutes (ex: 90, 120). Défaut 120." },
            },
            required: ["matiereANom", "matiereBNom", "heuresParSemaine"],
          },
        },
      },
      required: ["classeNom", "heureDebutJournee", "heureFinJournee"],
    },
  },
};

export const RestructurerArgsSchema = z.object({
  classeNom: z.string().min(1),
  heureDebutJournee: z.string().min(1),
  heureFinJournee: z.string().min(1),
  pourcentageSessions2h: z.coerce.number().min(0).max(100).optional(),
  jours: z.array(z.enum(JOUR_ENUM)).optional(),
  matieres: z
    .array(
      z.object({
        matiereNom: z.string().min(1),
        heuresParSemaine: z.coerce.number().min(0.5).max(20),
        groupesAB: z.coerce.boolean().optional(),
        dureeSessionMinutes: z.coerce.number().min(30).max(240).optional(),
      })
    )
    .optional(),
  paires: z
    .array(
      z.object({
        matiereANom: z.string().min(1),
        matiereBNom: z.string().min(1),
        heuresParSemaine: z.coerce.number().min(0.5).max(20),
        dureeSessionMinutes: z.coerce.number().min(30).max(240).optional(),
      })
    )
    .optional(),
});

export const CreneauArgsSchema = z.object({
  classeNom: z.string().min(1),
  matiereNom: z.string().min(1),
  enseignantNom: z.string().min(1).optional(),
  jour: z.enum(["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]),
  // Format libre en entrée : le modèle ne respecte pas toujours "HH:MM" (ex: "8h",
  // "8h30") — normalisé par normalizeHeure() dans resolveCreneauProposal.
  heureDebut: z.string().min(1),
  heureFin: z.string().min(1),
  salle: z.string().max(50).optional(),
});

export interface CreneauProposal {
  classeId: string;
  classeNom: string;
  matiereId: string;
  matiereNom: string;
  enseignantId: string | null;
  enseignantNom: string | null;
  jour: string;
  heureDebut: string;
  heureFin: string;
  salle: string | null;
}

type Resolution = { ok: true; proposal: CreneauProposal } | { ok: false; message: string };

export async function resolveCreneauProposal(
  tenantId: string,
  rawArgs: z.infer<typeof CreneauArgsSchema>
): Promise<Resolution> {
  const heureDebut = normalizeHeure(rawArgs.heureDebut);
  const heureFin = normalizeHeure(rawArgs.heureFin);
  if (!heureDebut || !heureFin) {
    return {
      ok: false,
      message: `Format d'heure invalide ("${rawArgs.heureDebut}" / "${rawArgs.heureFin}"). Utilise le format HH:MM, par exemple "08:00".`,
    };
  }
  if (heureFin <= heureDebut) {
    return { ok: false, message: "L'heure de fin doit être après l'heure de début." };
  }
  const args = { ...rawArgs, heureDebut, heureFin };

  // Recherche floue en mémoire (plutôt qu'un simple ILIKE en base) : le modèle
  // écrit souvent des abréviations sans accent ("maths", "1ere L") qui ne sont
  // pas des sous-chaînes littérales du nom réel ("Mathématiques", "1ère L").
  const allClasses = await prisma.classe.findMany({ where: { tenantId }, select: { id: true, nom: true } });
  const classes = fuzzyFind(allClasses, args.classeNom);
  if (classes.length === 0) {
    return { ok: false, message: `Aucune classe ne correspond à "${args.classeNom}".` };
  }
  if (classes.length > 1) {
    return {
      ok: false,
      message: `Plusieurs classes correspondent à "${args.classeNom}" : ${classes.map((c) => c.nom).join(", ")}. Merci de préciser laquelle.`,
    };
  }
  const classe = classes[0];

  const allMatieres = await prisma.matiere.findMany({ where: { tenantId }, select: { id: true, nom: true } });
  const matieres = fuzzyFind(allMatieres, args.matiereNom);
  if (matieres.length === 0) {
    return { ok: false, message: `Aucune matière ne correspond à "${args.matiereNom}".` };
  }
  if (matieres.length > 1) {
    return {
      ok: false,
      message: `Plusieurs matières correspondent à "${args.matiereNom}" : ${matieres.map((m) => m.nom).join(", ")}. Merci de préciser laquelle.`,
    };
  }
  const matiere = matieres[0];

  let enseignant: { id: string; nom: string } | null = null;
  if (args.enseignantNom) {
    const allEnseignants = await prisma.enseignant.findMany({
      where: { tenantId },
      select: { id: true, user: { select: { name: true } } },
    });
    const enseignants = fuzzyFind(
      allEnseignants.map((e) => ({ id: e.id, nom: e.user.name })),
      args.enseignantNom
    );
    if (enseignants.length === 0) {
      return { ok: false, message: `Aucun enseignant ne correspond à "${args.enseignantNom}".` };
    }
    if (enseignants.length > 1) {
      return {
        ok: false,
        message: `Plusieurs enseignants correspondent à "${args.enseignantNom}" : ${enseignants
          .map((e) => e.nom)
          .join(", ")}. Merci de préciser lequel.`,
      };
    }
    enseignant = enseignants[0];
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currentYear: true } });
  const annee = tenant?.currentYear ?? "2025-2026";

  const overlapConditions = {
    OR: [
      { heureDebut: { lte: args.heureDebut }, heureFin: { gt: args.heureDebut } },
      { heureDebut: { lt: args.heureFin }, heureFin: { gte: args.heureFin } },
      { heureDebut: { gte: args.heureDebut }, heureFin: { lte: args.heureFin } },
    ],
  };

  const classOverlap = await prisma.emploiTemps.findFirst({
    where: { tenantId, classeId: classe.id, jour: args.jour, annee, ...overlapConditions },
  });
  if (classOverlap) {
    return { ok: false, message: `Ce créneau chevauche un cours déjà existant pour la classe ${classe.nom}.` };
  }

  if (enseignant) {
    const teacherConflict = await prisma.emploiTemps.findFirst({
      where: { tenantId, enseignantId: enseignant.id, jour: args.jour, annee, ...overlapConditions },
    });
    if (teacherConflict) {
      return { ok: false, message: `${enseignant.nom} est déjà assigné(e) à un autre cours à cet horaire.` };
    }
  }

  if (args.salle) {
    const roomConflict = await prisma.emploiTemps.findFirst({
      where: { tenantId, salle: args.salle, jour: args.jour, annee, ...overlapConditions },
    });
    if (roomConflict) {
      return { ok: false, message: `La salle ${args.salle} est déjà occupée à cet horaire.` };
    }
  }

  return {
    ok: true,
    proposal: {
      classeId: classe.id,
      classeNom: classe.nom,
      matiereId: matiere.id,
      matiereNom: matiere.nom,
      enseignantId: enseignant?.id ?? null,
      enseignantNom: enseignant?.nom ?? null,
      jour: args.jour,
      heureDebut: args.heureDebut,
      heureFin: args.heureFin,
      salle: args.salle ?? null,
    },
  };
}

interface CreneauExistant {
  jour: string;
  heureDebut: string;
  heureFin: string;
  matiere: string;
  enseignant: string | null;
  salle: string | null;
}

type ListerResult =
  | { ok: true; classeNom: string; creneaux: CreneauExistant[] }
  | { ok: false; message: string };

/**
 * Lecture seule — renvoie les créneaux déjà occupés d'une classe pour que le
 * modèle puisse répondre à des questions ("quels créneaux sont libres ?") ou
 * préparer une proposition informée avec proposer_creneau_emploi_du_temps.
 */
export async function listCreneaux(
  tenantId: string,
  args: z.infer<typeof ListerArgsSchema>
): Promise<ListerResult> {
  const allClasses = await prisma.classe.findMany({ where: { tenantId }, select: { id: true, nom: true } });
  const classes = fuzzyFind(allClasses, args.classeNom);
  if (classes.length === 0) {
    return { ok: false, message: `Aucune classe ne correspond à "${args.classeNom}".` };
  }
  if (classes.length > 1) {
    return {
      ok: false,
      message: `Plusieurs classes correspondent à "${args.classeNom}" : ${classes.map((c) => c.nom).join(", ")}. Merci de préciser laquelle.`,
    };
  }
  const classe = classes[0];

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currentYear: true } });
  const annee = tenant?.currentYear ?? "2025-2026";

  const emplois = await prisma.emploiTemps.findMany({
    where: { tenantId, classeId: classe.id, annee, ...(args.jour ? { jour: args.jour } : {}) },
    include: { matiere: { select: { nom: true } }, enseignant: { include: { user: { select: { name: true } } } } },
    orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
  });

  return {
    ok: true,
    classeNom: classe.nom,
    creneaux: emplois.map((e) => ({
      jour: e.jour,
      heureDebut: e.heureDebut,
      heureFin: e.heureFin,
      matiere: e.matiere.nom,
      enseignant: e.enseignant?.user.name ?? null,
      salle: e.salle,
    })),
  };
}

export async function listClasses(tenantId: string, args: z.infer<typeof ListerClassesArgsSchema>) {
  const allClasses = await prisma.classe.findMany({
    where: { tenantId },
    select: { nom: true, niveau: true, effectifMax: true },
    orderBy: { nom: "asc" },
  });
  if (!args.niveau) {
    return { ok: true as const, classes: allClasses };
  }
  const matchedNiveaux = new Set(
    fuzzyFind(
      [...new Set(allClasses.map((c) => c.niveau))].map((niveau) => ({ nom: niveau })),
      args.niveau
    ).map((m) => m.nom)
  );
  return { ok: true as const, classes: allClasses.filter((c) => matchedNiveaux.has(c.niveau)) };
}

export async function listEnseignants(tenantId: string, args: z.infer<typeof ListerEnseignantsArgsSchema>) {
  const allEnseignants = await prisma.enseignant.findMany({
    where: { tenantId },
    select: { specialite: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const mapped = allEnseignants.map((e) => ({ nom: e.user.name, specialite: e.specialite }));
  if (!args.matiereNom) {
    return { ok: true as const, enseignants: mapped };
  }
  const matched = fuzzyFind(
    mapped.map((e) => ({ nom: e.specialite ?? "" })),
    args.matiereNom
  );
  const matchedSpecialites = new Set(matched.map((m) => m.nom));
  const enseignants = mapped.filter((e) => matchedSpecialites.has(e.specialite ?? ""));
  return { ok: true as const, enseignants, aucuneCorrespondanceSpecialite: enseignants.length === 0 };
}

export async function listSalles(tenantId: string) {
  const salles = await prisma.salle.findMany({
    where: { tenantId },
    select: { nom: true, capacite: true, type: true, batiment: true },
    orderBy: { nom: "asc" },
  });
  return { ok: true as const, salles };
}

export async function suggererCreneaux(tenantId: string, args: z.infer<typeof SuggererArgsSchema>) {
  const allClasses = await prisma.classe.findMany({ where: { tenantId }, select: { id: true, nom: true } });
  const classes = fuzzyFind(allClasses, args.classeNom);
  if (classes.length === 0) return { ok: false as const, message: `Aucune classe ne correspond à "${args.classeNom}".` };
  if (classes.length > 1) {
    return {
      ok: false as const,
      message: `Plusieurs classes correspondent à "${args.classeNom}" : ${classes.map((c) => c.nom).join(", ")}. Merci de préciser laquelle.`,
    };
  }

  const allMatieres = await prisma.matiere.findMany({ where: { tenantId }, select: { id: true, nom: true } });
  const matieres = fuzzyFind(allMatieres, args.matiereNom);
  if (matieres.length === 0) return { ok: false as const, message: `Aucune matière ne correspond à "${args.matiereNom}".` };
  if (matieres.length > 1) {
    return {
      ok: false as const,
      message: `Plusieurs matières correspondent à "${args.matiereNom}" : ${matieres.map((m) => m.nom).join(", ")}. Merci de préciser laquelle.`,
    };
  }

  let enseignantId: string | undefined;
  if (args.enseignantNom) {
    const allEnseignants = await prisma.enseignant.findMany({
      where: { tenantId },
      select: { id: true, user: { select: { name: true } } },
    });
    const enseignants = fuzzyFind(allEnseignants.map((e) => ({ id: e.id, nom: e.user.name })), args.enseignantNom);
    if (enseignants.length === 0) return { ok: false as const, message: `Aucun enseignant ne correspond à "${args.enseignantNom}".` };
    if (enseignants.length > 1) {
      return {
        ok: false as const,
        message: `Plusieurs enseignants correspondent à "${args.enseignantNom}" : ${enseignants.map((e) => e.nom).join(", ")}. Merci de préciser lequel.`,
      };
    }
    enseignantId = enseignants[0].id;
  }

  const { suggestions, filteredBySpecialite } = await suggestSlots({
    tenantId,
    classeId: classes[0].id,
    matiereId: matieres[0].id,
    enseignantId,
    duree: args.duree,
  });

  return {
    ok: true as const,
    classeId: classes[0].id,
    classeNom: classes[0].nom,
    matiereId: matieres[0].id,
    matiereNom: matieres[0].nom,
    filteredBySpecialite,
    suggestions: suggestions.slice(0, 5) as CreneauSuggestion[],
  };
}

export async function resolveRestructuration(tenantId: string, args: z.infer<typeof RestructurerArgsSchema>) {
  const allClasses = await prisma.classe.findMany({ where: { tenantId }, select: { id: true, nom: true } });
  const classes = fuzzyFind(allClasses, args.classeNom);
  if (classes.length === 0) return { ok: false as const, message: `Aucune classe ne correspond à "${args.classeNom}".` };
  if (classes.length > 1) {
    return {
      ok: false as const,
      message: `Plusieurs classes correspondent à "${args.classeNom}" : ${classes.map((c) => c.nom).join(", ")}. Merci de préciser laquelle.`,
    };
  }

  const heureDebutJournee = normalizeHeure(args.heureDebutJournee);
  const heureFinJournee = normalizeHeure(args.heureFinJournee);
  if (!heureDebutJournee || !heureFinJournee) {
    return {
      ok: false as const,
      message: `Format d'heure invalide ("${args.heureDebutJournee}" / "${args.heureFinJournee}"). Utilise le format HH:MM, par exemple "07:30".`,
    };
  }

  const hasMatieres = (args.matieres?.length ?? 0) > 0;
  const hasPaires = (args.paires?.length ?? 0) > 0;
  const allMatieres =
    hasMatieres || hasPaires
      ? await prisma.matiere.findMany({ where: { tenantId }, select: { id: true, nom: true } })
      : [];

  // Résout un nom de matière en une entrée {id, nom} unique, sinon renvoie un message d'erreur.
  function resolveMatiere(nom: string): { id: string; nom: string } | { error: string } {
    const matches = fuzzyFind(allMatieres, nom);
    if (matches.length === 0) return { error: `Aucune matière ne correspond à "${nom}".` };
    if (matches.length > 1) {
      return { error: `Plusieurs matières correspondent à "${nom}" : ${matches.map((x) => x.nom).join(", ")}. Merci de préciser laquelle.` };
    }
    return matches[0];
  }

  let matieres: MatiereCible[] | undefined;
  if (hasMatieres) {
    matieres = [];
    for (const m of args.matieres!) {
      const r = resolveMatiere(m.matiereNom);
      if ("error" in r) return { ok: false as const, message: r.error };
      matieres.push({
        matiereId: r.id,
        matiereNom: r.nom,
        minutesParSemaine: Math.round(m.heuresParSemaine * 60),
        groupesAB: m.groupesAB ?? false,
        dureeSessionMinutes: m.dureeSessionMinutes,
      });
    }
  }

  let paires: PaireCible[] | undefined;
  if (hasPaires) {
    paires = [];
    for (const p of args.paires!) {
      const rA = resolveMatiere(p.matiereANom);
      if ("error" in rA) return { ok: false as const, message: rA.error };
      const rB = resolveMatiere(p.matiereBNom);
      if ("error" in rB) return { ok: false as const, message: rB.error };
      paires.push({
        matiereAId: rA.id,
        matiereANom: rA.nom,
        matiereBId: rB.id,
        matiereBNom: rB.nom,
        minutesParSemaine: Math.round(p.heuresParSemaine * 60),
        dureeSessionMinutes: p.dureeSessionMinutes,
      });
    }
  }

  const result = await generateBulkPlan({
    tenantId,
    classeId: classes[0].id,
    heureDebutJournee,
    heureFinJournee,
    pourcentageSessions2h: args.pourcentageSessions2h ?? 80,
    groupes: 1,
    joursAutorises: (args.jours && args.jours.length > 0 ? args.jours : ALL_DAYS.filter((j) => j !== "DIMANCHE")) as Jour[],
    matieres,
    paires,
  });

  if (!result.ok) return { ok: false as const, message: result.message };

  return {
    ok: true as const,
    classeId: classes[0].id,
    classeNom: classes[0].nom,
    matieresUtilisees: result.matieresUtilisees,
    nbCreneauxExistants: result.nbCreneauxExistants,
    plan: result.plan,
    warnings: result.warnings,
  };
}
