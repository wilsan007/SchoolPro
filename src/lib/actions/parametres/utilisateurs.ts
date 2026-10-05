"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { siteFilterForModel, siteIdForCreate, roleRequiresSite, canAccessSite } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { normaliserEmail } from "@/lib/email";
import { generateRandomPassword } from "@/lib/security/password";
import { auditFire } from "@/lib/audit";
import { publishEvent, type UtilisateurInvitePayload } from "@/lib/learnos/events";
import { checkPermission } from "@/lib/rbac";
import { creerInvitation, revoquerInvitation } from "@/lib/invitations-server";

const UserSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide").transform(normaliserEmail),
  role: z.enum([
    "TENANT_ADMIN",
    "PRINCIPAL",
    "SECRETARY",
    "TEACHER",
    "CLASS_TEACHER",
    "COUNSELOR",
    "NURSE",
    "ACCOUNTANT",
    "CAISSIER",
    "PARENT",
  ]),
  phone: z.string().optional(),
  password: z.string().min(8, "Min. 8 caractères").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  // Champs spécifiques aux enseignants — obligatoires si role = TEACHER/CLASS_TEACHER
  matiereId: z.string().optional().nullable(),
  classeIds: z.array(z.string()).default([]),
  // Sites cochés dans le formulaire ; à défaut, le site courant de l'appelant.
  siteIds: z.array(z.string()).optional(),
  // Si role = CLASS_TEACHER, la classe dont il est prof principal
  classePrincipaleId: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.role === "TEACHER" || data.role === "CLASS_TEACHER") {
    if (!data.matiereId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La matière est obligatoire pour un enseignant",
        path: ["matiereId"],
      });
    }
    if (!data.classeIds || data.classeIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Au moins une classe est obligatoire pour un enseignant",
        path: ["classeIds"],
      });
    }
    if (data.role === "CLASS_TEACHER" && !data.classePrincipaleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La classe principale est obligatoire pour un prof principal",
        path: ["classePrincipaleId"],
      });
    }
  }
});

export type UserFormData = z.infer<typeof UserSchema>;

