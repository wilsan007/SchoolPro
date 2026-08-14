import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { eleveScopeFilter, mergeFilters } from "@/lib/site-scope";
import { ArrowLeft } from "lucide-react";

/**
 * Détail d'une facture, vu par un parent.
 *
 * Le rôle PARENT n'a pas `finance:read` : il ne peut pas accéder à
 * `/facturation/[id]`. Cette route dédiée affiche la facture de son enfant
 * en lecture seule, après avoir vérifié que la facture appartient à l'un de
 * ses enfants (`eleveScopeFilter`) ET qu'il est le tuteur légal
 * (`isGardien: true`). Un tuteur non gardien est redirigé vers
 * `/acces-bloque`.
 */
export default async function ParentFactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, t, tc] = await Promise.all([
    auth(),
    getTranslations("learnos.dossier"),
    getTranslations("common"),
  ]);
  await guardPage(session);

  if (session!.user.role !== "PARENT") redirect("/dashboard");

  const tenantId = session!.user.tenantId!;
  const { id } = await params;

  // Vérifier que le parent est GARDIEN de l'élève auquel appartient cette
  // facture. Un tuteur non gardien n'a pas accès aux factures.
  // On récupère d'abord la facture avec le filtre gardienOnly : si elle
  // n'existe pas, c'est que le parent n'est pas gardien (ou que la facture
  // n'appartient pas à ses enfants).
  const facture = await prisma.facture.findFirst({
    where: mergeFilters(
      { id, tenantId },
      eleveScopeFilter(session!.user, "eleve", { gardienOnly: true })
    ),
    select: {
      id: true,
      numero: true,
      libelle: true,
      montant: true,
      devise: true,
      statut: true,
      echeance: true,
      paiements: {
        orderBy: { date: "desc" },
        select: {
          id: true,
          montant: true,
          devise: true,
          methode: true,
          reference: true,
          date: true,
        },
      },
    },
  });

  // Si la facture n'est pas trouvée avec le filtre gardienOnly, vérifier si
  // elle existe avec le filtre normal (le parent est rattaché mais non
  // gardien) → rediriger vers la page d'accès bloqué. Sinon, 404.
  if (!facture) {
    const factureSansGardien = await prisma.facture.findFirst({
      where: mergeFilters(
        { id, tenantId },
        eleveScopeFilter(session!.user, "eleve")
      ),
      select: { id: true },
    });
    if (factureSansGardien) {
      // Le parent est rattaché à cet élève mais n'est pas gardien.
      redirect("/acces-bloque");
    }
    notFound();
  }

  const statutConfig: Record<string, { variant: "default" | "success" | "warning" | "destructive" | "secondary"; label: string }> = {
    EN_ATTENTE: { variant: "warning", label: "En attente" },
    PAYEE: { variant: "success", label: "Payée" },
    EN_RETARD: { variant: "destructive", label: "En retard" },
    ANNULEE: { variant: "secondary", label: "Annulée" },
  };

  const cfg = statutConfig[facture.statut] ?? statutConfig.EN_ATTENTE;
  const totalPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
  const restant = facture.montant - totalPaye;

  function formatMoney(amount: number, devise: string) {
    const currency = devise === "XOF" ? "DJF" : devise;
    return new Intl.NumberFormat("fr-DJ", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={`${t("facturesEnfant")} — ${facture.numero}`}
        subtitle={facture.libelle}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto max-w-2xl space-y-6">
          <Button asChild variant="ghost" size="sm">
            <Link href="/parent">
              <ArrowLeft className="h-4 w-4" />
              {tc("back")}
            </Link>
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>{facture.libelle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("numero")}</p>
                  <p className="font-medium">{facture.numero}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("statut")}</p>
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("montant")}</p>
                  <p className="font-medium">{formatMoney(facture.montant, facture.devise)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("echeance")}</p>
                  <p className="font-medium">
                    {facture.echeance
                      ? new Intl.DateTimeFormat("fr-FR").format(facture.echeance)
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total payé</span>
                  <span className="font-medium text-green-600">
                    {formatMoney(totalPaye, facture.devise)}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Reste à payer</span>
                  <span className="font-medium">
                    {formatMoney(restant, facture.devise)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {facture.paiements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Paiements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {facture.paiements.map((p) => (
                    <div key={p.id} className="flex justify-between border-b pb-2 text-sm last:border-0">
                      <div>
                        <p className="font-medium">{formatMoney(p.montant, p.devise)}</p>
                        <p className="text-muted-foreground">
                          {new Intl.DateTimeFormat("fr-FR").format(p.date)}
                          {p.reference && ` · ${p.reference}`}
                        </p>
                      </div>
                      <Badge variant="secondary" className="capitalize">{p.methode}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
