import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import { lireDocument } from "@/lib/ocr";
import {
  ErreurCopie,
  alignerNotes,
  appliquerNotesCopie,
  apparierEleve,
  extraireNom,
  extraireNotes,
  feuillesPapierEnAttente,
} from "@/lib/learnos/copies-papier";

/**
 * Feuille d'exercices sur papier — étape 2 : la notation.
 *
 *   POST → lit une copie corrigée : à qui elle est, et quelles notes y figurent.
 *          N'ÉCRIT RIEN.
 *   PUT  → enregistre la notation confirmée et produit les preuves.
 *
 * CE QUE CETTE ROUTE NE FAIT PAS
 * ------------------------------
 * Elle ne corrige pas la copie. L'enseignant a déjà corrigé, au stylo ; on
 * **récupère son jugement**, on ne le refait pas. C'est une distinction de fond,
 * pas de vocabulaire : un modèle à qui l'on demanderait « cette réponse est-elle
 * juste ? » substituerait son avis à celui de l'enseignant sur des copies qu'il
 * lit mal, et personne ne s'en apercevrait avant le conseil de classe.
 *
 * POURQUOI L'ÉLÈVE N'EST PAS DEVINÉ
 * ---------------------------------
 * Le nom lu est apparié aux seuls élèves ayant reçu cette feuille, et l'égalité
 * de score entre deux candidats ne tranche pas (cf. `apparierEleve`) : la
 * réponse est alors « je ne sais pas », avec la liste. Attribuer d'office la
 * copie au premier candidat écrirait la note d'un élève dans le dossier d'un
 * autre — une erreur invisible et irréparable.
 */

const TAILLE_MAX_MO = 10;

export const maxDuration = 300;