export async function getUsersForTenant() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  // Le périmètre était reconstruit à la main ici, et il était fail-open :
  // sans site sélectionné, `{ siteId: siteId ?? undefined }` devenait une
  // clause vide, l'`OR` était donc satisfait par tout le monde et l'annuaire
  // complet de l'établissement remontait à un compte pourtant borné à un
  // site. Le helper partagé, lui, ne renvoie rien faute de périmètre.
  return prisma.user.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilterForModel("user", session.user),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createUser(data: UserFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

  const parsed = UserSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  // `User.email` est unique au niveau de la plateforme entière, pas du tenant :
  // le contrôle d'unicité doit donc être inter-tenants et inter-sites, sinon on
  // laisserait créer un doublon qui échouerait ensuite en base. Seule
  // l'existence est utilisée, aucune donnée de l'autre tenant n'est exposée.
  // Unicité insensible à la casse : les comptes déjà enregistrés avec une
  // majuscule doivent être détectés comme doublons.
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
  const existing = await prisma.user.findFirst({
    where: { email: { equals: v.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) throw new Error("Un utilisateur avec cet email existe déjà");

  const estEnseignant = v.role === "TEACHER" || v.role === "CLASS_TEACHER";
  const anneeCourante = estEnseignant ? await getAnneeCouranteLibelle(session.user.tenantId) : null;

  // Sites de rattachement, par ordre de priorité : ceux cochés dans le
  // formulaire, le site sur lequel l'appelant est positionné, puis celui de la
  // première classe confiée à l'enseignant.
  let sitesCreation = [...new Set(v.siteIds ?? [])];
  if (sitesCreation.length > 0) {
    const valides = await prisma.site.findMany({
      where: { id: { in: sitesCreation }, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (valides.length !== sitesCreation.length || !sitesCreation.every((id) => canAccessSite(session.user, id))) {
      throw new Error("Un ou plusieurs sites sont invalides");
    }
  } else {
    const courant = siteIdForCreate(session.user);
    if (courant) {
      sitesCreation = [courant];
    } else if (estEnseignant && v.classeIds.length > 0) {
      const premiereClasse = await prisma.classe.findFirst({
        where: { id: v.classeIds[0], tenantId: session.user.tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilterForModel("classe", session.user) },
        select: { siteId: true },
      });
      if (premiereClasse?.siteId) sitesCreation = [premiereClasse.siteId];
    }
  }
  // Sans site, le compte se connecterait avec un périmètre vide et ne verrait
  // rien : refuser plutôt que créer un compte inutilisable.
  if (sitesCreation.length === 0 && roleRequiresSite(v.role) && session.user.tenantHasSites) {
    throw new Error(
      "Cochez au moins un site, ou choisissez-en un dans le sélecteur en haut de page : ce compte doit être rattaché à un site pour pouvoir travailler."
    );
  }
  const rattacher = roleRequiresSite(v.role) ? sitesCreation : [];

  const password = v.password || generateRandomPassword();
  const hashed = await bcrypt.hash(password, 10);

  const [firstName, ...restName] = v.name.split(" ");
  const lastName = restName.join(" ") || firstName;

  const newUser = await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      siteId: sitesCreation.length === 1 ? sitesCreation[0] : null,
      // Les sites autorisés d'une session se lisent dans UserSite, pas dans
      // `siteId` : sans ces lignes, le compte n'aurait accès à aucun site.
      ...(rattacher.length > 0
        ? { userSites: { create: rattacher.map((siteId) => ({ siteId })) } }
        : {}),
      name: v.name,
      email: v.email,
      role: v.role,
      phone: v.phone || null,
      password: hashed,
      isActive: v.isActive,
      // Créer l'entrée UserTenant pour le multi-tenant
      userTenants: {
        create: {
          tenantId: session.user.tenantId,
          role: v.role,
          isActive: v.isActive,
          isDefault: true,
        },
      },
      // Créer l'entrée UserRole pour le multi-rôle
      userRoles: {
        create: {
          tenantId: session.user.tenantId,
          role: v.role,
          isActive: v.isActive,
        },
      },
    },
  });

  // Auto-create Enseignant record for teacher roles + affectations
  if (estEnseignant) {
    const enseignant = await prisma.enseignant.create({
      data: {
        tenantId: session.user.tenantId,
        userId: newUser.id,
        dateEntree: new Date(),
        sites: rattacher.length > 0
          ? { create: rattacher.map((siteId) => ({ siteId })) }
          : undefined,
      },
    });

    // Créer les affectations enseignant → classe → matière
    if (v.matiereId && v.classeIds.length > 0) {
      await prisma.affectationEnseignant.createMany({
        data: v.classeIds.map((classeId) => ({
          tenantId: session.user.tenantId!,
          enseignantId: enseignant.id,
          classeId,
          matiereId: v.matiereId!,
        })),
        skipDuplicates: true,
      });
    }

    // Si prof principal, assigner la classe principale
    if (v.role === "CLASS_TEACHER" && v.classePrincipaleId) {
      await prisma.classe.update({
        where: { id: v.classePrincipaleId, tenantId: session.user.tenantId },
        data: { profPrincipalId: enseignant.id },
      });
    }
  }

  // Auto-create Parent record for parent role
  if (v.role === "PARENT") {
    await prisma.parent.create({
      data: {
        tenantId: session.user.tenantId,
        userId: newUser.id,
        nom: lastName,
        prenom: firstName,
        email: v.email,
        phone: v.phone || "",
      },
    });
  }

  // Bus LEARNOS : publier l'invitation (email de bienvenue côté bus).
  // Best effort — un échec de publication ne fait pas échouer la création.
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true },
    });
    await publishEvent({
      tenantId: session.user.tenantId,
      siteId: newUser.siteId ?? null,
      eventType: "utilisateur.invite",
      aggregateType: "User",
      aggregateId: newUser.id,
      payload: {
        userId: newUser.id,
        email: v.email,
        nom: v.name,
        role: v.role,
        siteId: newUser.siteId ?? null,
        ecoleNom: tenant?.name ?? "votre établissement",
        inviteParId: session.user.id,
        dateInvitation: new Date().toISOString(),
      } satisfies UtilisateurInvitePayload,
    });
  } catch (publishError) {
    console.error("[createUser] Publication utilisateur.invite échouée:", publishError);
  }

  revalidatePath("/parametres");
  return { success: true, userId: newUser.id };
}

