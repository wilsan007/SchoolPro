import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import { roleHasPermission } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ElevesTable } from "@/components/eleves/ElevesTable";
import { ElevesStats } from "@/components/eleves/ElevesStats";
import { ElevesActions } from "@/components/eleves/ElevesActions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ImportElevesButton } from "@/components/eleves/ImportElevesButton";
import { siteFilterForModel } from "@/lib/site-scope";
import { getSitesForUser } from "@/lib/actions/eleve";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getSiteColorMap } from "@/lib/site-colors";
import { isTeacherRole } from "@/lib/teacher-classes";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";
import type { Prisma, Role } from "@prisma/client";

/**
 * Périmètre commun à TOUTES les mesures de la page.
 *
 * Le total affiché et la somme des effectifs par classe doivent provenir du
 * même ensemble de lignes, sans quoi ils se contredisent — c'est ce qui
 * produisait un total de 275 face à des classes totalisant 269 : les
 * statistiques étaient servies depuis `unstable_cache` (60 s) pendant que le
 * tableau lisait la base en direct, si bien qu'une suppression d'élève
 * n'apparaissait que d'un côté.
 */
function baseEleveWhere(
  tenantId: string,
  siteFilter: Record<string, unknown>,
  userRole?: string,
  anneeCourante?: string | null,
  hierarchieClasseIds?: string[] | null,
): Prisma.EleveWhereInput {
  return {
    tenantId,
    ...siteFilter,
    deletedAt: null,
    // Pour les parents : masquer les enfants exclus. Ce filtre doit valoir
    // pour les statistiques comme pour le tableau.
    ...(userRole === "PARENT" && { statut: { not: "EXCLU" } }),
    ...(anneeCourante && { classe: { annee: anneeCourante } }),
    // Périmètre enseignant : restreint aux classes de la hiérarchie
    // (résolue via getClassesHierarchie qui intègre getTeacherScope).
    ...(hierarchieClasseIds && { classeId: { in: hierarchieClasseIds } }),
  } as Prisma.EleveWhereInput;
}

/**
 * Statistiques d'en-tête. Volontairement NON mises en cache : elles sont
 * lues dans la même requête HTTP que le tableau, à partir du même `where`,
 * ce qui rend toute divergence impossible par construction. Ce sont trois
 * agrégats sur une colonne indexée (`tenantId`) — le coût est négligeable
 * devant le risque d'afficher deux vérités différentes.
 */
 
async function getElevesStats(where: Prisma.EleveWhereInput) {
  const [byStatut, bySexe, byRegime, total] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- where reçu en paramètre, déjà filtré par site
    prisma.eleve.groupBy({ by: ["statut"], where, _count: true }),
    // eslint-disable-next-line ecolpro/require-site-filter -- where reçu en paramètre, déjà filtré par site
    prisma.eleve.groupBy({ by: ["sexe"], where, _count: true }),
    // eslint-disable-next-line ecolpro/require-site-filter -- where reçu en paramètre, déjà filtré par site
    prisma.eleve.groupBy({ by: ["regime"], where, _count: true }),
    // eslint-disable-next-line ecolpro/require-site-filter -- where reçu en paramètre, déjà filtré par site
    prisma.eleve.count({ where }),
  ]);

  const statutMap = Object.fromEntries(byStatut.map((s) => [s.statut, s._count]));
  const sexeMap = Object.fromEntries(bySexe.map((s) => [s.sexe, s._count]));
  const regimeMap = Object.fromEntries(byRegime.map((r) => [r.regime ?? "autre", r._count]));

  return {
    total,
    actifs: statutMap["ACTIF"] ?? 0,
    filles: sexeMap["F"] ?? 0,
    garcons: sexeMap["M"] ?? 0,
    internes: regimeMap["interne"] ?? 0,
  };
}

/**
 * Effectif réel de chaque classe, mesuré en base.
 *
 * Le tableau ne charge que les 500 premiers élèves ; compter les lignes
 * chargées sous-estimerait donc les effectifs au-delà de ce plafond, en
 * silence. Un `groupBy` donne le compte exact quel que soit le volume.
 */
async function getEffectifsParClasse(where: Prisma.EleveWhereInput, tenantId: string, noClassLabel: string) {
  // eslint-disable-next-line ecolpro/require-site-filter -- where reçu en paramètre, déjà filtré par site
  const parClasse = await prisma.eleve.groupBy({
    by: ["classeId"],
    where,
    _count: true,
  });

  const effectifs: Record<string, number> = {};
  for (const c of parClasse) {
    // Cle unique = classeId pour eviter l'ambiguite entre deux classes
    // homonymes situees sur des sites differents.
    const key = c.classeId ?? noClassLabel;
    effectifs[key] = (effectifs[key] ?? 0) + c._count;
  }
  return effectifs;
}

