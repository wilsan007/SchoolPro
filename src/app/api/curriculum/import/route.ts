import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import {
  analyserProgramme,
  appliquerImport,
  lirePdf,
} from "@/lib/learnos/import-programme";
import { estPdf } from "@/lib/ocr/pages";
import { lireDocument } from "@/lib/ocr";

/**
 * Import d'un programme officiel.
 *
 *   POST (multipart ou JSON) → analyse, N'ÉCRIT RIEN
 *   PUT  (JSON)              → écrit la structure retenue
 *
 * Comme pour les prérequis, les deux verbes sont séparés : analyser coûte un
 * appel de modèle et n'a aucun effet ; appliquer écrit et ne coûte aucun
 * appel. Les confondre relancerait l'analyse à chaque correction de libellé.
 *
 * TROIS CHEMINS VERS LE TEXTE, DANS CET ORDRE
 * -------------------------------------------
 *   1. **Couche texte du PDF** — instantanée, exacte, gratuite. Toujours
 *      préférée : c'est le document lui-même, pas une lecture de son image.
 *   2. **OCR** — quand le PDF est un scan (cas fréquent des documents
 *      ministériels) ou quand l'enseignant dépose une photo.
 *   3. **Saisie à la main** — le champ texte, qui reste le recours quand les
 *      deux précédents échouent.
 *
 * L'ordre importe : un texte OCRisé contient des erreurs de lecture, et ces
 * erreurs se propagent aux extraits qui établissent l'origine « lu ». On ne
 * l'emploie donc jamais quand la couche texte existe.
 */

/** Limite d'un envoi. Au-delà, la fonction serverless dépasse sa mémoire. */
const TAILLE_MAX_MO = 8;

/**
 * L'OCR d'un programme de plusieurs pages dépasse largement les 10 s par défaut
 * de Next : quelques secondes de rendu, puis quelques secondes par page.
 */
export const maxDuration = 300;

const AppliquerSchema = z.object({
  matiereId: z.string().min(1),
  chapitres: z
    .array(
      z.object({
        nom: z.string().min(1).max(200),
        niveau: z.string().min(1).max(50),
        origine: z.enum(["lu", "deduit"]),
        extrait: z.string().max(300).default(""),
        competences: z
          .array(
            z.object({
              code: z.string().min(1).max(30),
              libelle: z.string().min(1).max(300),
              origine: z.enum(["lu", "deduit"]),
              extrait: z.string().max(300).default(""),
            })
          )
          .max(60),
      })
    )
    .min(1)
    .max(60),
});