export async function toggleUserActive(userId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("user", session.user),
    },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  });

  revalidatePath("/parametres");
  return { success: true };
}

/**
 * Rang hiérarchique d'un rôle pour la réinitialisation de mot de passe : on ne
 * réinitialise que le compte d'un rang STRICTEMENT inférieur au sien. Sans
 * cette règle, un chef d'établissement prendrait la main sur le compte de la
 * direction générale en lui fixant un mot de passe.
 */
function rangHierarchique(role: string): number {
  if (role === "SUPER_ADMIN") return 3;
  if (role === "TENANT_ADMIN") return 2;
  if (role === "PRINCIPAL") return 1;
  return 0;
}

/**
 * Réinitialise le mot de passe d'un compte dont le titulaire ne peut pas
 * utiliser « Mot de passe oublié » (boîte mail inaccessible, élève ou parent
 * sans email exploitable).
 *
 * Un mot de passe temporaire est généré et renvoyé UNE fois à l'appelant ; il
 * n'est écrit nulle part ailleurs (ni journal, ni audit). Le titulaire devra
 * le changer à sa première connexion, et ses sessions ouvertes sont fermées.
 */
export async function reinitialiserMotDePasseUtilisateur(
  userId: string
): Promise<{ success: true; motDePasse: string }> {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

  if (userId === session.user.id) {
    throw new Error("Pour votre propre compte, utilisez « Changer mon mot de passe » dans votre profil.");
  }

  const cible = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("user", session.user),
    },
    select: {
      id: true,
      role: true,
      userTenants: { select: { tenantId: true, role: true } },
      userRoles: { where: { isActive: true }, select: { tenantId: true, role: true } },
    },
  });
  if (!cible) throw new Error("Utilisateur non trouvé");

  // Le rang de la cible est le plus élevé de TOUS ses rôles, dans tous ses
  // établissements : le mot de passe est celui du compte, pas d'un rôle.
  const rangCible = Math.max(
    rangHierarchique(cible.role),
    ...cible.userTenants.map((m) => rangHierarchique(m.role)),
    ...cible.userRoles.map((r) => rangHierarchique(r.role))
  );
  const rangAppelant = rangHierarchique(session.user.role);
  if (rangAppelant <= rangCible) {
    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "user:password:reset",
      verdict: "DENIED",
      resource: "user",
      resourceId: userId,
      reason: "Rang hiérarchique insuffisant",
    });
    throw new Error("Vous ne pouvez réinitialiser que le mot de passe d'un compte de rang inférieur au vôtre.");
  }

  // Un compte rattaché à plusieurs établissements n'appartient pas à un seul
  // d'entre eux : seule la plateforme peut en changer le mot de passe.
  const autresEtablissements = cible.userTenants.some((m) => m.tenantId !== session.user.tenantId);
  if (autresEtablissements && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Ce compte est rattaché à plusieurs établissements : sa réinitialisation relève du support de la plateforme.");
  }

  const motDePasse = generateRandomPassword();
  await prisma.user.update({
    where: { id: cible.id },
    data: {
      password: await bcrypt.hash(motDePasse, 10),
      mustChangePassword: true,
      // Ferme les sessions ouvertes avec l'ancien mot de passe.
      sessionVersion: { increment: 1 },
    },
  });

  auditFire({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "user:password:reset",
    verdict: "ALLOWED",
    resource: "user",
    resourceId: cible.id,
    reason: "Mot de passe temporaire généré par l'administration",
  });

  return { success: true, motDePasse };
}

