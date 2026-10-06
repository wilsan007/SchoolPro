"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { auditFire } from "@/lib/audit";
import type { LienParente } from "@prisma/client";
import { checkPermission } from "@/lib/rbac";

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
  const tenantId = session.user.tenantId;

  // Isolation portée par la relation : le filtre de site est appliqué aux
  // enfants (voir `parentSiteScope`), donc imbriqué et invisible pour la règle.
  // Le modèle nommé était d'ailleurs faux ici — « parent » au lieu de
  // « eleve » — ce qui greffait un prédicat `user.siteId` sur un `Eleve`.
  const parentsVisibles = { tenantId, ...parentSiteScope(session.user) };

  // CINQ LECTURES À PLAT, EN PARALLÈLE, assemblées en mémoire.
  //
  // La version précédente était une seule requête Prisma à `include` imbriqués
  // (parent → enfants → élève → classe, + compte). Prisma la déroule en cinq
  // requêtes SUCCESSIVES, chacune recevant en paramètre la liste des
  // identifiants trouvés par la précédente : plusieurs milliers d'identifiants
  // renvoyés à la base à chaque étape. Sur un établissement de 3 700 parents,
  // c'était de loin la lecture la plus lente de l'écran Paramètres.
  //
  // Ici chaque table est lue une fois, filtrée par le même périmètre exprimé
  // en relation — aucune liste d'identifiants ne transite — et les cinq
  // partent ensemble. Le résultat a exactement la même forme.
  const [parents, liens, eleves, classes, comptes] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- périmètre de site porté par `parentSiteScope` (relation enfants)
    prisma.parent.findMany({ where: parentsVisibles, orderBy: { nom: "asc" } }),
    // Un parent peut avoir des enfants sur plusieurs sites : sans le filtre de
    // site, la fiche affichait ceux des sites hors périmètre.
    // `EleveParent` n'a pas de colonne tenantId : borné par `parent: parentsVisibles`.
    prisma.eleveParent.findMany({
      where: { AND: [siteFilterForModel("eleveParent", session.user), { parent: parentsVisibles }] },
    }),
    // Sur-ensemble volontaire : tous les enfants des parents visibles. Seuls
    // ceux qu'un lien (déjà filtré par site ci-dessus) référence sont utilisés.
    // eslint-disable-next-line ecolpro/require-site-filter -- lecture d'appoint, bornée par les liens filtrés par site
    prisma.eleve.findMany({
      where: { tenantId, parents: { some: { parent: parentsVisibles } } },
      select: { id: true, nom: true, prenom: true, matricule: true, classeId: true },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-annee-filter -- table de correspondance id → nom, toutes années : un élève rattaché peut appartenir à n'importe laquelle
    prisma.classe.findMany({
      where: { tenantId },
      select: {
        id: true,
        nom: true,
        niveau: true,
        annee: true,
        siteId: true,
        site: { select: { nom: true } },
        structure: { select: { type: true } },
      },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- comptes des parents visibles uniquement, bornés par `parents: parentsVisibles`
    prisma.user.findMany({
      where: { parents: { some: parentsVisibles } },
      select: { id: true, email: true, isActive: true },
    }),
  ]);

  // Site, année, niveau et structure servent au rangement de l'onglet Parents
  // (catégorie → site → niveau → classe), identique à celui de l'écran Élèves.
  const classeParId = new Map(
    classes.map((c) => [
      c.id,
      {
        id: c.id,
        nom: c.nom,
        niveau: c.niveau,
        annee: c.annee,
        siteId: c.siteId,
        siteNom: c.site?.nom ?? null,
        structureType: c.structure?.type ?? null,
      },
    ]),
  );
  const eleveParId = new Map(
    eleves.map(({ classeId, ...e }) => [
      e.id,
      { ...e, classe: classeId ? (classeParId.get(classeId) ?? null) : null },
    ]),
  );
  const compteParId = new Map(comptes.map((u) => [u.id, u]));

  type Enfant = (typeof liens)[number] & { eleve: NonNullable<ReturnType<typeof eleveParId.get>> };
  const enfantsParParent = new Map<string, Enfant[]>();
  for (const lien of liens) {
    const eleve = eleveParId.get(lien.eleveId);
    if (!eleve) continue;
    const enfants = enfantsParParent.get(lien.parentId);
    if (enfants) enfants.push({ ...lien, eleve });
    else enfantsParParent.set(lien.parentId, [{ ...lien, eleve }]);
  }

  return parents.map((p) => ({
    ...p,
    enfants: enfantsParParent.get(p.id) ?? [],
    user: p.userId ? (compteParId.get(p.userId) ?? null) : null,
  }));
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
      classe: { select: { nom: true, niveau: true, structure: { select: { type: true } } } },
    },
    orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }, { prenom: "asc" }],
  });
}

export async function createParent(data: ParentFormData & { eleveIds?: string[] }) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

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
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

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
        data: { eleveId, parentId, lien: lien as LienParente, isGardien: true },
      });
    }
  }

  revalidatePath("/parametres");
  return { success: true };
}

export async function unlinkParentFromEleve(parentId: string, eleveId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

   
  await prisma.eleveParent.delete({
    where: { eleveId_parentId: { eleveId, parentId } },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function updateParentPhone(parentId: string, phone: string, telegramChatId?: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

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
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

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
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:valider");
  if (denied) throw new Error("Permissions insuffisantes");

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
