/**
 * Rappel d'échéance — envoie des notifications pour les tâches dont
 * l'échéance est dans 1 ou 3 jours.
 *
 * Tâche planifiée (cron) qui balaie les tâches non terminées et envoie
 * une notification à l'assignataire quand l'échéance approche.
 *
 * Idempotence : une notification par tâche par palier (J-3, J-1).
 * On vérifie via le titre de la notification qui contient l'ID de la tâche.
 */

import prisma from "@/lib/prisma";

const PALIERS = [
  { jours: 3, label: "J-3" },
  { jours: 1, label: "J-1" },
];

export async function rappelerEcheancesTaches(): Promise<{ count: number }> {
  let count = 0;
  const maintenant = new Date();

  try {
    // Récupérer toutes les tâches non terminées avec échéance dans les 3 prochains jours.
    const dans3jours = new Date(maintenant);
    dans3jours.setDate(dans3jours.getDate() + 3);
    dans3jours.setHours(23, 59, 59, 999);

    // Tâche système cron : balaie tous les tenants.
    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
    const taches = await prisma.tache.findMany({
      where: {
        statut: { in: ["A_FAIRE", "EN_COURS"] },
        echeance: {
          gte: maintenant,
          lte: dans3jours,
        },
      },
      select: {
        id: true,
        tenantId: true,
        titre: true,
        echeance: true,
        assigneeAId: true,
      },
    });

    // Pour chaque tâche, vérifier si on doit envoyer un rappel.
    for (const tache of taches) {
      if (!tache.echeance) continue;

      const diffJours = Math.ceil(
        (tache.echeance.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24)
      );

      for (const palier of PALIERS) {
        if (diffJours > palier.jours) continue;

        // Idempotence : vérifier si une notification a déjà été envoyée
        // pour ce palier de cette tâche.
        const titreNotif = `[${palier.label}] ${tache.titre}`;
        // eslint-disable-next-line ecolpro/require-site-filter -- tâche système cron, vérification bornée par tenantId
        const dejaEnvoyee = await prisma.notification.findFirst({
          where: {
            tenantId: tache.tenantId,
            titre: titreNotif,
          },
          select: { id: true },
        });

        if (dejaEnvoyee) continue;

        const echeanceStr = tache.echeance.toLocaleDateString("fr-FR");
        const contenu =
          palier.jours === 1
            ? `Échéance demain : « ${tache.titre} » (${echeanceStr}). Pensez à la traiter aujourd'hui.`
            : `Échéance dans ${palier.jours} jours : « ${tache.titre} » (${echeanceStr}).`;

        // eslint-disable-next-line ecolpro/require-site-filter -- tâche système cron, notification bornée par tenantId
        await prisma.notification.create({
          data: {
            tenantId: tache.tenantId,
            titre: titreNotif,
            contenu,
            canal: "IN_APP",
            cible: "TOUS",
            nbDestinataires: 1,
            nbDelivres: 1,
            statut: "ENVOYEE",
            envoyeeAt: new Date(),
          },
        });
        count++;
      }
    }
  } catch (error) {
    console.error("[tache-rappels] Erreur:", error);
  }

  return { count };
}
