import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
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
  const now = new Date();
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

  const kpis = [
    { label: t("facturesEnAttente"), value: String(facturesEnAttente), color: "text-blue-600" },
    { label: t("facturesEnRetard"), value: String(facturesEnRetard), color: "text-red-600" },
    { label: t("facturesPartielles"), value: String(facturesPartielles), color: "text-orange-600" },
    { label: t("relancesEnvoyees"), value: String(relancesEnvoyees), color: "text-purple-600" },
    { label: t("echeances7Jours"), value: String(echeances7Jours), color: "text-amber-600" },
    { label: t("montantEnSouffrance"), value: montantFormate, color: "text-rose-600" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      </div>
    </div>
  );
}
