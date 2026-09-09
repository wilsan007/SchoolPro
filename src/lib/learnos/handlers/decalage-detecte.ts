/**
 * Handler `decalage.detecte`
 * ===========================
 *
 * Quand un décalage pédagogique est détecté entre la planification et la
 * réalité du terrain (cahier-journal), on crée une notification `IN_APP`
 * pour la direction de l'établissement afin qu'elle puisse relancer
 * l'enseignant concerné.
 *
 * Idempotence : on vérifie l'existence d'une notification avec le même
 * `titre` + `contenu` avant de créer. Le `aggregateId` est encodé dans le
 * titre pour garantir l'unicité par événement.
 */

import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { DecalageDetectePayload } from "@/lib/learnos/events";

export async function onDecalageDetecte(event: DrainedEvent): Promise<void> {
  const payload = event.payload as DecalageDetectePayload;
  const { tenantId, aggregateId } = event;

  const titre = `[Décalage] ${aggregateId}`;

  // Idempotence : ne pas recréer si une notification existe déjà pour cet event.
  // Handler LEARNOS — pas de session utilisateur, filtrage par tenantId uniquement.
  // eslint-disable-next-line ecolpro/require-site-filter -- handler event-bus, pas de session
  const existante = await prisma.notification.findFirst({
    where: { tenantId, titre },
    select: { id: true },
  });
  if (existante) return;

  // Rechercher les informations de contexte pour le message.
  // eslint-disable-next-line ecolpro/require-site-filter -- handler event-bus, pas de session
  const chapitre = await prisma.chapitre.findFirst({
    where: { id: payload.chapitreId, tenantId },
    select: { nom: true, matiere: { select: { nom: true } } },
  });

  const classe = payload.classeId
    ? // eslint-disable-next-line ecolpro/require-site-filter -- handler event-bus, pas de session
      await prisma.classe.findFirst({
        where: { id: payload.classeId, tenantId },
        select: { nom: true },
      })
    : null;

  const matiereNom = chapitre?.matiere?.nom ?? "—";
  const chapitreNom = chapitre?.nom ?? "—";
  const classeNom = classe?.nom ?? "—";

  // eslint-disable-next-line ecolpro/require-site-filter -- handler event-bus, pas de session
  await prisma.notification.create({
    data: {
      tenantId,
      canal: "IN_APP",
      statut: "ENVOYEE",
      cible: "DIRECTION",
      titre,
      contenu:
        `Décalage pédagogique en ${matiereNom} : ` +
        `chapitre « ${chapitreNom} » (${classeNom}) — ` +
        `prévu semaine ${payload.semainePrevue}, ` +
        `réalisé semaine ${payload.semaineActuelle}.`,
    },
  });
}
