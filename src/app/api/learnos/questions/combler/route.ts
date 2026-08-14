import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import prisma from "@/lib/prisma";
import { siteFilterForModel, siteFilterForRelation } from "@/lib/site-scope";
import { genererQuestions } from "@/lib/learnos/generation-questions";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import type { PalierExercice, FormatQuestion } from "@prisma/client";

/**
 * Comble automatiquement les trous de la banque.
 *
 * Détecte les couples compétence × palier sans aucune question, et génère un
 * lot pour chacun via `genererQuestions`. C'est le bouton « Combler » du
 * tableau de couverture : il transforme un diagnostic en action.
 *
 * Limite volontaire de 20 trous par appel : au-delà, le coût IA devient
 * significatif et l'enseignant doit voir ce qui se passe. Un second clic
 * comble la suite.
 *
 * Réservé aux adultes (`ai:teacher`) : la génération écrit des énoncés que des
 * élèves recevront, et coûte de l'argent.
 */
const PALIERS: PalierExercice[] = [
  "RESTITUTION",
  "APPLICATION",
  "CONSOLIDATION",
  "TRANSFERT",
  "OUVERTURE",
];

const FORMAT_PAR_DEFAUT: FormatQuestion = "CHOIX_UNIQUE";

const Schema = z.object({
  /** Filtrer par matière (optionnel). */
  matiereId: z.string().optional(),
  /** Filtrer par niveau (optionnel). */
  niveau: z.string().optional(),
  /** Nombre maximum de trous à combler (défaut 20). */
  max: z.number().int().min(1).max(50).default(20),
  /** Nombre de questions par trou (défaut 2). */
  nombreParTrou: z.number().int().min(1).max(5).default(2),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "ai:teacher");
  if (denied) return denied;

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.flatten() });
  }

  const tenantId = session.user.tenantId;
  const { matiereId, niveau, max, nombreParTrou } = parsed.data;

  // 1. Charger les compétences du curriculum filtré.
  const chapitres = await prisma.chapitre.findMany({
    where: {
      tenantId,
      ...(matiereId ? { matiereId } : {}),
      ...(niveau ? { niveau } : {}),
      ...siteFilterForRelation(session.user, "competences"),
    },
    select: {
      competences: { select: { id: true } },
    },
  });
  const competenceIds = chapitres.flatMap((c) => c.competences.map((cp) => cp.id));
  if (competenceIds.length === 0) {
    return NextResponse.json({ trous: [], creees: 0, echecs: 0 });
  }

  // 2. Compter les questions existantes par compétence × palier.
  const comptes = await prisma.question.groupBy({
    by: ["competenceId", "palier"],
    where: {
      tenantId,
      actif: true,
      competenceId: { in: competenceIds },
      ...siteFilterForModel("question", session.user),
    },
    _count: { _all: true },
  });

  const paliersPleins = new Set<string>();
  for (const c of comptes) {
    paliersPleins.add(`${c.competenceId}|${c.palier}`);
  }

  // 3. Identifier les trous.
  const trous: { competenceId: string; palier: PalierExercice }[] = [];
  for (const compId of competenceIds) {
    for (const palier of PALIERS) {
      if (!paliersPleins.has(`${compId}|${palier}`)) {
        trous.push({ competenceId: compId, palier });
      }
    }
  }

  if (trous.length === 0) {
    return NextResponse.json({ trous: [], creees: 0, echecs: 0 });
  }

  // 4. Limiter le nombre de trous par appel.
  const aCombler = trous.slice(0, max);

  let creees = 0;
  let echecs = 0;

  for (const trou of aCombler) {
    try {
      const resultat = await genererQuestions(
        tenantId,
        session.user,
        {
          competenceId: trou.competenceId,
          palier: trou.palier,
          format: FORMAT_PAR_DEFAUT,
          nombre: nombreParTrou,
        },
        session.user.id
      );
      creees += resultat.creees.length;
      // Une génération qui ne produit rien (rejets) compte comme échec :
      // le trou reste, et l'enseignant doit le savoir.
      if (resultat.creees.length === 0) echecs++;
    } catch (error) {
      echecs++;
      // IA indisponible : on arrête tôt, les trous suivants échoueraient aussi.
      if (error instanceof AiAllProvidersFailedError) {
        return erreurJson("IA_INDISPONIBLE", undefined, {
          detail: `${creees} question(s) générée(s) avant l'indisponibilité. ${echecs} échec(s).`,
        });
      }
      // Autre erreur (compétence introuvable, etc.) : on continue sur les suivants.
    }
  }

  return NextResponse.json({
    trous: aCombler.length,
    trousTotal: trous.length,
    creees,
    echecs,
  });
}
