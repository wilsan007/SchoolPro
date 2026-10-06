"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { anneesDuTenant } from "@/lib/annee-scolaire";

export async function getReglesAppreciation() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.reglesAppreciation.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ contexte: "asc" }, { seuilMin: "asc" }],
  });
}

export async function getPeriodesForCloture() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  // Liste des années déjà tenue en cache (src/lib/annee-scolaire.ts) : pas de
  // requête dédiée pour retrouver l'année active.
  const annee = (await anneesDuTenant(session.user.tenantId)).find((a) => a.isCurrent);
  if (!annee) return [];

  return prisma.periode.findMany({
    where: { anneeId: annee.id, annee: { tenantId: session.user.tenantId } },
    orderBy: { numero: "asc" },
  });
}
