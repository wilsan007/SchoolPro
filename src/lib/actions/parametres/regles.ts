"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId: session.user.tenantId, isCurrent: true },
  });
  if (!annee) return [];

  return prisma.periode.findMany({
    where: { anneeId: annee.id, annee: { tenantId: session.user.tenantId } },
    orderBy: { numero: "asc" },
  });
}
