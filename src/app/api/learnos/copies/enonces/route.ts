import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import { lireDocument } from "@/lib/ocr";
import {
  ErreurCopie,
  creerFeuillesPapier,
  elevesDeClasse,
  extraireExercices,
  rattacherCompetence,
} from "@/lib/learnos/copies-papier";

/**
 * Feuille d'exercices sur papier — étape 1 : les énoncés.
 *
 *   POST → lit la feuille scannée, propose exercices, barèmes et compétences.
 *          N'ÉCRIT RIEN.
 *   PUT  → crée les questions et une feuille par élève.
 *
 * POURQUOI DEUX VERBES
 * --------------------
 * Même partage que l'import de programme : analyser coûte une lecture (temps
 * machine, parfois un appel de modèle) et n'a aucun effet ; appliquer écrit et
 * ne coûte aucune lecture. Les confondre relancerait l'OCR à chaque correction
 * d'un barème mal lu — c'est-à-dire à chaque usage réel.
 *
 * CE QUE L'ENSEIGNANT DOIT ENCORE FAIRE
 * -------------------------------------
 * Confirmer le rattachement aux compétences. La proposition est lexicale
 * (`rattacherCompetence`) : elle rapproche les mots de l'énoncé de ceux du
 * libellé, ce qui marche souvent et jamais à coup sûr. Un rattachement faux ne
 * produit pas une erreur visible — il produit des preuves rangées sous la
 * mauvaise compétence, donc un jumeau d'apprentissage faux. Cette confirmation
 * n'est pas une formalité : c'est le seul point du dispositif où elle ne peut
 * pas être déléguée.
 */

const TAILLE_MAX_MO = 10;

/** Rendu des pages puis lecture : bien au-delà des 10 s par défaut de Next. */
export const maxDuration = 300;

const ExerciceSchema = z.object({
  numero: z.number().int().min(1).max(99),
  enonce: z.string().min(3).max(2000),
  bareme: z.number().positive().max(100),
  competenceId: z.string().min(1),
  palier: z
    .enum(["RESTITUTION", "APPLICATION", "CONSOLIDATION", "TRANSFERT", "OUVERTURE"])
    .optional(),
});

const AppliquerSchema = z
  .object({
    matiereId: z.string().min(1),
    classeId: z.string().min(1).optional(),
    eleveIds: z.array(z.string().min(1)).max(200).optional(),
    exercices: z.array(ExerciceSchema).min(1).max(40),
  })
  // L'un ou l'autre, jamais aucun : une feuille sans destinataire n'a pas de
  // sens, et distribuer « à tout le tenant » par défaut serait dangereux.
  .refine((d) => Boolean(d.classeId) || (d.eleveIds?.length ?? 0) > 0, {
    message: "classeId ou eleveIds requis",
  });

async function matiereAccessible(
  tenantId: string,
  matiereId: string,
  claims: SessionSiteClaims
) {
  return prisma.matiere.findFirst({
    where: { id: matiereId, tenantId, ...siteFilterForModel("matiere", claims) },
    select: { id: true, nom: true, siteId: true },
  });
}

