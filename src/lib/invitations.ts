import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * ============================================================
 * SchoolPro — Invitations d'utilisateurs (cœur métier, sans I/O)
 * ============================================================
 *
 * POURQUOI CE MODULE EXISTE
 * Jusqu'ici un compte était créé par l'administration avec un mot de passe
 * provisoire communiqué hors de l'application (oralement, par téléphone), et
 * `mustChangePassword` forçait son remplacement à la première connexion. Le
 * secret transitait donc par un canal non maîtrisé, et rien ne prouvait que
 * l'adresse email appartenait à son destinataire.
 *
 * L'invitation renverse le flux : l'administration saisit l'adresse, un jeton à
 * usage unique part par email, et c'est le destinataire qui définit SON mot de
 * passe. Aucun secret ne circule en clair.
 *
 * PRINCIPES DE SÉCURITÉ
 *   • le jeton n'est jamais stocké en clair : seule son empreinte SHA-256 est
 *     persistée (`Invitation.tokenHash`). Un vol de la table ne permet pas de
 *     rejouer une invitation ;
 *   • le jeton est aléatoire (256 bits, base64url) et à usage unique ;
 *   • il expire (`INVITATION_TTL_HOURS`) ;
 *   • la comparaison d'empreintes est à temps constant (`timingSafeEqual`) :
 *     une comparaison naïve laisserait fuir, par le temps de réponse, combien
 *     d'octets de l'empreinte devinée étaient corrects.
 *
 * Ce module est volontairement PUR (aucun accès base ni réseau) : il est
 * testable sans mock, et réutilisable côté serveur uniquement.
 */

/** Durée de validité d'une invitation (heures). */
export const INVITATION_TTL_HOURS = 72;

/** Chemin public d'acceptation d'une invitation. */
export const INVITATION_URL_PATH = "/accept-invitation";

/**
 * Rôles qu'un administrateur peut attribuer par invitation.
 *
 * Volontairement EXCLUS :
 *   • `SUPER_ADMIN` — compte de plateforme, créé hors des établissements ;
 *   • `STUDENT` — les comptes élèves naissent de l'import (matricule comme
 *     identifiant, date de naissance comme mot de passe provisoire) ; les
 *     inviter par email suppose de connaître une adresse qu'ils n'ont pas
 *     toujours.
 */
export const INVITABLE_ROLES = [
  "TENANT_ADMIN",
  "PRINCIPAL",
  "SECRETARY",
  "TEACHER",
  "CLASS_TEACHER",
  "COUNSELOR",
  "NURSE",
  "ACCOUNTANT",
  "SUPERVISOR",
  "SITE_MANAGER",
  "PARENT",
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

/** Jeton brut (transmis par email) + empreinte (persistée). */
export interface GeneratedInvitationToken {
  token: string;
  tokenHash: string;
}

/** Empreinte SHA-256 (hex) d'un jeton. Fonction de sens unique. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Génère un jeton d'invitation cryptographiquement sûr (256 bits, base64url)
 * et l'empreinte à stocker en base.
 */
export function generateInvitationToken(): GeneratedInvitationToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

/**
 * Deux empreintes correspondent-elles, en temps constant ?
 *
 * Les deux longueurs sont comparées d'abord : `timingSafeEqual` LÈVE si elles
 * diffèrent, ce qui serait un plantage là où l'on attend simplement « non ».
 */
export function memeEmpreinte(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** État effectif d'une invitation, du point de vue du destinataire. */
export type EtatInvitation = "VALIDE" | "EXPIREE" | "DEJA_ACCEPTEE" | "REVOQUEE";

export interface InvitationEtatLike {
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
}

/**
 * État effectif d'une invitation à l'instant donné.
 *
 * L'ordre des contrôles n'est pas indifférent : une invitation révoquée reste
 * révoquée même si elle est aussi expirée (la révocation est une décision
 * explicite, l'expiration une conséquence du temps), et une invitation acceptée
 * ne redevient jamais valide.
 */
export function etatInvitation(
  invitation: InvitationEtatLike,
  maintenant: Date = new Date()
): EtatInvitation {
  if (invitation.revokedAt || invitation.status === "REVOKED") return "REVOQUEE";
  if (invitation.acceptedAt || invitation.status === "ACCEPTED") return "DEJA_ACCEPTEE";
  if (invitation.expiresAt.getTime() <= maintenant.getTime()) return "EXPIREE";
  return "VALIDE";
}

/** L'invitation peut-elle être acceptée ? */
export function peutEtreAcceptee(
  invitation: InvitationEtatLike,
  maintenant: Date = new Date()
): boolean {
  return etatInvitation(invitation, maintenant) === "VALIDE";
}

/** Date d'expiration d'une invitation émise maintenant. */
export function dateExpiration(maintenant: Date = new Date()): Date {
  return new Date(maintenant.getTime() + INVITATION_TTL_HOURS * 3600 * 1000);
}

/** URL publique d'acceptation, à partir de l'origine de l'application. */
export function urlInvitation(token: string, origineApp: string): string {
  const base = origineApp.replace(/\/+$/, "");
  return `${base}${INVITATION_URL_PATH}?token=${encodeURIComponent(token)}`;
}

/**
 * Normalise une adresse email pour la comparaison.
 *
 * `User.email` est unique au niveau de la plateforme entière (convention déjà
 * appliquée par `createUser`), et la casse ne doit pas créer de faux doublons :
 * « Direction@Ecole.dj » et « direction@ecole.dj » désignent le même compte.
 */
export function normaliserEmailInvitation(email: string): string {
  return email.trim().toLowerCase();
}