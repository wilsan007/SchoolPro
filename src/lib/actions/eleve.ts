"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const LienParente = z.enum(["PERE", "MERE", "TUTEUR", "AUTRE"]);

const EleveFormSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  dateNaissance: z.string().min(1, "La date de naissance est requise"),
  lieuNaissance: z.string().optional(),
  nationalite: z.string().optional(),
  sexe: z.enum(["M", "F"]),
  classeId: z.string().optional(),
  statut: z.enum(["ACTIF", "TRANSFERE", "DIPLOME", "EXCLU", "ABANDONNE"]).optional(),
  groupeSanguin: z.string().optional(),
  allergies: z.string().optional(),
  besoinsSpeciaux: z.string().optional(),
  regime: z.enum(["interne", "demi-pensionnaire", "externe"]).optional(),
  transport: z.string().optional(),
  contactUrgenceNom: z.string().optional(),
  contactUrgencePhone: z.string().optional(),
  numeroBoursier: z.string().optional(),
  matricule: z.string().optional(),
  parentNom: z.string().optional(),
  parentPrenom: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().email().optional().or(z.literal("")),
  parentProfession: z.string().optional(),
  parentAdresse: z.string().optional(),
  parentLien: LienParente.optional(),
  parentIsGardien: z.boolean().optional(),
});

export type EleveFormData = z.infer<typeof EleveFormSchema>;

export async function getClassesForTenant() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.classe.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { nom: "asc" },
  });
}

export async function getEleveForEdit(id: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  const eleve = await prisma.eleve.findFirst({
    where: { id, tenantId: session.user.tenantId },
    include: {
      classe: true,
      parents: {
        include: { parent: true },
        orderBy: { isGardien: "desc" },
        take: 1,
      },
    },
  });

  if (!eleve) return null;

  const tuteur = eleve.parents[0]?.parent;
  return {
    ...eleve,
    dateNaissance: eleve.dateNaissance.toISOString().split("T")[0],
    lieuNaissance: eleve.lieuNaissance ?? undefined,
    nationalite: eleve.nationalite ?? undefined,
    groupeSanguin: eleve.groupeSanguin ?? undefined,
    allergies: eleve.allergies ?? undefined,
    besoinsSpeciaux: eleve.besoinsSpeciaux ?? undefined,
    regime: eleve.regime ?? undefined,
    transport: eleve.transport ?? undefined,
    contactUrgenceNom: eleve.contactUrgenceNom ?? undefined,
    contactUrgencePhone: eleve.contactUrgencePhone ?? undefined,
    numeroBoursier: eleve.numeroBoursier ?? undefined,
    parentNom: tuteur?.nom ?? "",
    parentPrenom: tuteur?.prenom ?? "",
    parentPhone: tuteur?.phone ?? "",
    parentEmail: tuteur?.email ?? "",
    parentProfession: tuteur?.profession ?? "",
    parentAdresse: tuteur?.adresse ?? "",
    parentLien: eleve.parents[0]?.lien ?? "PERE",
    parentIsGardien: eleve.parents[0]?.isGardien ?? true,
  };
}