export async function deleteUser(userId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

  if (userId === session.user.id) throw new Error("Vous ne pouvez pas supprimer votre propre compte");

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("user", session.user),
    },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  // MET-H7 (audit v2) : la suppression définitive détruit des données financières
  // (RemiseCaisse.caissier → Cascade) et des comptes d'autres établissements
  // (userTenant.deleteMany sans filtre tenantId). On désactive le compte et
  // on ne supprime que l'adhésion au tenant courant.
  // La suppression définitive est une opération séparée, réservée à SUPER_ADMIN
  // avec une procédure de purge documentée.

  // 1. Désactiver le compte (soft delete) — préserve les données financières.
  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  // 2. Supprimer uniquement l'adhésion au tenant courant, pas les autres.
   
  await prisma.userTenant.deleteMany({
    where: { userId, tenantId: session.user.tenantId },
  }).catch((e) => console.warn("[non-fatal]", e));

  // 3. Supprimer les affectations de site du tenant courant uniquement.
  await prisma.userSite.deleteMany({
    where: { userId, site: { tenantId: session.user.tenantId } },
  }).catch((e) => console.warn("[non-fatal]", e));

  auditFire({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "user:delete",
    verdict: "ALLOWED",
    resource: "user",
    resourceId: userId,
    metadata: { deletedEmail: user.email, softDelete: true },
  });

  revalidatePath("/parametres");
  return { success: true };
}
// ============================================================
// INVITATION D'UN UTILISATEUR PAR EMAIL
// ============================================================
//
// POURQUOI CETTE ACTION EXISTE
// La création directe (`createUser`) fait choisir un mot de passe à
// l'administration et le lui fait communiquer hors de l'application (au
// téléphone, de vive voix). L'invitation renverse le flux : l'administration ne
// connaît jamais le secret, et l'ouverture du lien par le destinataire prouve
// qu'il possède bien l'adresse.
//
// L'action n'est qu'une ENVELOPPE : elle vérifie la session, la permission et
// le périmètre, puis délègue à `@/lib/invitations-server`, où vit la règle. Une
// seconde implémentation de l'invitation serait une seconde vérité sur la durée
// de validité du jeton et sur les rôles autorisés.

export type ResultatInvitation =
  | { success: true; email: string; emailEnvoye: boolean }
  | { success: false; motif: string };

/** Traduit une raison de refus en clé de libellé (stable, traduisible). */
function cleMotifInvitation(raison: string): string {
  switch (raison) {
    case "ROLE_NON_INVITABLE":
      return "invitationRoleNonInvitable";
    case "EMAIL_DEJA_UTILISE":
      return "invitationEmailDejaUtilise";
    case "INVITATION_DEJA_EN_ATTENTE":
      return "invitationDejaEnAttente";
    case "EMAIL_INVALIDE":
      return "invitationEmailInvalide";
    case "SITE_REQUIS":
      return "invitationSiteRequis";
    default:
      return "genericError";
  }
}

export async function inviterUtilisateur(data: {
  email: string;
  name?: string;
  role: string;
  phone?: string;
  siteId?: string;
}): Promise<ResultatInvitation> {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Même permission que la création de compte : inviter, c'est créer un accès.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisances");

  const origine = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const resultat = await creerInvitation(
    {
      email: data.email,
      name: data.name ?? null,
      role: data.role,
      phone: data.phone ?? null,
      // Le site vient du formulaire, jamais d'un défaut implicite : une
      // invitation sans site est légitime (direction), mais elle doit être un
      // choix visible.
      siteId: data.siteId ?? null,
    },
    { ...session.user, tenantId: session.user.tenantId },
    origine
  );

  if (!resultat.ok) {
    return { success: false, motif: cleMotifInvitation(resultat.raison) };
  }

  revalidatePath("/parametres");
  return {
    success: true,
    email: resultat.invitation.email,
    emailEnvoye: resultat.invitation.emailEnvoye,
  };
}

/** Révoque une invitation encore en attente. */
export async function revoquerInvitationAction(invitationId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

  const ok = await revoquerInvitation(invitationId, session.user.tenantId);
  if (ok) revalidatePath("/parametres");
  return ok;
}

/** Invitations en attente de l'établissement (pour l'affichage de suivi). */
export async function getInvitationsEnAttente() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) return [];

  return prisma.invitation.findMany({
    where: { tenantId: session.user.tenantId, status: "PENDING" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      expiresAt: true,
      site: { select: { nom: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
