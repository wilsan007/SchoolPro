import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { auditFire } from "@/lib/audit";
import { sendEmail } from "@/lib/notifications/email";
import { withSystemContext } from "@/lib/rls-context";
import { publishEvent, type UtilisateurInvitePayload } from "@/lib/learnos/events";
import { type SessionSiteClaims } from "@/lib/site-scope";
import { validerMotDePasse } from "@/lib/password-validation";
import {
  INVITATION_TTL_HOURS,
  dateExpiration,
  etatInvitation,
  generateInvitationToken,
  hashInvitationToken,
  isInvitableRole,
  memeEmpreinte,
  normaliserEmailInvitation,
  urlInvitation,
  type EtatInvitation,
} from "@/lib/invitations";

/**
 * ============================================================
 * SchoolPro — Invitations : partie serveur (I/O)
 * ============================================================
 *
 * Le cœur métier (jeton, empreinte, états) vit dans `src/lib/invitations.ts`
 * et reste pur. Ici, on accède à la base et au réseau — c'est le seul endroit
 * où ces dépendances sont admises.
 *
 * DEUX CONTEXTES DE SÉCURITÉ, À NE PAS CONFONDRE
 *   • `creerInvitation` s'exécute DANS une session d'administration : le
 *     périmètre de sites et la permission sont ceux de l'appelant ; le
 *     `tenantId` vient de ses revendications, jamais du corps de la requête.
 *   • `infoInvitation` et `accepterInvitation` s'exécutent AVANT toute session
 *     (le destinataire n'a pas encore de compte). Il n'existe alors AUCUN
 *     contexte de tenant : l'accès passe par `withSystemContext`, comme les
 *     autres opérations pré-authentification du projet. Le jeton est la seule
 *     preuve d'accès — d'où le hachage, l'usage unique et la comparaison à
 *     temps constant.
 */

// ============================================================
// 1. Création (côté administration)
// ============================================================

export interface InvitationEmise {
  id: string;
  email: string;
  /** `true` si Resend a accepté le message (ou si l'envoi est simulé). */
  emailEnvoye: boolean;
  expiresAt: Date;
}

export type RaisonRefusCreation =
  | "ROLE_NON_INVITABLE"
  | "EMAIL_DEJA_UTILISE"
  | "INVITATION_DEJA_EN_ATTENTE"
  | "EMAIL_INVALIDE";

export type ResultatCreationInvitation =
  | { ok: true; invitation: InvitationEmise }
  | { ok: false; raison: RaisonRefusCreation };

export async function creerInvitation(
  params: {
    email: string;
    name?: string | null;
    role: string;
    phone?: string | null;
    siteId?: string | null;
  },
  claims: SessionSiteClaims & { tenantId: string; id?: string; userId?: string },
  origineApp: string
): Promise<ResultatCreationInvitation> {
  const email = normaliserEmailInvitation(params.email);
  // Validation volontairement sommaire (un @, un point) : le juge de paix est
  // l'email lui-même, qui revient ou rebondit.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, raison: "EMAIL_INVALIDE" };
  }
  if (!isInvitableRole(params.role)) {
    return { ok: false, raison: "ROLE_NON_INVITABLE" };
  }

  const tenantId = claims.tenantId;

  // `User.email` est unique au niveau de la PLATEFORME, pas du tenant (même
  // convention que `createUser`) : le contrôle doit donc être inter-tenants,
  // sinon on laisserait créer un doublon qui échouerait ensuite en base.
  // Seule l'existence est utilisée — aucune donnée de l'autre tenant n'est lue.
  // EXCEPTION DOCUMENTÉE (règle 1) — recherche VOLONTAIREMENT inter-tenants :
  // `User.email` est unique au niveau de la plateforme. Restreindre la requête
  // au tenant courant laisserait créer un doublon d'adresse, qui échouerait
  // ensuite en base (erreur opaque) au lieu d'être refusé ici avec un message
  // clair. Même convention que `createUser`
  // (src/lib/actions/parametres/utilisateurs.ts).
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- unicité d'email à l'échelle de la plateforme
  const compteExistant = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (compteExistant) return { ok: false, raison: "EMAIL_DEJA_UTILISE" };

  // Pas de seconde invitation en attente pour la même adresse : la précédente
  // resterait valide, et deux jetons circuleraient en parallèle.
  const dejaEnAttente = await prisma.invitation.findFirst({
    where: { tenantId, email, status: "PENDING" },
    select: { id: true },
  });
  if (dejaEnAttente) return { ok: false, raison: "INVITATION_DEJA_EN_ATTENTE" };

  const { token, tokenHash } = generateInvitationToken();
  const expiresAt = dateExpiration();

  const invitation = await prisma.invitation.create({
    data: {
      tenantId,
      siteId: params.siteId ?? null,
      email,
      name: params.name ?? null,
      role: params.role as never,
      phone: params.phone ?? null,
      tokenHash,
      expiresAt,
      invitedById: claims.userId ?? claims.id ?? null,
    },
    select: { id: true, email: true, expiresAt: true },
  });

  const envoi = await sendEmail(
    [email],
    "Votre invitation à rejoindre SchoolPro",
    htmlInvitation(urlInvitation(token, origineApp))
  );

  auditFire({
    tenantId,
    userId: claims.userId ?? claims.id ?? null,
    action: "utilisateur:invitation",
    verdict: "ALLOWED",
    resource: "invitation",
    resourceId: invitation.id,
  });

  return {
    ok: true,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      emailEnvoye: envoi.success,
      expiresAt: invitation.expiresAt,
    },
  };
}

