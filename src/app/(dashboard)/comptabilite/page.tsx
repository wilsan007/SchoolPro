import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getSituationFinanciere } from "@/lib/financial-guard";
import { getDemoNow } from "@/lib/demo-now";
import Link from "next/link";

/**
 * Espace du comptable / gestionnaire.
 *
 * Un accueil financier : ce qui est en attente, ce qui est en retard, ce qui
 * est partiellement payé, les relances envoyées et les échéances imminentes.
 * Chaque indicateur pointe vers `/facturation`, l'écran où agir.
 *
 * NB — `StatutFacture` ne définit pas `PARTIELLEMENT_PAYEE` (seules existent
 * `EN_ATTENTE`, `PAYEE`, `EN_RETARD`, `ANNULEE`). Une facture « partiellement
 * payée » est donc une facture non soldée (`EN_ATTENTE` ou `EN_RETARD`) ayant
 * déjà reçu au moins un paiement. Le montant en souffrance agrège de même les
 * factures en retard et les factures en attente déjà partiellement réglées.
 */
export default async function ComptabilitePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("comptabilite"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims = session!.user as SessionSiteClaims;
  const now = await getDemoNow();
  const dans7Jours = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const siteFilterFacture = siteFilterForModel("facture", claims);
  const siteFilterRelance = siteFilterForModel("relance", claims);

  const [
    facturesEnAttente,
    facturesEnRetard,
    facturesPartielles,
    relancesEnvoyees,
    echeances7Jours,
    montantEnSouffrance,
  ] = await Promise.all([
    prisma.facture.count({
      where: {
        tenantId,
        statut: "EN_ATTENTE",
        ...siteFilterFacture,
      },
    }),
    prisma.facture.count({
      where: {
        tenantId,
        statut: "EN_RETARD",
        ...siteFilterFacture,
      },
    }),
    // Factures non soldées ayant déjà reçu au moins un paiement.
    prisma.facture.count({
      where: {
        tenantId,
        statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
        paiements: { some: {} },
        ...siteFilterFacture,
      },
    }),
    prisma.relance.count({
      where: {
        tenantId,
        ...siteFilterRelance,
      },
    }),
    // EcheancePaiement n'a pas de tenantId : le filtre passe par la facture.
    // eslint-disable-next-line ecolpro/require-site-filter -- EcheancePaiement n'a pas de siteId, le filtre passe par la relation facture
    prisma.echeancePaiement.count({
      where: {
        facture: {
          tenantId,
          ...siteFilterFacture,
        },
        dateEcheance: { gte: now, lte: dans7Jours },
        statut: "EN_ATTENTE",
      },
    }),
    // Somme des montants des factures en retard + partiellement payées.
    prisma.facture.aggregate({
      _sum: { montant: true },
      where: {
        tenantId,
        OR: [
          { statut: "EN_RETARD" },
          { statut: "EN_ATTENTE", paiements: { some: {} } },
        ],
        ...siteFilterFacture,
      },
    }),
  ]);

  const montant = montantEnSouffrance._sum?.montant;
  const montantFormate = montant
    ? new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(montant)
    : "—";

  // ──────────────────────────────────────────────────────────────────────
  // 1. Vue par famille : factures en attente/retard groupées par parent
  // ──────────────────────────────────────────────────────────────────────
  const facturesPourFamilles = await prisma.facture.findMany({
    where: {
      tenantId,
      statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
      ...siteFilterFacture,
    },
    include: {
      eleve: {
        select: {
          nom: true,
          prenom: true,
          parents: {
            include: {
              parent: {
                include: {
                  user: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      },
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  // Grouper par parent (parentId) : sommer les montants et collecter les élèves
  const famillesMap = new Map<
    string,
    {
      parentNom: string;
      montantTotal: number;
      nbFactures: number;
      eleves: Set<string>;
    }
  >();

  for (const f of facturesPourFamilles) {
    const parents = f.eleve.parents;
    if (parents.length === 0) continue;
    // On prend le premier parent (gardien si présent, sinon le premier)
    const parent = parents.find((p) => p.isGardien) ?? parents[0];
    const parentId = parent.parent.id;
    const parentNom =
      parent.parent.user?.name ??
      `${parent.parent.prenom} ${parent.parent.nom}`;
    const eleveNom = `${f.eleve.prenom} ${f.eleve.nom}`;

    const existing = famillesMap.get(parentId);
    if (existing) {
      existing.montantTotal += f.montant;
      existing.nbFactures += 1;
      existing.eleves.add(eleveNom);
    } else {
      famillesMap.set(parentId, {
        parentNom,
        montantTotal: f.montant,
        nbFactures: 1,
        eleves: new Set([eleveNom]),
      });
    }
  }

  const familles = Array.from(famillesMap.entries())
    .map(([parentId, data]) => ({
      parentId,
      ...data,
      elevesList: Array.from(data.eleves),
    }))
    .sort((a, b) => b.montantTotal - a.montantTotal);

  // ──────────────────────────────────────────────────────────────────────
  // 2 & 3. Fiche élève administratif + financial-guard
  // ──────────────────────────────────────────────────────────────────────
  const elevesRetardGroup = await prisma.facture.groupBy({
    by: ["eleveId"],
    where: {
      tenantId,
      statut: "EN_RETARD",
      ...siteFilterFacture,
    },
    _count: true,
    _sum: { montant: true },
    orderBy: { _count: { eleveId: "desc" } },
    take: 10,
  });

  const eleveIdsRetard = elevesRetardGroup.map((g) => g.eleveId);

  const elevesAdmin = eleveIdsRetard.length
    ? await prisma.eleve.findMany({
        where: {
          id: { in: eleveIdsRetard },
          ...siteFilterForModel("eleve", claims),
        },
        select: {
          id: true,
          nom: true,
          prenom: true,
          matricule: true,
          classe: { select: { nom: true } },
        },
      })
    : [];

  // Pour chaque élève en retard, récupérer la situation financière (blocage)
  const situations = await Promise.all(
    elevesAdmin.map((e) => getSituationFinanciere(e.id, tenantId, claims))
  );

  // Fusionner les données administratives, le groupBy et la situation
  const elevesRetard = elevesAdmin.map((e) => {
    const grp = elevesRetardGroup.find((g) => g.eleveId === e.id);
    const situation = situations.find((s, i) => elevesAdmin[i].id === e.id);
    return {
      id: e.id,
      nom: `${e.prenom} ${e.nom}`,
      matricule: e.matricule,
      classeNom: e.classe?.nom ?? "—",
      nbFacturesRetard: grp?._count ?? 0,
      montantTotal: grp?._sum?.montant ?? 0,
      estBloque: situation?.estExclu ?? false,
    };
  });

  const kpis = [
    { label: t("facturesEnAttente"), value: String(facturesEnAttente), color: "text-blue-600" },
    { label: t("facturesEnRetard"), value: String(facturesEnRetard), color: "text-red-600" },
    { label: t("facturesPartielles"), value: String(facturesPartielles), color: "text-orange-600" },
    { label: t("relancesEnvoyees"), value: String(relancesEnvoyees), color: "text-purple-600" },
    { label: t("echeances7Jours"), value: String(echeances7Jours), color: "text-amber-600" },
    { label: t("montantEnSouffrance"), value: montantFormate, color: "text-rose-600" },
  ];

  const formatMontant = (n: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(n);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 scrollbar-thin">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <Link
                  href="/facturation"
                  className="mt-2 inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {t("voirFacturation")}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ─── Vue par famille ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("vueFamille")}</CardTitle>
          </CardHeader>
          <CardContent>
            {familles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("aucuneFacture")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">{t("famille")}</th>
                      <th className="pb-2 pr-4 font-medium hidden sm:table-cell">{t("eleve")}</th>
                      <th className="pb-2 pr-4 font-medium text-right">
                        {t("montantDu")}
                      </th>
                      <th className="pb-2 pr-4 font-medium text-right hidden sm:table-cell">
                        {t("nbFactures")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {familles.map((fam) => (
                      <tr key={fam.parentId} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium truncate max-w-[160px]">
                          {fam.parentNom}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground hidden sm:table-cell">
                          {fam.elevesList.join(", ")}
                        </td>
                        <td className="py-2 pr-4 text-right font-semibold text-red-600">
                          {formatMontant(fam.montantTotal)}
                        </td>
                        <td className="py-2 pr-4 text-right hidden sm:table-cell">
                          {fam.nbFactures}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link
                  href="/facturation"
                  className="mt-3 inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {t("voirFacturation")}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Élèves en retard de paiement (fiche administratif + financial-guard) ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("elevesRetard")}</CardTitle>
          </CardHeader>
          <CardContent>
            {elevesRetard.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("aucuneFacture")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">{t("eleve")}</th>
                      <th className="pb-2 pr-4 font-medium hidden sm:table-cell">{t("matricule")}</th>
                      <th className="pb-2 pr-4 font-medium hidden sm:table-cell">{t("classe")}</th>
                      <th className="pb-2 pr-4 font-medium text-right hidden sm:table-cell">
                        {t("nbFactures")}
                      </th>
                      <th className="pb-2 pr-4 font-medium text-right">
                        {t("montantDu")}
                      </th>
                      <th className="pb-2 pr-4 font-medium text-center">
                        {t("statut")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {elevesRetard.map((el) => (
                      <tr key={el.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium truncate max-w-[160px]">{el.nom}</td>
                        <td className="py-2 pr-4 text-muted-foreground hidden sm:table-cell">
                          {el.matricule}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground hidden sm:table-cell">
                          {el.classeNom}
                        </td>
                        <td className="py-2 pr-4 text-right hidden sm:table-cell">
                          {el.nbFacturesRetard}
                        </td>
                        <td className="py-2 pr-4 text-right font-semibold text-red-600">
                          {formatMontant(el.montantTotal)}
                        </td>
                        <td className="py-2 pr-4 text-center">
                          {el.estBloque ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                              {t("bloque")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              {t("actif")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