async function matiereAccessible(
  tenantId: string,
  matiereId: string,
  claims: SessionSiteClaims
) {
  return prisma.matiere.findFirst({
    where: { id: matiereId, tenantId, ...siteFilterForModel("matiere", claims) },
    select: { id: true, nom: true, code: true, siteId: true },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  let matiereId: string;
  let niveau: string;
  let texte: string;
  /**
   * Rapport de lecture, quand le texte vient d'un OCR et non du document.
   *
   * Renvoyé au client pour qu'il le dise : sur un texte OCRisé, un libellé
   * marqué « lu » l'est dans une *lecture* du document, pas dans le document.
   * La nuance change ce que l'enseignant doit vérifier.
   */
  let lu: {
    moteur: string;
    confiance: number | null;
    pagesLues: number;
    pagesTotal: number;
    pagesIgnorees: boolean;
    modele: string | null;
  } | null = null;

  const typeContenu = req.headers.get("content-type") ?? "";

  if (typeContenu.includes("multipart/form-data")) {
    const form = await req.formData();
    matiereId = String(form.get("matiereId") ?? "");
    niveau = String(form.get("niveau") ?? "").trim();
    const fichier = form.get("fichier");

    if (!(fichier instanceof File) || !matiereId || !niveau) {
      return erreurJson("DONNEES_INVALIDES");
    }
    if (fichier.size > TAILLE_MAX_MO * 1024 * 1024) {
      return erreurJson("FICHIER_TROP_VOLUMINEUX", { limiteMo: TAILLE_MAX_MO });
    }

    // Périmètre vérifié AVANT la lecture, et pas seulement avant l'analyse :
    // un OCR coûte du temps machine et, sur le chemin de repli, un appel de
    // modèle. Les dépenser pour une matière que l'appelant n'a pas le droit de
    // voir n'a pas de sens.
    if (!(await matiereAccessible(tenantId, matiereId, session.user))) {
      return erreurJson("MATIERE_INTROUVABLE");
    }

    // pdf.js détache le tampon qu'on lui confie : chaque lecture reçoit sa
    // propre copie, sinon la tentative OCR trouverait un tableau vide et
    // conclurait à un document illisible.
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const pdf = estPdf(octets);

    let lecture;
    if (pdf) {
      try {
        lecture = await lirePdf(octets.slice());
      } catch {
        // PDF corrompu ou fichier qui n'en est pas un : c'est une erreur
        // d'utilisateur, pas un incident serveur.
        return erreurJson("FICHIER_INVALIDE");
      }
    }

    if (lecture?.exploitable) {
      texte = lecture.texte;
    } else {
      // Scan ou photo : aucune couche texte à lire. On passe à l'OCR plutôt que
      // de renvoyer l'utilisateur au copier-coller — c'était la limite annoncée
      // de cet import, et c'est ce que ce chemin lève.
      let ocr;
      try {
        ocr = await lireDocument(octets, {
          nature: "imprime",
          contexte: {
            tenantId,
            action: "curriculum.programme.ocr",
            inputRef: matiereId,
            actorId: session.user.id,
          },
        });
      } catch (error) {
        if (error instanceof AiAllProvidersFailedError) return erreurJson("PDF_SANS_TEXTE");
        // Rendu impossible : le fichier n'est ni un PDF exploitable ni une image.
        return erreurJson("FICHIER_INVALIDE");
      }

      if (!ocr.lisible) {
        return erreurJson(ocr.motif === "aucun_moteur" ? "PDF_SANS_TEXTE" : "DOCUMENT_ILLISIBLE");
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
    }
  } else {
    const corps = await req.json().catch(() => null);
    const parsed = z
      .object({
        matiereId: z.string().min(1),
        niveau: z.string().min(1).max(50),
        texte: z.string().min(50).max(200_000),
      })
      .safeParse(corps);
    if (!parsed.success) return erreurJson("DONNEES_INVALIDES");
    ({ matiereId, niveau, texte } = parsed.data);
  }

  const matiere = await matiereAccessible(tenantId, matiereId, session.user);
  if (!matiere) return erreurJson("MATIERE_INTROUVABLE");

  try {
    const analyse = await analyserProgramme(texte, {
      tenantId,
      siteId: matiere.siteId,
      matiereNom: matiere.nom,
      matiereCode: matiere.code,
      niveau,
    });
    return NextResponse.json({ ...analyse, ocr: lu });
  } catch (error) {
    if (error instanceof AiAllProvidersFailedError) {
      return erreurJson("IA_INDISPONIBLE");
    }
    throw error;
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const parsed = AppliquerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }

  const tenantId = session.user.tenantId;
  const matiere = await matiereAccessible(tenantId, parsed.data.matiereId, session.user);
  if (!matiere) return erreurJson("MATIERE_INTROUVABLE");

  const resultat = await appliquerImport(
    prisma,
    tenantId,
    matiere.id,
    matiere.siteId,
    parsed.data.chapitres
  );

  // Vérification de couverture : après l'import, on signale à l'enseignant
  // combien de couples compétence × palier sont sans question. C'est le
  // moment idéal pour cette alerte — l'enseignant vient de créer les
  // compétences, et il sait maintenant ce qu'il reste à faire pour que
  // l'adaptation fonctionne.
  const competencesImportees = await prisma.competence.findMany({
    where: {
      tenantId,
      chapitre: { matiereId: matiere.id },
      ...siteFilterForModel("competence", session.user),
    },
    select: { id: true, code: true, libelle: true, chapitre: { select: { nom: true } } },
  });

  const comptes = await prisma.question.groupBy({
    by: ["competenceId", "palier"],
    where: {
      tenantId,
      actif: true,
      competenceId: { in: competencesImportees.map((c) => c.id) },
      ...siteFilterForModel("question", session.user),
    },
    _count: { _all: true },
  });

  const paliersPleins = new Set(comptes.map((c) => `${c.competenceId}|${c.palier}`));
  const PALIERS = ["RESTITUTION", "APPLICATION", "CONSOLIDATION", "TRANSFERT", "OUVERTURE"] as const;
  const trous = competencesImportees.flatMap((comp) =>
    PALIERS.filter((p) => !paliersPleins.has(`${comp.id}|${p}`)).map((palier) => ({
      competenceCode: comp.code,
      competenceLibelle: comp.libelle,
      chapitreNom: comp.chapitre.nom,
      palier,
    }))
  );

  return NextResponse.json({
    ...resultat,
    couverture: {
      totalCompetences: competencesImportees.length,
      trous,
      trousTotal: trous.length,
      // Un import qui crée N compétences produit 5N trous potentiels (5
      // paliers par compétence). Le rappeler évite la confusion.
      trousAttendus: competencesImportees.length * PALIERS.length,
    },
  });
}