export async function createEleve(data: EleveFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const tenantId = session.user.tenantId;
  const parsed = EleveFormSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const values = parsed.data;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { currentYear: true },
  });
  const anneeInscription = tenant?.currentYear ?? "2025-2026";

  let matricule = values.matricule?.trim();
  if (!matricule) {
    const count = await prisma.eleve.count({ where: { tenantId } });
    matricule = `ECL-${anneeInscription}-${String(count + 1).padStart(4, "0")}`;
  }

  const existing = await prisma.eleve.findUnique({
    where: { tenantId_matricule: { tenantId, matricule } },
  });
  if (existing) throw new Error("Ce matricule existe déjà");

  const eleve = await prisma.eleve.create({
    data: {
      tenantId,
      matricule,
      nom: values.nom,
      prenom: values.prenom,
      dateNaissance: new Date(values.dateNaissance),
      lieuNaissance: values.lieuNaissance || null,
      nationalite: values.nationalite || "SN",
      sexe: values.sexe,
      classeId: values.classeId || null,
      statut: values.statut || "ACTIF",
      groupeSanguin: values.groupeSanguin || null,
      allergies: values.allergies || null,
      besoinsSpeciaux: values.besoinsSpeciaux || null,
      regime: values.regime || null,
      transport: values.transport || null,
      contactUrgenceNom: values.contactUrgenceNom || null,
      contactUrgencePhone: values.contactUrgencePhone || null,
      numeroBoursier: values.numeroBoursier || null,
      anneeInscription,
    },
  });

  if (values.parentNom && values.parentPrenom && values.parentPhone) {
    const parent = await prisma.parent.create({
      data: {
        tenantId,
        nom: values.parentNom,
        prenom: values.parentPrenom,
        phone: values.parentPhone,
        email: values.parentEmail || null,
        profession: values.parentProfession || null,
        adresse: values.parentAdresse || null,
      },
    });

    await prisma.eleveParent.create({
      data: {
        eleveId: eleve.id,
        parentId: parent.id,
        lien: values.parentLien || "PERE",
        isGardien: values.parentIsGardien ?? true,
      },
    });
  }

  revalidatePath("/eleves");
  redirect(`/eleves/${eleve.id}`);
}

export async function updateEleve(id: string, data: EleveFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const tenantId = session.user.tenantId;
  const parsed = EleveFormSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const values = parsed.data;

  const existing = await prisma.eleve.findFirst({
    where: { id, tenantId },
    include: { parents: { include: { parent: true } } },
  });
  if (!existing) throw new Error("Élève non trouvé");

  await prisma.eleve.update({
    where: { id },
    data: {
      nom: values.nom,
      prenom: values.prenom,
      dateNaissance: new Date(values.dateNaissance),
      lieuNaissance: values.lieuNaissance || null,
      nationalite: values.nationalite || "SN",
      sexe: values.sexe,
      classeId: values.classeId || null,
      statut: values.statut || "ACTIF",
      groupeSanguin: values.groupeSanguin || null,
      allergies: values.allergies || null,
      besoinsSpeciaux: values.besoinsSpeciaux || null,
      regime: values.regime || null,
      transport: values.transport || null,
      contactUrgenceNom: values.contactUrgenceNom || null,
      contactUrgencePhone: values.contactUrgencePhone || null,
      numeroBoursier: values.numeroBoursier || null,
    },
  });

  const tuteurLink = existing.parents[0];
  if (values.parentNom && values.parentPrenom && values.parentPhone) {
    if (tuteurLink) {
      await prisma.parent.update({
        where: { id: tuteurLink.parentId },
        data: {
          nom: values.parentNom,
          prenom: values.parentPrenom,
          phone: values.parentPhone,
          email: values.parentEmail || null,
          profession: values.parentProfession || null,
          adresse: values.parentAdresse || null,
        },
      });
      await prisma.eleveParent.update({
        where: { eleveId_parentId: { eleveId: id, parentId: tuteurLink.parentId } },
        data: { lien: values.parentLien || "PERE", isGardien: values.parentIsGardien ?? true },
      });
    } else {
      const parent = await prisma.parent.create({
        data: {
          tenantId,
          nom: values.parentNom,
          prenom: values.parentPrenom,
          phone: values.parentPhone,
          email: values.parentEmail || null,
          profession: values.parentProfession || null,
          adresse: values.parentAdresse || null,
        },
      });
      await prisma.eleveParent.create({
        data: {
          eleveId: id,
          parentId: parent.id,
          lien: values.parentLien || "PERE",
          isGardien: values.parentIsGardien ?? true,
        },
      });
    }
  }

  revalidatePath("/eleves");
  revalidatePath(`/eleves/${id}`);
  redirect(`/eleves/${id}`);
}
