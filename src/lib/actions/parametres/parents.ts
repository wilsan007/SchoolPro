"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { auditFire } from "@/lib/audit";

const ParentSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  phone: z.string().min(1, "Le téléphone est requis"),
  phone2: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telegramChatId: z.string().optional(),
  profession: z.string().optional(),
  adresse: z.string().optional(),
});

export type ParentFormData = z.infer<typeof ParentSchema>;

/**
 * Périmètre de site d'un parent.
 *
 * `Parent` ne porte pas de `siteId` et son `userId` est facultatif : passer par
 * `siteFilterForModel("parent", …)`, qui emprunte la relation `user`, ferait
 * disparaître tous les parents sans compte — c'est-à-dire la majorité. Le
 * rattachement réel d'un parent, c'est le site de ses enfants.
 *
 * Un parent sans aucun enfant reste visible : il ne porte encore aucune donnée
 * d'un autre site, et c'est l'état transitoire d'un parent qu'on vient de créer
 * avant de le rattacher. Même règle que `siteFilterForModel` pour les relations
 * vers-plusieurs (`{ some: … } OR { none: {} }`).
 */
function parentSiteScope(claims: SessionSiteClaims): Record<string, unknown> {
  const filtreEleve = siteFilterForModel("eleve", claims);
  if (Object.keys(filtreEleve).length === 0) return {};
  return {
    AND: [
      {
        OR: [
          { enfants: { some: { eleve: filtreEleve } } },
          { enfants: { none: {} } },
        ],
      },
    ],
  };
}

export async function getParentsForSettings() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  // Isolation portée par la relation : le filtre de site est appliqué aux
  // enfants (voir `parentSiteScope`), donc imbriqué et invisible pour la règle.
  // Le modèle nommé était d'ailleurs faux ici — « parent » au lieu de
  // « eleve » — ce qui greffait un prédicat `user.siteId` sur un `Eleve`.
  // eslint-disable-next-line ecolpro/require-site-filter
  return prisma.parent.findMany({
    where: { tenantId: session.user.tenantId, ...parentSiteScope(session.user) },
    include: {
      enfants: {
        // Un parent peut avoir des enfants sur plusieurs sites : sans ce
        // filtre, la fiche affichait ceux des sites hors périmètre.
        where: siteFilterForModel("eleveParent", session.user),
        include: {
          eleve: {
            select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } },
          },
        },
      },
      user: { select: { id: true, email: true, isActive: true } },
    },
    orderBy: { nom: "asc" },
  });
}

export async function getElevesForLinking() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const siteFilter = siteFilterForModel("eleve", session.user);

  return prisma.eleve.findMany({
    where: { tenantId: session.user.tenantId, statut: "ACTIF", ...siteFilter },
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      classe: { select: { nom: true, niveau: true } },
    },
    orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }, { prenom: "asc" }],
  });
}

export async function createParent(data: ParentFormData & { eleveIds?: string[] }) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parsed = ParentSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  const parent = await prisma.parent.create({
    data: {
      tenantId: session.user.tenantId,
      nom: v.nom,
      prenom: v.prenom,
      phone: v.phone,
      phone2: v.phone2 || null,
      email: v.email || null,
      telegramChatId: v.telegramChatId || null,
      profession: v.profession || null,
      adresse: v.adresse || null,
    },
  });

  // Link to students if provided
  if (data.eleveIds && data.eleveIds.length > 0) {
    // Les identifiants viennent du formulaire : sans ce filtrage, on pouvait
    // rattacher un parent à l'élève de n'importe quel site — voire de n'importe
    // quel établissement — en forgeant la liste.
    const elevesAutorises = await prisma.eleve.findMany({
      where: {
        id: { in: data.eleveIds },
        tenantId: session.user.tenantId,
        ...siteFilterForModel("eleve", session.user),
      },
      select: { id: true },
    });

    for (const { id: eleveId } of elevesAutorises) {
      // Identifiant déjà autorisé par la requête site-filtrée ci-dessus, et la
      // clé composite ne peut de toute façon désigner que ce parent-ci.
      // eslint-disable-next-line ecolpro/require-site-filter
      const existing = await prisma.eleveParent.findUnique({
        where: { eleveId_parentId: { eleveId, parentId: parent.id } },
      });
      if (!existing) {
        await prisma.eleveParent.create({
          data: { eleveId, parentId: parent.id, lien: "TUTEUR", isGardien: true },
        });
      }
    }
  }

  revalidatePath("/parametres");
  return { success: true };
}

