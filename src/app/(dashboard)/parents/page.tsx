import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ParentsView } from "@/components/parents/ParentsView";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-filter";
import { guardPage } from "@/lib/guard-page";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { lectureAvecReprise } from "@/lib/prisma-reprise";

/**
 * PREMIER TEMPS de l'annuaire : les parents de l'année, leurs enfants et, pour
 * chacun, classe, absences injustifiées et dernier bulletin.
 *
 * La moyenne et les fournitures — de loin les lectures les plus lourdes — ne
 * sont PAS chargées ici : la vue les demande ensuite, par lots, pour les seuls
 * enfants dont la fiche est à l'écran (`chargerDetailsEnfants`). L'annuaire
 * s'affiche donc sans attendre la lecture de ~25 000 notes.
 *
 * Cinq lectures à plat, en parallèle, assemblées en mémoire : la version
 * d'origine était une seule requête à `include` imbriqués sur quatre niveaux,
 * que Prisma déroule en requêtes successives (15 à 39 s mesurées). Les
 * sous-requêtes par élève gardent exactement les mêmes filtres et plafonds
 * qu'avant : les chiffres affichés sont inchangés.
 */
async function getParentsData(tenantId: string, claims: SessionSiteClaims, anneeCourante?: string | null) {
  // `Parent` n'a pas de colonne `siteId` : le rattachement passe par l'utilisateur
  // (chemin canonique déclaré dans SITE_PATHS, identique à tout le reste du code).
  const parentsVisibles = {
    tenantId,
    ...siteFilterForModel("parent", claims),
    ...(anneeCourante && { enfants: { some: { eleve: { classe: { annee: anneeCourante } } } } }),
  };
  // Sur-ensemble volontaire : tous les enfants des parents visibles. Seuls ceux
  // qu'un lien (filtré par site ci-dessous) référence sont utilisés.
  const enfantsDesParents = { tenantId, parents: { some: { parent: parentsVisibles } } };

  // Lectures longues sur une base distante : une connexion coupée en route est
  // relancée une fois plutôt que de faire tomber la page.
  const [parents, comptes, liens, eleves, classes] = await lectureAvecReprise(() => Promise.all([
    prisma.parent.findMany({ where: parentsVisibles, orderBy: [{ nom: "asc" }, { prenom: "asc" }] }),
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- comptes des parents visibles uniquement, bornés par `parents: parentsVisibles`
    prisma.user.findMany({
      where: { parents: { some: parentsVisibles } },
      select: { id: true, name: true, email: true, avatarUrl: true, lastLoginAt: true },
    }),
    // Un parent scopé visible peut avoir des enfants sur d'autres sites que
    // celui de l'appelant : ne pas les exposer au-delà de son périmètre.
    prisma.eleveParent.findMany({
      where: { AND: [siteFilterForModel("eleveParent", claims), { parent: parentsVisibles }] },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- lecture d'appoint, bornée par les liens filtrés par site
    prisma.eleve.findMany({
      where: enfantsDesParents,
      select: {
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        statut: true,
        classeId: true,
        absences: { select: { id: true }, where: { statut: "INJUSTIFIEE" }, take: 50 },
        bulletins: { select: { moyenneGenerale: true, isPublie: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-annee-filter -- table de correspondance id → nom des classes des enfants
    prisma.classe.findMany({
      where: { tenantId, eleves: { some: enfantsDesParents } },
      select: { id: true, nom: true, niveau: true },
    }),
  ]));

  const classeParId = new Map(classes.map((c) => [c.id, { nom: c.nom, niveau: c.niveau }]));
  const eleveParId = new Map(
    eleves.map(({ absences, ...e }) => [
      e.id,
      {
        ...e,
        classe: e.classeId ? (classeParId.get(e.classeId) ?? null) : null,
        absencesCount: absences.length,
      },
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
    user: p.userId ? (compteParId.get(p.userId) ?? null) : null,
    eleves: enfantsParParent.get(p.id) ?? [],
  }));
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
  const parents = await getParentsData(session.user.tenantId, session.user, anneeCourante);

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