const AppliquerSchema = z.object({
  feuilleId: z.string().min(1),
  notes: z
    .array(
      z.object({
        exerciceId: z.string().min(1),
        points: z.number().min(0).max(100),
      })
    )
    .min(1)
    .max(40),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "notes:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  const form = await req.formData().catch(() => null);
  if (!form) return erreurJson("DONNEES_INVALIDES");

  const fichier = form.get("fichier");
  const classeId = String(form.get("classeId") ?? "").trim() || undefined;
  const matiereId = String(form.get("matiereId") ?? "").trim() || undefined;
  const feuilleId = String(form.get("feuilleId") ?? "").trim() || undefined;

  if (!(fichier instanceof File) || (!classeId && !feuilleId)) {
    return erreurJson("DONNEES_INVALIDES");
  }
  if (fichier.size > TAILLE_MAX_MO * 1024 * 1024) {
    return erreurJson("FICHIER_TROP_VOLUMINEUX", { limiteMo: TAILLE_MAX_MO });
  }

  // Les feuilles en attente sont chargées AVANT la lecture : s'il n'y en a
  // aucune, la copie scannée ne correspond à rien qu'on puisse noter, et l'OCR
  // aurait été dépensé pour rien.
  const attente = await feuillesPapierEnAttente(tenantId, session.user, {
    classeId,
    matiereId,
    feuilleId,
  });
  if (attente.length === 0) return erreurJson("FEUILLE_PAPIER_INTROUVABLE");

  let ocr;
  try {
    ocr = await lireDocument(new Uint8Array(await fichier.arrayBuffer()), {
      nature: "manuscrit",
      contexte: {
        tenantId,
        action: "copie.notation.transcrire",
        inputRef: feuilleId ?? classeId ?? null,
        actorId: session.user.id,
      },
      consigne:
        "Cette page est une copie d'élève corrigée à la main. Relève le nom de " +
        "l'élève en tête, et TOUTES les notes portées par le correcteur, y " +
        "compris dans la marge (« 3/5 », « 1,5 », « Total : 14/20 »).",
    });
  } catch (error) {
    console.error("[API/learnos/copies/notes]", error);
    if (error instanceof AiAllProvidersFailedError) {
      return erreurJson("OCR_INDISPONIBLE");
    }
    return erreurJson("FICHIER_INVALIDE");
  }

  if (!ocr.lisible) {
    return erreurJson(ocr.motif === "aucun_moteur" ? "OCR_INDISPONIBLE" : "DOCUMENT_ILLISIBLE");
  }

  const nomLu = extraireNom(ocr.texte);
  const lecture = extraireNotes(ocr.texte);

  // Feuille désignée explicitement : l'enseignant scanne les copies une par une
  // en sachant laquelle il traite. Aucun appariement à faire.
  const appariement = feuilleId
    ? { eleveId: attente[0].eleveId, confiance: 1, candidats: [] }
    : apparierEleve(
        nomLu,
        attente.map((f) => ({ id: f.eleveId, nom: f.eleveNom, prenom: f.elevePrenom }))
      );

  const feuille = appariement.eleveId
    ? attente.find((f) => f.eleveId === appariement.eleveId)
    : undefined;

  // Sans élève identifié, on rend malgré tout les notes lues : l'enseignant
  // désigne la copie dans la liste et le travail de lecture n'est pas perdu.
  const alignement = feuille
    ? alignerNotes(feuille.exercices, lecture, ocr.texte)
    : { retenues: [], anomalies: [] as ReturnType<typeof alignerNotes>["anomalies"] };

  const nomsParEleve = new Map(
    attente.map((f) => [f.eleveId, `${f.elevePrenom} ${f.eleveNom}`.trim()])
  );

  return NextResponse.json({
    nomLu,
    feuilleId: feuille?.feuilleId ?? null,
    eleve: appariement.eleveId
      ? {
          id: appariement.eleveId,
          nom: nomsParEleve.get(appariement.eleveId) ?? "",
          confiance: appariement.confiance,
        }
      : null,
    candidats: appariement.candidats.map((c) => ({
      eleveId: c.eleveId,
      nom: nomsParEleve.get(c.eleveId) ?? "",
      confiance: c.confiance,
      feuilleId: attente.find((f) => f.eleveId === c.eleveId)?.feuilleId ?? null,
    })),
    exercices: feuille?.exercices.map((e) => ({
      exerciceId: e.exerciceId,
      numero: e.numero,
      bareme: e.bareme,
    })),
    notes: alignement.retenues,
    anomalies: alignement.anomalies,
    total: lecture.total,
    // Toutes les feuilles en attente, pour que l'enseignant puisse rattacher la
    // copie à la main quand le nom n'a pas été lu.
    feuilles: attente.map((f) => ({
      feuilleId: f.feuilleId,
      eleveId: f.eleveId,
      nom: `${f.elevePrenom} ${f.eleveNom}`.trim(),
      exercices: f.exercices.map((e) => ({
        exerciceId: e.exerciceId,
        numero: e.numero,
        bareme: e.bareme,
      })),
    })),
    texte: ocr.texte,
    ocr: {
      moteur: ocr.moteur,
      confiance: ocr.confiance,
      pagesLues: ocr.pagesLues,
      pagesTotal: ocr.pagesTotal,
      pagesIgnorees: ocr.tronque,
      modele: ocr.modele,
    },
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

  try {
    const resultat = await appliquerNotesCopie(
      session.user.tenantId,
      session.user,
      {
        feuilleId: parsed.data.feuilleId,
        notes: parsed.data.notes,
        // La signature du correcteur : c'est un adulte identifié qui endosse
        // cette notation, pas « le système ».
        corrigeParId: session.user.id,
      }
    );
    return NextResponse.json(resultat);
  } catch (error) {
    if (error instanceof ErreurCopie) {
      return erreurJson(
        error.code === "points_hors_bareme" ? "POINTS_HORS_BAREME" : "FEUILLE_PAPIER_INTROUVABLE"
      );
    }
    throw error;
  }
}