/** Révoque une invitation en attente (la ligne est conservée pour l'audit). */
export async function revoquerInvitation(
  invitationId: string,
  tenantId: string
): Promise<boolean> {
  const existante = await prisma.invitation.findFirst({
    where: { id: invitationId, tenantId, status: "PENDING" },
    select: { id: true },
  });
  if (!existante) return false;

  await prisma.invitation.update({
    where: { id: invitationId, tenantId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  return true;
}

// ============================================================
// 2. Information (page publique, avant toute session)
// ============================================================

export interface InfoInvitation {
  etat: EtatInvitation;
  /** Adresse partiellement masquée : le destinataire doit pouvoir reconnaître
   *  la sienne, sans qu'un porteur du lien découvre l'adresse complète. */
  emailMasque: string;
  role: string | null;
  nom: string | null;
  siteNom: string | null;
}

/** Masque une adresse : « a***e@e***.dj ». */
function masquerEmail(email: string): string {
  const [local, domaine] = email.split("@");
  if (!domaine) return "***";
  const cacher = (s: string) =>
    s.length <= 2
      ? `${s[0] ?? ""}***`
      : `${s[0]}${"*".repeat(Math.max(1, s.length - 2))}${s.slice(-1)}`;
  const domaineMasque = domaine.includes(".")
    ? domaine.replace(/^[^.]+/, (d) => cacher(d))
    : cacher(domaine);
  return `${cacher(local)}@${domaineMasque}`;
}

/**
 * Informations affichables avant la saisie du mot de passe.
 *
 * Renvoie `null` si le jeton est inconnu. Un jeton expiré, révoqué ou déjà
 * accepté n'est PAS traité comme inconnu : une fois le lien prouvé, la nuance
 * est portée par `etat` — sans quoi le destinataire légitime lirait
 * « invitation introuvable » et croirait à une erreur de saisie.
 */
export async function infoInvitation(token: string): Promise<InfoInvitation | null> {
  const tokenHash = hashInvitationToken(token);

  return withSystemContext("invitation:info", async () => {
    // EXCEPTION DOCUMENTÉE (règle 1) — recherche par JETON, avant toute session.
    // Le destinataire n'a pas encore de compte : le tenant n'est PAS connu à
    // ce stade, il est justement porté par l'invitation. Restreindre par
    // `tenantId` serait impossible sans le divulguer dans l'URL. L'accès est
    // borné autrement : jeton de 256 bits haché, usage unique, expiration, et
    // contexte système explicite (`withSystemContext`).
    // eslint-disable-next-line ecolpro/require-tenant-id -- recherche pré-auth par jeton, tenant inconnu par construction
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      select: {
        email: true,
        name: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        site: { select: { nom: true } },
      },
    });
    if (!invitation) return null;

    return {
      etat: etatInvitation(invitation),
      emailMasque: masquerEmail(invitation.email),
      role: invitation.role,
      nom: invitation.name,
      siteNom: invitation.site?.nom ?? null,
    };
  });
}
// ============================================================
// 3. Acceptation (création du compte)
// ============================================================

export type RaisonRefusAcceptation =
  | "JETON_INCONNU"
  | "EXPIREE"
  | "DEJA_ACCEPTEE"
  | "REVOQUEE"
  | "MOT_DE_PASSE_FAIBLE"
  | "EMAIL_DEJA_UTILISE";

export type ResultatAcceptation =
  | { ok: true; email: string }
  | { ok: false; raison: RaisonRefusAcceptation; erreurs?: string[] };

export async function accepterInvitation(
  token: string,
  password: string
): Promise<ResultatAcceptation> {
  // La politique de mot de passe est CELLE DU PROJET (`validerMotDePasse`) :
  // une seconde règle pour les invitations créerait deux vérités, et
  // l'utilisateur découvrirait le changement au moment où il ne peut plus rien
  // vérifier.
  const erreursMotDePasse = validerMotDePasse(password);
  if (erreursMotDePasse) {
    return { ok: false, raison: "MOT_DE_PASSE_FAIBLE", erreurs: erreursMotDePasse };
  }

  const tokenHash = hashInvitationToken(token);

  return withSystemContext("invitation:accepter", async () => {
    // Même exception que dans `infoInvitation` : recherche par jeton, avant
    // toute session — le tenant est porté par l'invitation, pas par l'appelant.
    // eslint-disable-next-line ecolpro/require-tenant-id -- recherche pré-auth par jeton, tenant inconnu par construction
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        tenantId: true,
        siteId: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });

    if (!invitation) return { ok: false, raison: "JETON_INCONNU" } as const;

    // L'empreinte a été retrouvée par index unique, mais on la recompare en
    // TEMPS CONSTANT : la requête pourrait changer de forme (recherche par
    // préfixe, index partiel) sans que personne ne pense à cette garantie.
    if (!memeEmpreinte(hashInvitationToken(token), tokenHash)) {
      return { ok: false, raison: "JETON_INCONNU" } as const;
    }

    const etat = etatInvitation(invitation);
    if (etat === "EXPIREE") return { ok: false, raison: "EXPIREE" } as const;
    if (etat === "DEJA_ACCEPTEE") return { ok: false, raison: "DEJA_ACCEPTEE" } as const;
    if (etat === "REVOQUEE") return { ok: false, raison: "REVOQUEE" } as const;

    // Le compte a-t-il été créé entre-temps (autre onglet, import) ?
    // Même exception que plus haut : unicité d'email à l'échelle de la
    // plateforme, et nous sommes encore hors session.
    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- unicité d'email à l'échelle de la plateforme
    const compteExistant = await prisma.user.findFirst({
      where: { email: { equals: invitation.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (compteExistant) return { ok: false, raison: "EMAIL_DEJA_UTILISE" } as const;

    const hashed = await bcrypt.hash(password, 10);
    const [firstName, ...restName] = (invitation.name ?? invitation.email).split(" ");
    const lastName = restName.join(" ") || firstName;

    const nouvelUtilisateur = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: invitation.tenantId,
          siteId: invitation.siteId,
          name: invitation.name ?? invitation.email,
          firstName,
          lastName,
          email: invitation.email,
          role: invitation.role,
          phone: invitation.phone,
          password: hashed,
          isActive: true,
          // L'invitation vaut PREUVE de possession de l'adresse : le lien a été
          // ouvert depuis la boîte mail. C'est plus fort que le compte créé par
          // l'administration, dont l'email n'avait jamais été vérifié.
          emailVerified: new Date(),
          // Mot de passe choisi par l'utilisateur lui-même : rien à forcer.
          mustChangePassword: false,
          userTenants: {
            create: {
              tenantId: invitation.tenantId,
              role: invitation.role,
              isActive: true,
              isDefault: true,
            },
          },
          userRoles: {
            create: { tenantId: invitation.tenantId, role: invitation.role },
          },
        },
        select: { id: true },
      });

      // Un enseignant doit exister dans la table métier, sinon il reste
      // invisible dans « Enseignants » et ne peut être affecté à aucune classe.
      // Les affectations (classes × matières) restent à faire par
      // l'administration : on ne les devine pas.
      if (invitation.role === "TEACHER" || invitation.role === "CLASS_TEACHER") {
        await tx.enseignant.create({
          data: {
            tenantId: invitation.tenantId,
            userId: user.id,
            dateEntree: new Date(),
            ...(invitation.siteId
              ? { sites: { create: { siteId: invitation.siteId } } }
              : {}),
          },
        });
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });

      return user;
    });

    auditFire({
      tenantId: invitation.tenantId,
      userId: nouvelUtilisateur.id,
      action: "utilisateur:invitation-acceptee",
      verdict: "ALLOWED",
      resource: "invitation",
      resourceId: invitation.id,
    });

    // LEARNOS : l'arrivée d'un utilisateur est un fait que le moteur consomme
    // (handler `onUtilisateurInvite`, branché sur `utilisateur.invite`).
    // Publié ICI, à l'acceptation, et non à la création de l'invitation : le
    // payload exige un `userId`, qui n'existe qu'une fois le compte créé. Le
    // publier plus tôt obligerait à inventer un identifiant — et le handler
    // rejetterait l'événement faute de `userId` valide.
    const ecole = await prisma.tenant.findUnique({
      where: { id: invitation.tenantId },
      select: { name: true },
    });
    await publishEvent({
      tenantId: invitation.tenantId,
      siteId: invitation.siteId,
      eventType: "utilisateur.invite",
      aggregateType: "user",
      aggregateId: nouvelUtilisateur.id,
      payload: {
        userId: nouvelUtilisateur.id,
        email: invitation.email,
        nom: invitation.name ?? invitation.email,
        role: invitation.role,
        siteId: invitation.siteId,
        ecoleNom: ecole?.name ?? "",
        inviteParId: null,
        dateInvitation: new Date().toISOString(),
      } satisfies UtilisateurInvitePayload,
    });

    return { ok: true, email: invitation.email } as const;
  });
}
// ============================================================
// 4. Gabarit d'email
// ============================================================

function htmlInvitation(lien: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto">
    <h1 style="font-size:20px;color:#1d4ed8">Vous êtes invité(e) à rejoindre SchoolPro</h1>
    <p>Un administrateur de votre établissement a créé un accès à votre nom.</p>
    <p>Cliquez sur ce lien pour choisir votre mot de passe :</p>
    <p><a href="${lien}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Définir mon mot de passe</a></p>
    <p style="color:#475569;font-size:13px">Ce lien est valable ${INVITATION_TTL_HOURS} heures et ne peut servir qu'une fois.</p>
    <p style="color:#94a3b8;font-size:12px;word-break:break-all">${lien}</p>
  </div>`;
}
