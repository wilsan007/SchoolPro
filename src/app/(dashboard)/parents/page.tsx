import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ParentsView } from "@/components/parents/ParentsView";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-filter";
import { guardPage } from "@/lib/guard-page";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

async function getParentsData(tenantId: string, claims: SessionSiteClaims, anneeCourante?: string | null) {
  const parents = await prisma.parent.findMany({
    // `Parent` n'a pas de colonne `siteId` : le rattachement passe par l'utilisateur
    // (chemin canonique déclaré dans SITE_PATHS, identique à tout le reste du code).
    where: {
      tenantId,
      ...siteFilterForModel("parent", claims),
      ...(anneeCourante && { enfants: { some: { eleve: { classe: { annee: anneeCourante } } } } }),
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, lastLoginAt: true } },
      enfants: {
        // Un parent scopé visible peut avoir des enfants sur d'autres sites que
        // celui de l'appelant : ne pas les exposer au-delà de son périmètre.
        where: siteFilterForModel("eleveParent", claims),
        include: {
          eleve: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              matricule: true,
              statut: true,
              classeId: true,
              classe: { select: { nom: true, niveau: true } },
              absences: { select: { id: true }, where: { statut: "INJUSTIFIEE" }, take: 50 },
              notes: { select: { valeur: true, noteMax: true, coefficient: true }, where: { isPubliee: true }, take: 20 },
              bulletins: { select: { moyenneGenerale: true, isPublie: true }, orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  return { parents };
}

export default async function ParentsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("parents"),
  ]);
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const { parents: rawParents } = await getParentsData(session.user.tenantId, session.user, anneeCourante);

  // Récupérer les listes de fournitures publiées pour les classes des enfants
  const classeIds = new Set<string>();
  for (const p of rawParents) {
    for (const ep of p.enfants ?? []) {
      if (ep.eleve.classeId) classeIds.add(ep.eleve.classeId);
    }
  }
  const fournituresParClasse: Record<string, { id: string; type: string; nom: string; description: string | null; quantite: number; format: string | null; prixEstime: number | null; matiere: { nom: string } | null }[]> = {};
  if (classeIds.size > 0) {
    const listes = await prisma.listeFournitureClasse.findMany({
      where: {
        classeId: { in: Array.from(classeIds) },
        tenantId: session.user.tenantId,
        statut: "PUBLIEE",
        ...siteFilterForModel("listeFournitureClasse", session.user),
      },
      include: {
        items: { include: { matiere: { select: { nom: true } } }, orderBy: [{ type: "asc" }, { nom: "asc" }] },
      },
    });
    for (const l of listes) {
      fournituresParClasse[l.classeId] = l.items.map((i) => ({
        id: i.id,
        type: i.type,
        nom: i.nom,
        description: i.description,
        quantite: i.quantite,
        format: i.format,
        prixEstime: i.prixEstime,
        matiere: i.matiere ? { nom: i.matiere.nom } : null,
      }));
    }
  }

  // Mapper 'enfants' (relation Prisma) → 'eleves' (prop attendue par ParentsView)
  const parents = rawParents.map((p) => ({
    ...p,
    eleves: (p.enfants ?? []).map((ep) => ({
      ...ep,
      eleve: {
        ...ep.eleve,
        fournitures: ep.eleve.classeId ? fournituresParClasse[ep.eleve.classeId] ?? [] : [],
      },
    })),
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <ParentsView parents={parents} tenantId={session.user.tenantId} />
      </div>
    </div>
  );
}
