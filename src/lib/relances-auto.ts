/**
 * EcolPro — Relances automatiques de facturation
 * ============================================================
 * Parcourt les factures en retard ou en attente (échéance dépassée),
 * calcule le reste à payer, et envoie une relance par email au parent
 * de l'élève. Trois niveaux max, un par passage du cron.
 *
 * MET-H4 (audit v2) : délai minimum entre les niveaux de relance
 * (3 jours par défaut) et plafond strict de 3 relances par facture.
 * Une facture déjà au niveau 3 ne reçoit plus aucune relance.
 */

import prisma from "@/lib/prisma";
import { auditFire } from "@/lib/audit";
import { sendEmail } from "@/lib/notifications/email";
import { anneeActiveId } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

const MAX_NIVEAU = 3;

/**
 * Délai minimum en jours entre deux niveaux de relance.
 * Niveau 1 : immédiat à l'échéance.
 * Niveau 2 : 3 jours après le niveau 1.
 * Niveau 3 : 3 jours après le niveau 2.
 */
const DELAI_ENTRE_NIVEAUX_JOURS = 3;

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
 * Détermine si une relance doit être envoyée pour cette facture,
 * en respectant le délai minimum entre niveaux et le plafond.
 *
 * @param relancesExistantes les relances déjà envoyées (triées par date)
 * @param maintenant la date de référence (Time Machine)
 * @returns le niveau de la relance à envoyer, ou null si aucune relance due
 */
function niveauRelanceDue(
  relancesExistantes: { niveau: number; envoyeeLe: Date }[],
  maintenant: Date,
): number | null {
  // Pas de relance : niveau 1 (si l'échéance est dépassée, vérifié par l'appelant).
  if (relancesExistantes.length === 0) {
    return 1;
  }

  // Plafond strict : au niveau 3, on ne relance plus jamais.
  const niveauMaxAtteint = Math.max(...relancesExistantes.map(r => r.niveau));
  if (niveauMaxAtteint >= MAX_NIVEAU) {
    return null;
  }

  // Trouver la dernière relance envoyée (la plus récente).
  const derniereRelance = relancesExistantes
    .slice()
    .sort((a, b) => b.envoyeeLe.getTime() - a.envoyeeLe.getTime())[0];

  // Délai minimum écoulé depuis la dernière relance ?
  const delaiMinMs = DELAI_ENTRE_NIVEAUX_JOURS * 24 * 60 * 60 * 1000;
  const tempsEcoule = maintenant.getTime() - derniereRelance.envoyeeLe.getTime();

  if (tempsEcoule < delaiMinMs) {
    return null; // Trop tôt pour relancer.
  }

  // Niveau suivant.
  return Math.min(niveauMaxAtteint + 1, MAX_NIVEAU);
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
  const maintenant = await getDemoNow();

  // Tâche système : elle balaie délibérément tous les tenants.
   
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
        relances: { select: { niveau: true, envoyeeLe: true } },
      },
    });

    for (const facture of factures) {
      const totalPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
      const restant = facture.montant - totalPaye;
      if (restant <= 0) continue;

      // MET-H4 : vérifier le délai et le plafond avant de relancer.
      const niveau = niveauRelanceDue(facture.relances, maintenant);
      if (niveau === null) continue;

      const message = messageRelance(
        niveau,
        `${facture.eleve?.prenom ?? ""} ${facture.eleve?.nom ?? ""}`,
        restant,
        facture.devise,
        facture.echeance!,
      );

      // Collecter les emails des parents
      const emails: string[] = [];
      for (const ep of facture.eleve?.parents ?? []) {
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
        await sendEmail(emails, sujet, html, {
          tenantId: tenant.id,
          type: "relance",
          resourceId: facture.id,
        });
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