export async function linkParentToEleves(parentId: string, eleveIds: string[], lien: string = "TUTEUR") {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  // Isolation portée par la relation enfants → élève (voir `parentSiteScope`).
  // eslint-disable-next-line ecolpro/require-site-filter
  const parent = await prisma.parent.findFirst({
    where: {
      id: parentId,
      tenantId: session.user.tenantId,
      ...parentSiteScope(session.user),
    },
  });
  if (!parent) throw new Error("Parent non trouvé");

  // Même raison que dans `createParent` : la liste d'élèves arrive du client et
  // doit être ramenée au périmètre de l'appelant avant tout rattachement.
  const elevesAutorises = await prisma.eleve.findMany({
    where: {
      id: { in: eleveIds },
      tenantId: session.user.tenantId,
      ...siteFilterForModel("eleve", session.user),
    },
    select: { id: true },
  });

  for (const { id: eleveId } of elevesAutorises) {
    // Élève et parent tous deux validés ci-dessus ; la clé composite ne peut
    // désigner qu'un couple déjà autorisé.
    // eslint-disable-next-line ecolpro/require-site-filter
    const existing = await prisma.eleveParent.findUnique({
      where: { eleveId_parentId: { eleveId, parentId } },
    });
    if (!existing) {
      await prisma.eleveParent.create({
        data: { eleveId, parentId, lien: lien as any, isGardien: true },
      });
    }
  }

  revalidatePath("/parametres");
  return { success: true };
}

export async function unlinkParentFromEleve(parentId: string, eleveId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  await prisma.eleveParent.delete({
    where: { eleveId_parentId: { eleveId, parentId } },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function updateParentPhone(parentId: string, phone: string, telegramChatId?: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parent = await prisma.parent.findFirst({
    where: { id: parentId, tenantId: session.user.tenantId, ...siteFilterForModel("parent", session.user) },
  });
  if (!parent) throw new Error("Parent non trouvé");

  await prisma.parent.update({
    where: { id: parentId, tenantId: session.user.tenantId },
    data: {
      phone,
      telegramChatId: telegramChatId || null,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function deleteParent(parentId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const parent = await prisma.parent.findFirst({
    where: { id: parentId, tenantId: session.user.tenantId, ...siteFilterForModel("parent", session.user) },
  });
  if (!parent) throw new Error("Parent non trouvé");

  auditFire({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "parent:delete",
    verdict: "ALLOWED",
    resource: "parent",
    resourceId: parentId,
  });

  await prisma.parent.delete({ where: { id: parentId, tenantId: session.user.tenantId } });

  revalidatePath("/parametres");
  return { success: true };
}

export async function updateUserPhone(userId: string, phone: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "PRINCIPAL") {
    throw new Error("Permissions insuffisantes");
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId, ...siteFilterForModel("user", session.user) },
  });
  if (!user) throw new Error("Utilisateur non trouvé");

  await prisma.user.update({
    where: { id: userId },
    data: { phone: phone || null },
  });

  // Also update parent phone if user is linked to a parent
  if (phone) {
    await prisma.parent.updateMany({
      where: { userId: userId, tenantId: session.user.tenantId },
      data: { phone },
    });
  }

  revalidatePath("/parametres");
  return { success: true };
}
