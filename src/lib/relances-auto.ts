/**
 * EcolPro — Relances automatiques de facturation
 * ============================================================
 * Parcourt les factures en retard ou en attente (échéance dépassée),
 * calcule le reste à payer, et envoie une relance par email au parent
 * de l'élève. Trois niveaux max, un par passage du cron.
 */

import prisma from "@/lib/prisma";
import { auditFire } from "@/lib/audit";
import { sendEmail } from "@/lib/notifications/email";
import { anneeActiveId } from "@/lib/annee-scolaire";

const MAX_NIVEAU = 3;

function messageRelance(
  niveau: number,
  eleveNom: string,
  montant: number,
  devise: string,
  echeance: Date,
): string {
  const dateStr = echeance.toLocaleDateString("fr-FR");
  const montantStr = new Intl.NumberFormat("fr-FR").format(montant);
  const prefixes: Record<number, string> = {
    1: "Première relance",
    2: "Deuxième relance",
    3: "Dernière relance avant mise en recouvrement",
  };
  return (
    `${prefixes[niveau] ?? `Relance niveau ${niveau}`} — ${eleveNom}\n\n` +
    `Nous vous rappelons que la facture d'un montant de ${montantStr} ${devise} ` +
    `devait être réglée avant le ${dateStr}.\n` +
    `Merci de procéder au règlement dans les meilleurs délais.\n\n` +
    `Cordialement,\nL'établissement`
  );
}

/**
 * Envoie les relances automatiques pour tous les tenants.
 * Parcourt les factures EN_RETARD ou EN_ATTENTE dont l'échéance
 * est dépassée, calcule le reste à payer, et envoie une relance
 * par email au parent de l'élève.
 */
export async function envoyerRelancesAutomatiques(): Promise<{
  relances: number;
  details: Record<string, number>;
}> {
  const details: Record<string, number> = { "1": 0, "2": 0, "3": 0 };
  let total = 0;
  const maintenant = new Date();

  // Tâche système : elle balaie délibérément tous les tenants.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const anneeId = await anneeActiveId(tenant.id);
    // eslint-disable-next-line ecolpro/require-site-filter
    const factures = await prisma.facture.findMany({
      where: {
        tenantId: tenant.id,
        statut: { in: ["EN_RETARD", "EN_ATTENTE"] },
        echeance: { lt: maintenant },
        ...(anneeId ? { anneeId } : {}),
      },
      include: {
        eleve: {
          include: {
            // eslint-disable-next-line ecolpro/require-site-filter -- cross-tenant system task
            parents: { include: { parent: { include: { user: { select: { email: true } } } } } },
          },
        },
        // eslint-disable-next-line ecolpro/require-site-filter -- cross-tenant system task
        paiements: { select: { montant: true } },
        relances: { select: { niveau: true } },
      },
    });

    for (const facture of factures) {
      const totalPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
      const restant = facture.montant - totalPaye;
      if (restant <= 0) continue;

      const niveau = Math.min(facture.relances.length + 1, MAX_NIVEAU);
      if (niveau > MAX_NIVEAU) continue;

      const message = messageRelance(
        niveau,
        `${facture.eleve.prenom} ${facture.eleve.nom}`,
        restant,
        facture.devise,
        facture.echeance!,
      );

      // Collecter les emails des parents
      const emails: string[] = [];
      for (const ep of facture.eleve.parents) {
        const parentEmail = ep.parent.user?.email ?? ep.parent.email;
        if (parentEmail) emails.push(parentEmail);
      }

      // Créer la relance même si aucun email (trace papier/courrier)
      const relance = await prisma.relance.create({
        data: {
          tenantId: tenant.id,
          factureId: facture.id,
          niveau,
          canal: "email",
          message,
        },
      });

      // Envoyer l'email si des adresses sont disponibles
      if (emails.length > 0) {
        const sujet = `Relance n°${niveau} — Facture ${facture.numero}`;
        const html = `<p style="white-space: pre-wrap;">${message.replace(/</g, "&lt;")}</p>`;
        await sendEmail(emails, sujet, html);
      }

      auditFire({
        tenantId: tenant.id,
        action: "facturation:relance-auto",
        verdict: "ALLOWED",
        resource: "facture",
        resourceId: facture.id,
        metadata: { niveau, canal: "email", restant, relanceId: relance.id },
      });

      details[String(niveau)] = (details[String(niveau)] ?? 0) + 1;
      total++;
    }
  }

  return { relances: total, details };
}