/** Compétences candidates au rattachement, restreintes à la matière. */
async function competencesDeMatiere(
  tenantId: string,
  matiereId: string,
  niveau: string | null,
  claims: SessionSiteClaims
) {
  return prisma.competence.findMany({
    where: {
      tenantId,
      chapitre: { matiereId, ...(niveau ? { niveau } : {}) },
      ...siteFilterForModel("competence", claims),
    },
    select: {
      id: true,
      code: true,
      libelle: true,
      chapitre: { select: { id: true, nom: true, niveau: true } },
    },
    orderBy: [{ chapitre: { ordre: "asc" } }, { ordre: "asc" }],
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "notes:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const typeContenu = req.headers.get("content-type") ?? "";

  let matiereId: string;
  let niveau: string | null = null;
  let texte: string;
  let lu: Record<string, unknown> | null = null;

  if (typeContenu.includes("multipart/form-data")) {
    const form = await req.formData();
    matiereId = String(form.get("matiereId") ?? "");
    niveau = String(form.get("niveau") ?? "").trim() || null;
    const fichier = form.get("fichier");
    // Une feuille tapée à l'ordinateur puis photocopiée se lit avec le moteur
    // local, gratuit et sans quota. Une feuille écrite à la main exige un modèle
    // de vision. L'enseignant est le seul à savoir laquelle il dépose : c'est
    // une question à laquelle il répond en une seconde, et qu'aucune heuristique
    // ne tranche de façon fiable.
    const nature = String(form.get("nature") ?? "manuscrit") === "imprime"
      ? "imprime"
      : "manuscrit";

    if (!(fichier instanceof File) || !matiereId) {
      return erreurJson("DONNEES_INVALIDES");
    }
    if (fichier.size > TAILLE_MAX_MO * 1024 * 1024) {
      return erreurJson("FICHIER_TROP_VOLUMINEUX", { limiteMo: TAILLE_MAX_MO });
    }
    if (!(await matiereAccessible(tenantId, matiereId, session.user))) {
      return erreurJson("MATIERE_INTROUVABLE");
    }

    let ocr;
    try {
      ocr = await lireDocument(new Uint8Array(await fichier.arrayBuffer()), {
        nature,
        contexte: {
          tenantId,
          action: "copie.enonces.transcrire",
          inputRef: matiereId,
          actorId: session.user.id,
        },
        consigne:
          "Cette page est une feuille d'exercices donnée à des élèves. " +
          "Conserve la numérotation des exercices et les barèmes indiqués.",
      });
    } catch (error) {
      if (error instanceof AiAllProvidersFailedError) {
        return erreurJson("OCR_INDISPONIBLE", undefined, { detail: error.message });
      }
      return erreurJson("FICHIER_INVALIDE");
    }

    if (!ocr.lisible) {
      return erreurJson(ocr.motif === "aucun_moteur" ? "OCR_INDISPONIBLE" : "DOCUMENT_ILLISIBLE");
    }
    texte = ocr.texte;
    lu = {
      moteur: ocr.moteur,
      confiance: ocr.confiance,
      pagesLues: ocr.pagesLues,
      pagesTotal: ocr.pagesTotal,
      pagesIgnorees: ocr.tronque,
      modele: ocr.modele,
    };
  } else {
    const parsed = z
      .object({
        matiereId: z.string().min(1),
        niveau: z.string().max(50).optional(),
        texte: z.string().min(10).max(100_000),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return erreurJson("DONNEES_INVALIDES");
    matiereId = parsed.data.matiereId;
    niveau = parsed.data.niveau?.trim() || null;
    texte = parsed.data.texte;
    if (!(await matiereAccessible(tenantId, matiereId, session.user))) {
      return erreurJson("MATIERE_INTROUVABLE");
    }
  }

  const competences = await competencesDeMatiere(tenantId, matiereId, niveau, session.user);
  const exercices = extraireExercices(texte).map((exercice) => {
    const propose = rattacherCompetence(exercice.enonce, competences);
    return { ...exercice, ...propose };
  });

  return NextResponse.json({
    exercices,
    // Le catalogue accompagne la proposition : l'écran de revue doit permettre
    // de changer de compétence sans un aller-retour de plus.
    competences: competences.map((c) => ({
      id: c.id,
      code: c.code,
      libelle: c.libelle,
      chapitre: c.chapitre?.nom ?? null,
      niveau: c.chapitre?.niveau ?? null,
    })),
    // Transcription renvoyée telle quelle : c'est elle qui permet à
    // l'enseignant de voir *pourquoi* un exercice a été mal découpé.
    texte,
    ocr: lu,
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "notes:write");
  if (denied) return denied;

  const parsed = AppliquerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }

  const tenantId = session.user.tenantId;
  const matiere = await matiereAccessible(tenantId, parsed.data.matiereId, session.user);
  if (!matiere) return erreurJson("MATIERE_INTROUVABLE");

  // Une classe désignée vaut la liste de ses élèves actifs : l'usage courant est
  // « toute la classe », et faire remonter trente identifiants par le client
  // rendrait la requête dépendante de ce qu'il croit savoir de l'effectif.
  const eleveIds = parsed.data.classeId
    ? (await elevesDeClasse(tenantId, session.user, parsed.data.classeId)).map((e) => e.id)
    : (parsed.data.eleveIds ?? []);

  if (eleveIds.length === 0) return erreurJson("ELEVE_INTROUVABLE");

  try {
    const resultat = await creerFeuillesPapier(tenantId, session.user, {
      matiereId: matiere.id,
      eleveIds,
      exercices: parsed.data.exercices,
    });
    return NextResponse.json(resultat);
  } catch (error) {
    if (error instanceof ErreurCopie) {
      return erreurJson(
        error.code === "competence_hors_matiere"
          ? "COMPETENCES_HORS_MATIERE"
          : "ELEVE_INTROUVABLE"
      );
    }
    throw error;
  }
}
