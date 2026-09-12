"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

const EtablissementSchema = z.object({
  name: z.string().min(2, "Le nom est requis"),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default("SN"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().optional(),
  siret: z.string().optional(),
  currentYear: z.string().min(1, "L'année scolaire est requise"),
  notationMax: z.number().min(1).max(100),
  langue: z.string().default("fr"),
  timezone: z.string().default("Africa/Dakar"),
  currency: z.string().default("DJF"),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  modeleNiveaux: z.enum(["ANNEES", "FRANCAIS"]).default("ANNEES"),
});

export type EtablissementFormData = z.infer<typeof EtablissementSchema>;

export async function updateEtablissement(data: EtablissementFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Permissions insuffisantes");
  }

  const parsed = EtablissementSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: {
      name: v.name,
      address: v.address || null,
      city: v.city || null,
      country: v.country,
      phone: v.phone || null,
      email: v.email || null,
      website: v.website || null,
      siret: v.siret || null,
      currentYear: v.currentYear,
      notationMax: v.notationMax,
      langue: v.langue,
      timezone: v.timezone,
      currency: v.currency,
      primaryColor: v.primaryColor || null,
      secondaryColor: v.secondaryColor || null,
      modeleNiveaux: v.modeleNiveaux,
    },
  });

  revalidatePath("/parametres");
  revalidateTag("tenant-modele-niveaux");
  return { success: true };
}

export async function getEtablissementData() {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  return prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
  });
}
