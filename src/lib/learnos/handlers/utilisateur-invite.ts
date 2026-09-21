/**
 * Handler `utilisateur.invite`
 * ==============================
 *
 * Quand un administrateur crée un compte utilisateur, la personne invitée
 * reçoit un email de bienvenue — sans identifiants : le mot de passe initial
 * est communiqué par l'administrateur par son canal habituel, jamais par
 * email.
 *
 * L'email informe la personne que son compte existe et vers qui se tourner
 * pour récupérer l'accès. L'envoi est best effort : un échec d'email ne fait
 * pas échouer l'invitation.
 */

import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { UtilisateurInvitePayload } from "@/lib/learnos/events";
import { sendEmail, renderNotificationEmail } from "@/lib/notifications/email";

export async function onUtilisateurInvite(event: DrainedEvent): Promise<void> {
  const p = event.payload as UtilisateurInvitePayload;

  if (!p?.userId || !p.email) {
    throw new Error(
      `utilisateur.invite incomplet (événement ${event.id}) : userId/email requis`
    );
  }

  const sujet = `[${p.ecoleNom}] Votre compte a été créé`;
  const contenu =
    `Bonjour ${p.nom},\n\n` +
    `Un compte utilisateur vient d'être créé pour vous sur la plateforme de ${p.ecoleNom}.\n\n` +
    `Pour récupérer vos identifiants de connexion, veuillez contacter l'administration de l'établissement.\n\n` +
    `Cordialement,\n${p.ecoleNom}`;

  await sendEmail([p.email], sujet, renderNotificationEmail(p.ecoleNom, sujet, contenu));
}
