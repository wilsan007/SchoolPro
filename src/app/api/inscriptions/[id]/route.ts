import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import {
  logInscription,
  statutSelonPieces,
  TYPES_DOC,
  type DocumentsInscription,
  type PieceDoc,
  type TypeDoc,
} from "@/lib/inscriptions";

/**
 * GET — détail d'un dossier d'inscription + historique complet.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:read");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("candidature", session.user);

  const dossier = await prisma.candidature.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
    include: {
      creePar: { select: { id: true, name: true } },
      validePar: { select: { id: true, name: true } },
      historique: {
        orderBy: { createdAt: "desc" },
        include: { auteur: { select: { name: true } } },
      },
    },
  });

  if (!dossier) {
    return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  }

  return NextResponse.json({ dossier });
}

const PatchSchema = z.object({
  // Ajout / remplacement d'une pièce
  ajouterDocument: z.object({
    type: z.enum(TYPES_DOC as [string, ...string[]]),
    piece: z.object({
      url: z.string(),
      nom: z.string(),
      taille: z.number(),
      mimeType: z.string(),
    }),
  }).optional(),
  // Retrait d'une pièce
  retirerDocument: z.enum(TYPES_DOC as [string, ...string[]]).optional(),
  // Changement de statut manuel (validation / clôture / rouverture)
  dossierStatut: z.enum(["INCOMPLET", "EN_COURS", "COMPLETE", "VALIDE", "CLOS"]).optional(),
  // Modification des informations élève/parent
  infos: z.object({
    nom: z.string().optional(),
    prenom: z.string().optional(),
    lieuNaissance: z.string().optional().nullable(),
    classeVoulue: z.string().optional(),
    parentNom: z.string().optional(),
    parentPrenom: z.string().optional(),
    parentEmail: z.string().optional().nullable(),
    parentPhone: z.string().optional(),
  }).optional(),
  note: z.string().optional(), // ajoute une note interne dans l'historique
});

/**
 * PATCH — met à jour un dossier d'inscription :
 *  - ajouter/retirer une pièce (recalcule automatiquement le statut)
 *  - valider / clôturer / rouvrir le dossier
 *  - modifier les informations élève/parent
 *  - ajouter une note interne
 *
 * Chaque action est tracée dans l'historique d'audit.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:write");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("candidature", session.user);

  const dossier = await prisma.candidature.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilter },
  });
  if (!dossier) {
    return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  }

  const body = await req.json();
  const data = PatchSchema.parse(body);

  const docs: DocumentsInscription =
    (dossier.documentsInscription as DocumentsInscription | null) ?? {};
  const events: Parameters<typeof logInscription>[1][] = [];
  const updateData: Record<string, unknown> = {};

  // 1. Ajout / remplacement d'une pièce
  if (data.ajouterDocument) {
    const type = data.ajouterDocument.type as TypeDoc;
    const piece: PieceDoc = {
      ...data.ajouterDocument.piece,
      ajouteLe: new Date().toISOString(),
      ajouteParId: session.user.id,
    };
    docs[type] = piece;
    updateData.documentsInscription = docs as never;
    events.push({
      tenantId: session.user.tenantId,
      candidatureId: id,
      type: "AJOUT_DOCUMENT",
      description: `Pièce « ${labelPiece(type)} » ajoutée (${data.ajouterDocument.piece.nom}).`,
      auteurId: session.user.id,
      auteurNom: session.user.name,
      donnees: { document: type, nom: data.ajouterDocument.piece.nom },
    });
  }

  // 2. Retrait d'une pièce
  if (data.retirerDocument) {
    const type = data.retirerDocument as TypeDoc;
    delete docs[type];
    updateData.documentsInscription = docs as never;
    events.push({
      tenantId: session.user.tenantId,
      candidatureId: id,
      type: "SUPPRESSION_DOCUMENT",
      description: `Pièce « ${labelPiece(type)} » retirée du dossier.`,
      auteurId: session.user.id,
      auteurNom: session.user.name,
      donnees: { document: type },
    });
  }

  // 3. Recalcul automatique du statut selon les pièces (sauf si VALIDE/CLOS imposé)
  if (data.ajouterDocument || data.retirerDocument) {
    const calcule = statutSelonPieces(docs);
    // Si des pièces sont ajoutées/retirées, on ne rétrograde pas un dossier
    // déjà VALIDÉ/CLOS automatiquement — c'est une décision manuelle.
    if (dossier.dossierStatut !== "VALIDE" && dossier.dossierStatut !== "CLOS") {
      updateData.dossierStatut = calcule === "COMPLETE" ? "COMPLETE" : "INCOMPLET";
      if (calcule === "COMPLETE" && dossier.dossierStatut !== "COMPLETE") {
        events.push({
          tenantId: session.user.tenantId,
          candidatureId: id,
          type: "COMPLETION_DOSSIER",
          description: "Dossier complet : toutes les pièces obligatoires sont fournies.",
          auteurId: session.user.id,
          auteurNom: session.user.name,
        });
      }
    }
  }

  // 4. Changement de statut manuel (validation / clôture / rouverture)
  if (data.dossierStatut && data.dossierStatut !== dossier.dossierStatut) {
    updateData.dossierStatut = data.dossierStatut;
    if (data.dossierStatut === "VALIDE") {
      updateData.valideParId = session.user.id;
      updateData.valideLe = new Date();
      events.push({
        tenantId: session.user.tenantId,
        candidatureId: id,
        type: "VALIDATION_DOSSIER",
        description: "Dossier validé par la direction.",
        auteurId: session.user.id,
        auteurNom: session.user.name,
        donnees: { ancienStatut: dossier.dossierStatut, nouveauStatut: "VALIDE" },
      });
    } else if (data.dossierStatut === "CLOS") {
      updateData.closLe = new Date();
      events.push({
        tenantId: session.user.tenantId,
        candidatureId: id,
        type: "CLOTURE_DOSSIER",
        description: "Dossier clôturé.",
        auteurId: session.user.id,
        auteurNom: session.user.name,
        donnees: { ancienStatut: dossier.dossierStatut, nouveauStatut: "CLOS" },
      });
    } else {
      events.push({
        tenantId: session.user.tenantId,
        candidatureId: id,
        type: "CHANGEMENT_STATUT",
        description: `Statut du dossier : ${dossier.dossierStatut} → ${data.dossierStatut}.`,
        auteurId: session.user.id,
        auteurNom: session.user.name,
        donnees: { ancienStatut: dossier.dossierStatut, nouveauStatut: data.dossierStatut },
      });
    }
  }

  // 5. Modification des informations élève/parent
  if (data.infos) {
    const i = data.infos;
    if (i.nom !== undefined) updateData.nom = i.nom;
    if (i.prenom !== undefined) updateData.prenom = i.prenom;
    if (i.lieuNaissance !== undefined) updateData.lieuNaissance = i.lieuNaissance;
    if (i.classeVoulue !== undefined) updateData.classeVoulue = i.classeVoulue;
    if (i.parentNom !== undefined) updateData.parentNom = i.parentNom;
    if (i.parentPrenom !== undefined) updateData.parentPrenom = i.parentPrenom;
    if (i.parentEmail !== undefined) updateData.parentEmail = i.parentEmail;
    if (i.parentPhone !== undefined) updateData.parentPhone = i.parentPhone;
    events.push({
      tenantId: session.user.tenantId,
      candidatureId: id,
      type: "MODIFICATION_INFOS",
      description: "Informations élève/parent modifiées.",
      auteurId: session.user.id,
      auteurNom: session.user.name,
    });
  }

  // 6. Note interne
  if (data.note) {
    events.push({
      tenantId: session.user.tenantId,
      candidatureId: id,
      type: "NOTE_AJOUTEE",
      description: data.note,
      auteurId: session.user.id,
      auteurNom: session.user.name,
    });
  }

  // Appliquer la mise à jour + tracer l'historique dans une transaction
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.candidature.update({
      where: { id },
      data: updateData as never,
    });
    for (const ev of events) {
      await logInscription(tx, ev);
    }
    return result;
  });

  // Recharger avec les relations pour la réponse
  const refreshed = await prisma.candidature.findFirst({
    where: { id, tenantId: session.user.tenantId, ...siteFilterForModel("candidature", session.user) },
    include: {
      creePar: { select: { id: true, name: true } },
      validePar: { select: { id: true, name: true } },
      historique: {
        orderBy: { createdAt: "desc" },
        include: { auteur: { select: { name: true } } },
        take: 50,
      },
    },
  });

  return NextResponse.json({ dossier: refreshed ?? updated });
}

function labelPiece(type: TypeDoc): string {
  switch (type) {
    case "PHOTO": return "Photo de l'élève";
    case "ACTE_NAISSANCE": return "Acte de naissance";
    case "PIECE_PARENT": return "Pièce d'identité parent";
    case "BULLETIN_SCOLAIRE": return "Bulletin scolaire";
  }
}
