import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ElevesTable } from "@/components/eleves/ElevesTable";
import { ElevesStats } from "@/components/eleves/ElevesStats";
import { ElevesActions } from "@/components/eleves/ElevesActions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { ImportElevesButton } from "@/components/eleves/ImportElevesButton";
import { siteFilterForModel } from "@/lib/site-scope";
import { getSitesForUser } from "@/lib/actions/eleve";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getSiteColorMap } from "@/lib/site-colors";
import type { Prisma } from "@prisma/client";

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
  userRole?: string
): Prisma.EleveWhereInput {
  return {
    tenantId,
    ...siteFilter,
    deletedAt: null,
    // Pour les parents : masquer les enfants exclus. Ce filtre doit valoir
    // pour les statistiques comme pour le tableau.
    ...(userRole === "PARENT" && { statut: { not: "EXCLU" } }),
  } as Prisma.EleveWhereInput;
}

/**
 * Statistiques d'en-tête. Volontairement NON mises en cache : elles sont
 * lues dans la même requête HTTP que le tableau, à partir du même `where`,
 * ce qui rend toute divergence impossible par construction. Ce sont trois
 * agrégats sur une colonne indexée (`tenantId`) — le coût est négligeable
 * devant le risque d'afficher deux vérités différentes.
 */
// eslint-disable-next-line ecolpro/require-site-filter -- `where` est construit par baseEleveWhere, qui applique déjà siteFilter
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

const getClassesList = unstable_cache(
  async (tenantId: string, siteFilter: Record<string, unknown>) => {
    // eslint-disable-next-line ecolpro/require-site-filter -- where includes ...siteFilter spread, not detectable inside unstable_cache
    const classes = await prisma.classe.findMany({
      where: { tenantId, ...siteFilter } as Prisma.ClasseWhereInput,
      select: { id: true, nom: true, site: { select: { nom: true } } },
      orderBy: [{ site: { nom: "asc" } }, { nom: "asc" }],
    });
    const seen = new Map<string, { id: string; nom: string; siteNom: string | null }>();
    for (const c of classes) {
      seen.set(c.id, { id: c.id, nom: c.nom, siteNom: c.site?.nom ?? null });
    }
    return Array.from(seen.values());
  },
  ["classes-list"],
  { revalidate: 300, tags: ["classes-list"] }
);

async function getElevesData(
  tenantId: string,
  siteFilter: Record<string, unknown>,
  classeSiteFilter: Record<string, unknown>,
  filters: { q?: string; classeId?: string; statut?: string },
  userRole?: string,
  noClassLabel?: string,
) {
  // Périmètre de référence : ce que voit l'utilisateur, filtres d'écran mis à
  // part. Statistiques et effectifs par classe en découlent tous les deux.
  const base = baseEleveWhere(tenantId, siteFilter, userRole);

  // Périmètre du tableau : le périmètre de référence, restreint par les
  // filtres choisis à l'écran.
  const where = {
    ...base,
    ...(filters.classeId && { classeId: filters.classeId }),
    ...(filters.statut && { statut: filters.statut as "ACTIF" }),
    ...(filters.q && {
      OR: [
        { nom: { contains: filters.q, mode: "insensitive" as const } },
        { prenom: { contains: filters.q, mode: "insensitive" as const } },
        { matricule: { contains: filters.q, mode: "insensitive" as const } },
      ],
    }),
  } as Prisma.EleveWhereInput;

  const [eleves, total, stats, classeNoms, effectifs] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } in getElevesData
    prisma.eleve.findMany({
      where,
      include: {
        // eslint-disable-next-line ecolpro/require-site-filter -- classe is a 1:1 relation, site filter applied at parent query level
        classe: { select: { id: true, nom: true, niveau: true, site: { select: { id: true, nom: true } } } },
        // Le lien élève↔parent n'a pas de site propre : il est borné par
        // l'élève, déjà filtré par le `where` racine. Un parent peut par
        // ailleurs avoir des enfants sur plusieurs sites.
        // eslint-disable-next-line ecolpro/require-site-filter
        parents: {
          include: { parent: { select: { nom: true, prenom: true, phone: true } } },
          where: { isGardien: true },
          take: 1,
        },
      },
      orderBy: [{ classe: { nom: "asc" } }, { prenom: "asc" }],
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } in getElevesData
    prisma.eleve.count({ where }),
    // Les statistiques d'en-tête décrivent l'établissement (hors filtres
    // d'écran) ; les effectifs par classe décrivent ce que le tableau montre.
    // Sans filtre actif, les deux coïncident — c'est le contrôle que fait
    // naturellement l'utilisateur en additionnant les classes.
    getElevesStats(base),
    getClassesList(tenantId, classeSiteFilter),
    getEffectifsParClasse(where, tenantId, noClassLabel ?? "Sans classe"),
  ]);

  return { eleves, total, stats, classeNoms, effectifs };
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
  const classeSiteFilter = siteFilterForModel("classe", session.user);
  const currentSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const tenantHasSites = (session.user as { tenantHasSites?: boolean }).tenantHasSites ?? false;
  const [sites, anneeCourante, siteColors, { eleves, total, stats, classeNoms, effectifs }] = await Promise.all([
    getSitesForUser(),
    getAnneeCouranteLibelle(session.user.tenantId),
    getSiteColorMap(session.user.tenantId),
    getElevesData(session.user.tenantId, siteFilter, classeSiteFilter, {
      q,
      classeId,
      statut,
    }, session.user.role, t("noClass")),
  ]);

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

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <ElevesStats stats={stats} />
          <div className="flex gap-2">
            <ElevesActions q={q} classeId={classeId} statut={statut} />
            <ImportElevesButton sites={sites} currentSiteId={currentSiteId} tenantHasSites={tenantHasSites} />
            <Button asChild size="sm" className="gap-2">
              <Link href="/eleves/nouveau">
                <Plus className="h-4 w-4" />
                {t("register")}
              </Link>
            </Button>
          </div>
        </div>

        {/* Tableau */}
        <ElevesTable
          eleves={eleves}
          total={total}
          effectifs={effectifs}
          classes={classeNoms}
          siteColors={siteColors}
          initialQuery={q ?? ""}
          initialClasse={classeId ?? ""}
          initialStatut={statut ?? ""}
        />
      </div>
    </div>
  );
}
