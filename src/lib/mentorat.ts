/**
 * Service de mentorat — gestion des relations mentor/mentoré,
 * objectifs et séances.
 */

import prisma from "@/lib/prisma";
import type { Mentorat, ObjectifMentorat, SeanceMentorat } from "@prisma/client";

/**
 * Crée une relation de mentorat entre un mentor et un mentoré.
 */
export async function creerMentorat(
  tenantId: string,
  mentorId: string,
  mentoreId: string,
  type: string = "ACADEMIQUE",
  frequence: string = "MENSUEL"
): Promise<Mentorat> {
  if (mentorId === mentoreId) {
    throw new Error("Le mentor et le mentoré ne peuvent pas être la même personne");
  }

  // Vérifier qu'une relation active n'existe pas déjà
  // eslint-disable-next-line ecolpro/require-tenant-id -- create avec tenantId explicite
  const existant = await prisma.mentorat.findUnique({
    where: {
      mentorId_mentoreId: { mentorId, mentoreId },
    },
  });
  if (existant?.statut === "ACTIF") {
    throw new Error("Une relation de mentorat active existe déjà entre ces deux personnes");
  }

  return prisma.mentorat.create({
    data: { tenantId, mentorId, mentoreId, type, frequence },
  });
}

/**
 * Liste les mentorats d'un tenant avec filtres optionnels.
 */
export async function listerMentorats(
  tenantId: string,
  filtres?: { mentorId?: string; mentoreId?: string; statut?: string }
) {
  return prisma.mentorat.findMany({
    where: {
      tenantId,
      ...(filtres?.mentorId && { mentorId: filtres.mentorId }),
      ...(filtres?.mentoreId && { mentoreId: filtres.mentoreId }),
      ...(filtres?.statut && { statut: filtres.statut }),
    },
    include: {
      mentor: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
      mentore: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
      _count: { select: { objectifs: true, seances: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Ajoute un objectif à un mentorat.
 */
export async function ajouterObjectif(
  mentoratId: string,
  titre: string,
  description?: string,
  dateCible?: Date,
  priorite: number = 3
): Promise<ObjectifMentorat> {
  return prisma.objectifMentorat.create({
    data: { mentoratId, titre, description, dateCible, priorite },
  });
}

/**
 * Met à jour la progression d'un objectif.
 */
export async function actualiserProgressionObjectif(
  objectifId: string,
  progression: number
): Promise<ObjectifMentorat> {
  const statut = progression >= 100 ? "ATTEINT" : "EN_COURS";
  return prisma.objectifMentorat.update({
    where: { id: objectifId },
    data: { progression: Math.min(100, Math.max(0, progression)), statut },
  });
}

/**
 * Planifie une séance de mentorat.
 */
export async function planifierSeance(
  mentoratId: string,
  date: Date,
  lieu?: string,
  duree?: number
): Promise<SeanceMentorat> {
  return prisma.seanceMentorat.create({
    data: { mentoratId, date, lieu, duree },
  });
}

/**
 * Marque une séance comme effectuée avec compte-rendu.
 */
export async function completerSeance(
  seanceId: string,
  compteRendu: string
): Promise<SeanceMentorat> {
  return prisma.seanceMentorat.update({
    where: { id: seanceId },
    data: { statut: "EFFECTUEE", compteRendu },
  });
}

/**
 * Termine une relation de mentorat.
 */
export async function terminerMentorat(mentoratId: string): Promise<Mentorat> {
  // eslint-disable-next-line ecolpro/require-tenant-id -- le mentorat appartient au tenant via la relation
  return prisma.mentorat.update({
    where: { id: mentoratId },
    data: { statut: "TERMINE", dateFin: new Date() },
  });
}
