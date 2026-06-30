/**
 * EcolPro — Orchestrateur d'envoi des notifications
 * ============================================================
 * Résout les destinataires selon la cible, envoie via le bon canal
 * (EMAIL / SMS / PUSH / IN_APP), met à jour les compteurs et purge
 * les tokens push invalides.
 */

import prisma from "@/lib/prisma";
import { sendEmail, renderNotificationEmail } from "./email";
import { sendSMS } from "@/lib/sms/africasTalking";
import { sendPush } from "./push";

interface Recipients {
  emails: string[];
  phones: string[];
  userIds: string[];
}

/**
 * Détermine les coordonnées des destinataires d'un tenant selon la cible.
 * Note : la cible ELEVES vise les tuteurs des élèves actifs (les élèves
 * n'ont pas toujours de compte / coordonnées propres).
 */
async function resolveRecipients(
  tenantId: string,
  cible: string,
  classeId?: string | null,
  niveau?: string | null
): Promise<Recipients> {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const userIds = new Set<string>();

  const addParents = (
    parents: { email: string | null; phone: string | null; userId: string | null }[]
  ) => {
    for (const p of parents) {
      if (p.email) emails.add(p.email);
      if (p.phone) phones.add(p.phone);
      if (p.userId) userIds.add(p.userId);
    }
  };

  switch (cible) {
    case "TOUS": {
      const users = await prisma.user.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, email: true },
      });
      users.forEach((u) => { if (u.email) emails.add(u.email); userIds.add(u.id); });
      const parents = await prisma.parent.findMany({
        where: { tenantId },
        select: { email: true, phone: true, userId: true },
      });
      addParents(parents);
      break;
    }
    case "PARENTS": {
      const parents = await prisma.parent.findMany({
        where: { tenantId },
        select: { email: true, phone: true, userId: true },
      });
      addParents(parents);
      break;
    }
    case "ENSEIGNANTS": {
      const ens = await prisma.enseignant.findMany({
        where: { tenantId },
        select: { user: { select: { id: true, email: true } } },
      });
      ens.forEach((e) => {
        if (e.user?.email) emails.add(e.user.email);
        if (e.user?.id) userIds.add(e.user.id);
      });
      break;
    }
    case "ELEVES":
    case "CLASSE":
    case "NIVEAU": {
      const parents = await prisma.parent.findMany({
        where: {
          tenantId,
          enfants: {
            some: {
              eleve: {
                statut: "ACTIF",
                ...(cible === "CLASSE" && classeId ? { classeId } : {}),
                ...(cible === "NIVEAU" && niveau ? { classe: { niveau } } : {}),
              },
            },
          },
        },
        select: { email: true, phone: true, userId: true },
      });
      addParents(parents);
      break;
    }
  }

  return {
    emails: [...emails],
    phones: [...phones],
    userIds: [...userIds],
  };
}

export interface DispatchResult {
  canal: string;
  nbDestinataires: number;
  nbDelivres: number;
  success: boolean;
}

/**
 * Envoie effectivement une notification déjà enregistrée en base.
 * Met à jour son statut et ses compteurs.
 */
export async function dispatchNotification(notificationId: string): Promise<DispatchResult> {
  const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notif) throw new Error("Notification introuvable");

  const tenant = await prisma.tenant.findUnique({
    where: { id: notif.tenantId },
    select: { name: true },
  });
  const ecoleNom = tenant?.name ?? "EcolPro";

  const { emails, phones, userIds } = await resolveRecipients(
    notif.tenantId,
    notif.cible,
    notif.classeId,
    notif.niveau
  );

  let nbDelivres = 0;
  let nbDestinataires = 0;
  let success = true;

  switch (notif.canal) {
    case "EMAIL": {
      nbDestinataires = emails.length;
      const html = renderNotificationEmail(ecoleNom, notif.titre, notif.contenu);
      const r = await sendEmail(emails, `[${ecoleNom}] ${notif.titre}`, html);
      nbDelivres = r.sent;
      success = r.success;
      break;
    }
    case "SMS": {
      nbDestinataires = phones.length;
      const r = await sendSMS(phones, `[${ecoleNom}] ${notif.titre}\n${notif.contenu}`);
      nbDelivres = r.success ? phones.length : 0;
      success = r.success;
      break;
    }
    case "PUSH": {
      const devices = await prisma.deviceToken.findMany({
        where: { userId: { in: userIds }, isActive: true },
        select: { token: true },
      });
      const tokens = devices.map((d) => d.token);
      nbDestinataires = tokens.length;
      const r = await sendPush(tokens, {
        title: notif.titre,
        body: notif.contenu,
        data: { notificationId: notif.id },
      });
      nbDelivres = r.sent;
      success = r.success;
      // Purge des tokens invalides
      if (r.invalidTokens.length > 0) {
        await prisma.deviceToken.updateMany({
          where: { token: { in: r.invalidTokens } },
          data: { isActive: false },
        });
      }
      break;
    }
    case "IN_APP":
    default: {
      // Déjà persistée : visible dans l'app. Destinataires = comptes ciblés.
      nbDestinataires = userIds.length;
      nbDelivres = userIds.length;
      success = true;
      break;
    }
  }

  await prisma.notification.update({
    where: { id: notif.id },
    data: {
      statut: success ? "ENVOYEE" : "ECHEC",
      envoyeeAt: new Date(),
      nbDestinataires,
      nbDelivres,
    },
  });

  return { canal: notif.canal, nbDestinataires, nbDelivres, success };
}