/** Classe telle que `ElevesTable` l'attend sur chaque élève. */
type ClasseDuTableau = {
  id: string;
  nom: string;
  niveau: string;
  structure: { type: string } | null;
  site: { id: string; nom: string } | null;
};

async function getElevesData(
  tenantId: string,
  siteFilter: Record<string, unknown>,
  filters: { q?: string; classeId?: string; statut?: string },
  userRole: string | undefined,
  hierarchieClasseIds: string[] | null,
  noClassLabel: string | undefined,
  anneeCourante: string | null | undefined,
  classesParId: Map<string, ClasseDuTableau>,
) {
  // Périmètre de référence : ce que voit l'utilisateur, filtres d'écran mis à
  // part. Statistiques et effectifs par classe en découlent tous les deux.
  // Le scope enseignant est intégré via hierarchieClasseIds (résolu en amont
  // par getClassesHierarchie, qui appelle getTeacherScope en interne).
  const base = baseEleveWhere(tenantId, siteFilter, userRole, anneeCourante, hierarchieClasseIds);

  // Résolution du filtre de classe : le filtre d'écran reste dans la limite
  // des classes autorisées pour un enseignant. La base restreint déjà via
  // classeId: { in: hierarchieClasseIds }, donc on n'ajoute le filtre écran
  // que si une classe spécifique est sélectionnée (et qu'elle est autorisée).
  let resolvedClasseId: Prisma.StringFilter | string | undefined;
  if (hierarchieClasseIds) {
    resolvedClasseId = filters.classeId
      ? (hierarchieClasseIds.includes(filters.classeId)
        ? filters.classeId
        : { in: [] })
      : undefined;
  } else {
    resolvedClasseId = filters.classeId;
  }

  // Périmètre du tableau : le périmètre de référence, restreint par les
  // filtres choisis à l'écran.
  const where = {
    ...base,
    ...(resolvedClasseId !== undefined && { classeId: resolvedClasseId }),
    ...(filters.statut && { statut: filters.statut as "ACTIF" }),
    ...(filters.q && {
      OR: [
        { nom: { contains: filters.q, mode: "insensitive" as const } },
        { prenom: { contains: filters.q, mode: "insensitive" as const } },
        { matricule: { contains: filters.q, mode: "insensitive" as const } },
      ],
    }),
  } as Prisma.EleveWhereInput;

  const [elevesPlats, gardiens, total, stats, effectifs] = await Promise.all([
    // Lecture À PLAT, sans relation imbriquée. Demander `classe` et `parents`
    // dans le même `findMany` faisait émettre à Prisma six requêtes à la suite,
    // dont deux portant plusieurs dizaines de milliers d'identifiants en
    // paramètres : sur une base distante, c'était l'essentiel du temps de la
    // page. La classe vient de la hiérarchie déjà chargée, le tuteur de la
    // lecture suivante.
    // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } in getElevesData
    prisma.eleve.findMany({
      where,
      // Uniquement les colonnes que `ElevesTable` affiche : la fiche complète
      // (santé, contacts d'urgence…) n'a aucune raison de quitter le serveur.
      select: {
        id: true,
        matricule: true,
        nom: true,
        prenom: true,
        dateNaissance: true,
        sexe: true,
        statut: true,
        regime: true,
        photoUrl: true,
        classeId: true,
      },
    }),
    // Tuteur légal de chaque élève du tableau. Le lien élève↔parent n'a pas de
    // site propre : il est borné par l'élève, filtré par le même `where`.
    // eslint-disable-next-line ecolpro/require-site-filter -- borné par `eleve: where` (site et année déjà filtrés)
    prisma.eleveParent.findMany({
      where: { isGardien: true, eleve: where },
      select: { eleveId: true, parent: { select: { nom: true, prenom: true, phone: true } } },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } in getElevesData
    prisma.eleve.count({ where }),
    // Les statistiques d'en-tête décrivent l'établissement (hors filtres
    // d'écran) ; les effectifs par classe décrivent ce que le tableau montre.
    // Sans filtre actif, les deux coïncident — c'est le contrôle que fait
    // naturellement l'utilisateur en additionnant les classes.
    getElevesStats(base),
    getEffectifsParClasse(where, tenantId, noClassLabel ?? "Sans classe"),
  ]);

  // Une classe absente de la hiérarchie (périmètre différent) est lue à part :
  // cas rare, une seule petite requête.
  const classesManquantes = [
    ...new Set(elevesPlats.map((e) => e.classeId).filter((id): id is string => !!id && !classesParId.has(id))),
  ];
  if (classesManquantes.length > 0) {
    // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-annee-filter -- classes des élèves déjà filtrés par site et année
    const complement = await prisma.classe.findMany({
      where: { tenantId, id: { in: classesManquantes } },
      select: { id: true, nom: true, niveau: true, structure: { select: { type: true } }, site: { select: { id: true, nom: true } } },
    });
    for (const c of complement) classesParId.set(c.id, c);
  }

  // Un seul tuteur par élève, comme le `take: 1` d'origine.
  const gardienParEleve = new Map<string, (typeof gardiens)[number]["parent"]>();
  for (const g of gardiens) {
    if (!gardienParEleve.has(g.eleveId)) gardienParEleve.set(g.eleveId, g.parent);
  }

  const eleves = elevesPlats
    .map(({ classeId, ...e }) => {
      const gardien = gardienParEleve.get(e.id);
      return {
        ...e,
        classe: classeId ? classesParId.get(classeId) ?? null : null,
        parents: gardien ? [{ parent: gardien }] : [],
      };
    })
    // Même ordre qu'avant : classe (sans classe en dernier), puis prénom.
    .sort(
      (a, b) =>
        Number(!a.classe) - Number(!b.classe) ||
        (a.classe?.nom ?? "").localeCompare(b.classe?.nom ?? "") ||
        a.prenom.localeCompare(b.prenom),
    );

  return { eleves, total, stats, effectifs };
}

export default async function ElevesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classeId?: string; statut?: string }>;
}) {
  const [session, t, tCommon, sp] = await Promise.all([
    auth(),
    getTranslations("eleves"),
    getTranslations("common"),
    searchParams,
  ]);
  if (!session?.user?.tenantId) redirect("/login");
  await guardPage(session);

  const { q, classeId, statut } = sp;

  const siteFilter = siteFilterForModel("eleve", session.user);
  const currentSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const tenantHasSites = (session.user as { tenantHasSites?: boolean }).tenantHasSites ?? false;
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  // Résolue avant le Promise.all car hierarchieClasseIds est nécessaire
  // à la construction du where de getElevesData.
  const hierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  // Pour les enseignants, restreindre aux classes de la hiérarchie.
  // Pour les non-enseignants, pas de restriction (null).
  const teacherRestriction = session.user.role && isTeacherRole(session.user.role as Role)
    ? hierarchieClasseIds
    : null;
  const classesParId = new Map<string, ClasseDuTableau>(
    hierarchie.flatMap((c) =>
      c.niveaux.flatMap((n) =>
        n.classes.map((cls): [string, ClasseDuTableau] => [
          cls.id,
          {
            id: cls.id,
            nom: cls.nom,
            niveau: cls.niveau,
            structure: cls.structureType ? { type: cls.structureType } : null,
            site: cls.siteId && cls.siteNom ? { id: cls.siteId, nom: cls.siteNom } : null,
          },
        ]),
      ),
    ),
  );
  const [sites, siteColors, { eleves, total, stats, effectifs }] = await Promise.all([
    getSitesForUser(),
    getSiteColorMap(session.user.tenantId),
    getElevesData(
      session.user.tenantId,
      siteFilter,
      { q, classeId, statut },
      session.user.role,
      teacherRestriction,
      t("noClass"),
      anneeCourante,
      classesParId,
    ),
  ]);

  // classeNoms dérivé de la hiérarchie (inclut siteNom pour ElevesTable).
  const classeNoms = hierarchie.flatMap(c =>
    c.niveaux.flatMap(n =>
      n.classes.map(cls => ({ id: cls.id, nom: cls.nom, siteNom: cls.siteNom }))
    )
  );

  const currentSiteName = currentSiteId
    ? (sites.find((s) => s.id === currentSiteId)?.nom ?? tCommon("unknownSite"))
    : session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN"
      ? tCommon("allSites")
      : tCommon("noSite");
  const currentSiteColor = currentSiteId ? siteColors[currentSiteId] : undefined;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={`${stats.actifs} — ${anneeCourante ?? "—"}`}
        site={currentSiteName}
        siteColor={currentSiteColor}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <ElevesStats stats={stats} />
          <div className="flex flex-col sm:flex-row gap-2">
            <ElevesActions q={q} classeId={classeId} statut={statut} />
            {roleHasPermission(session.user.role as string, "eleves:write") && (
              <>
                <ImportElevesButton sites={sites} currentSiteId={currentSiteId} tenantHasSites={tenantHasSites} />
                <Button asChild size="sm" className="gap-2 w-full sm:w-auto">
                  <Link href="/eleves/nouveau">
                    <Plus className="h-4 w-4" />
                    {t("register")}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tableau */}
        <ElevesTable
          eleves={eleves}
          total={total}
          effectifs={effectifs}
          classes={classeNoms}
          hierarchie={hierarchie}
          siteColors={siteColors}
          initialQuery={q ?? ""}
          initialClasse={classeId ?? ""}
          initialStatut={statut ?? ""}
        />
      </div>
    </div>
  );
}
