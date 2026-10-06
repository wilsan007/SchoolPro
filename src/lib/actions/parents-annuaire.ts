"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-filter";
import { canAccessRoute } from "@/lib/permissions";
import { overridesPour } from "@/lib/effective-permissions";
import { calculerMoyenne } from "@/lib/utils";
import { lectureAvecReprise } from "@/lib/prisma-reprise";
import type { TypeFourniture } from "@prisma/client";

export type FournitureClasse = {
  id: string;
  type: TypeFourniture;
  nom: string;
  description: string | null;
  quantite: number;
  format: string | null;
  prixEstime: number | null;
  matiere: { nom: string } | null;
};

/** Second temps de l'annuaire des parents : ce qui coûte cher, par enfant. */
export type DetailsEnfant = {
  /** Moyenne pondérée des notes publiées. */
  moyenne: number | null;
  /** Liste de fournitures publiée pour la classe de l'enfant. */
  fournitures: FournitureClasse[];
};

/** Plafond par appel : la vue regroupe ses demandes par lots de cette taille. */
const MAX_ELEVES_PAR_APPEL = 100;

/**
 * Moyenne et fournitures des enfants demandés — le SECOND TEMPS de l'écran
 * `/parents`.
 *
 * L'annuaire s'affiche d'abord sans ces deux informations (les seules lourdes :
 * ~25 000 notes à lire pour un établissement de 1 200 élèves). Elles ne sont
 * chargées que pour les enfants dont la fiche est réellement à l'écran, par
 * lots, au moment où l'utilisateur ouvre un groupe.
 *
 * Mêmes règles que la page : même autorisation (accès à `/parents`), même
 * périmètre (tenant, site du parent, site du lien parent-enfant), mêmes
 * sous-requêtes (notes publiées, plafond de 20) — donc les mêmes chiffres. Un
 * identifiant hors périmètre est simplement absent de la réponse.
 */
export async function chargerDetailsEnfants(eleveIds: string[]): Promise<Record<string, DetailsEnfant>> {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!session?.user?.id || !tenantId) return {};

  const overrides = await overridesPour(session.user.id, tenantId);
  if (!canAccessRoute(session.user.role, "/parents", overrides)) return {};

  const ids = [...new Set(eleveIds.filter((id) => typeof id === "string"))].slice(0, MAX_ELEVES_PAR_APPEL);
  if (ids.length === 0) return {};

  const claims = session.user;
  const eleves = await lectureAvecReprise(() =>
    // eslint-disable-next-line ecolpro/require-site-filter -- périmètre de site porté par le lien parent-enfant et par le parent, comme sur la page
    prisma.eleve.findMany({
      where: {
        id: { in: ids },
        tenantId,
        parents: {
          some: {
            AND: [
              siteFilterForModel("eleveParent", claims),
              { parent: { tenantId, ...siteFilterForModel("parent", claims) } },
            ],
          },
        },
      },
      select: {
        id: true,
        classeId: true,
        notes: { select: { valeur: true, noteMax: true, coefficient: true }, where: { isPubliee: true }, take: 20 },
      },
    }),
  );

  const classeIds = [...new Set(eleves.flatMap((e) => (e.classeId ? [e.classeId] : [])))];
  const listes =
    classeIds.length === 0
      ? []
      : await lectureAvecReprise(() =>
          prisma.listeFournitureClasse.findMany({
            where: {
              classeId: { in: classeIds },
              tenantId,
              statut: "PUBLIEE",
              ...siteFilterForModel("listeFournitureClasse", claims),
            },
            include: {
              items: { include: { matiere: { select: { nom: true } } }, orderBy: [{ type: "asc" }, { nom: "asc" }] },
            },
          }),
        );

  const fournituresParClasse = new Map<string, FournitureClasse[]>();
  for (const l of listes) {
    fournituresParClasse.set(
      l.classeId,
      l.items.map((i) => ({
        id: i.id,
        type: i.type,
        nom: i.nom,
        description: i.description,
        quantite: i.quantite,
        format: i.format,
        prixEstime: i.prixEstime,
        matiere: i.matiere ? { nom: i.matiere.nom } : null,
      })),
    );
  }

  const details: Record<string, DetailsEnfant> = {};
  for (const e of eleves) {
    details[e.id] = {
      moyenne: calculerMoyenne(e.notes),
      fournitures: e.classeId ? (fournituresParClasse.get(e.classeId) ?? []) : [],
    };
  }
  return details;
}
