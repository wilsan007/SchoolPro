import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DossierEnfant } from "@/components/learnos/DossierEnfant";
import { PreferencesParentForm } from "@/components/learnos/PreferencesParentForm";
import { JustifierAbsenceForm } from "@/components/learnos/JustifierAbsenceForm";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { dossierEleve, enfantsDuParent } from "@/lib/learnos/dossier-eleve";
import { PREFERENCES_PAR_DEFAUT } from "@/lib/learnos/alertes-parent";
import prisma from "@/lib/prisma";
import { mergeFilters, eleveScopeFilter } from "@/lib/site-scope";
import { cn } from "@/lib/utils";

/**
 * Espace du parent.
 *
 * ISOLATION — le point le plus sensible de cet écran
 * --------------------------------------------------
 * Le filtre de site ne s'applique PAS au rôle `PARENT` : c'est le périmètre
 * relationnel qui protège. L'enfant affiché est donc **obligatoirement** issu
 * de `enfantsDuParent`, jamais du paramètre d'URL pris tel quel — sans quoi
 * `?enfant=<id>` ouvrirait le dossier de n'importe quel élève du tenant.
 */
export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ enfant?: string }>;
}) {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("learnos.dossier"),
  ]);
  await guardPage(session);

  // Cet écran n'a de sens que pour un parent : le personnel dispose de la
  // fiche élève complète, qui en dit davantage.
  if (session!.user.role !== "PARENT") redirect("/dashboard");

  const tenantId = session!.user.tenantId!;
  const { enfant: demande } = await searchParams;

  const enfants = await enfantsDuParent(tenantId, session!.user);

  const entete = (
    <Header
      title={t("titreParent")}
      subtitle={t("sousTitreParent")}
      userName={session!.user.name}
      userAvatar={session!.user.image ?? undefined}
    />
  );

  if (enfants.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {entete}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium">{t("aucunEnfant")}</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {t("aucunEnfantAide")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Le paramètre d'URL ne sert qu'à CHOISIR parmi les enfants déjà autorisés.
  const choisi = enfants.find((e) => e.id === demande) ?? enfants[0];

  const [dossier, preferences, factures, absences, isGardien] = await Promise.all([
    dossierEleve(tenantId, choisi.id, session!.user, {
      pourResponsable: "parent",
      avecFinance: true,
    }),
    preferencesDuCompte(tenantId, session!.user.id),
    // Factures de l'enfant — réservées au parent GARDIEN. Un tuteur non
    // gardien n'a pas accès aux factures : le filtre `gardienOnly` restreint
    // les `EleveParent` à ceux où `isGardien` est `true`.
    prisma.facture.findMany({
      where: mergeFilters(
        { tenantId, eleveId: choisi.id },
        eleveScopeFilter(session!.user, "eleve", { gardienOnly: true })
      ),
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        numero: true,
        libelle: true,
        montant: true,
        devise: true,
        statut: true,
        echeance: true,
      },
    }),
    // Absences injustifiées de l'enfant, pour justification par le parent.
    // Accessibles à tous les parents rattachés (gardien ou non).
    prisma.absence.findMany({
      where: mergeFilters(
        { tenantId, eleveId: choisi.id, statut: "INJUSTIFIEE" },
        eleveScopeFilter(session!.user, "eleve")
      ),
      orderBy: { date: "desc" },
      take: 5,
      select: {
        id: true,
        date: true,
        heureDebut: true,
        heureFin: true,
        isRetard: true,
      },
    }),
    // Vérifier si le parent est gardien de cet enfant — détermine l'accès
    // aux factures et aux bulletins.
    // eslint-disable-next-line ecolpro/require-site-filter -- EleveParent n'a pas de siteId/tenantId propre ; le tenantId est filtré via la relation parent, et l'eleveId provient d'enfantsDuParent (déjà scopé).
    prisma.eleveParent.findFirst({
      where: {
        eleveId: choisi.id,
        parent: { userId: session!.user.id, tenantId },
        isGardien: true,
      },
      select: { isGardien: true },
    }).then((r) => !!r),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {entete}
      <div className="flex-1 space-y-6 overflow-y-auto p-6 scrollbar-thin">
        {/* Désambiguïsation explicite dès qu'il y a plusieurs enfants : un
            parent ne doit jamais se demander de qui on lui parle. */}
        {enfants.length > 1 && (
          <nav aria-label={t("choisirEnfant")} className="flex flex-wrap gap-2">
            {enfants.map((e) => (
              <Link
                key={e.id}
                href={`/parent?enfant=${e.id}`}
                aria-current={e.id === choisi.id ? "page" : undefined}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  e.id === choisi.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                )}
              >
                {e.prenom} {e.nom}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">
            {choisi.prenom} {choisi.nom}
          </h2>
          {choisi.classe && <Badge variant="outline">{choisi.classe.nom}</Badge>}
        </div>

        {dossier && <DossierEnfant dossier={dossier} perspective="parent" />}

        {/* --- Factures de l'enfant --- */}
        {/* Le rôle PARENT n'a pas `finance:read` : la route `/facturation` lui
            est interdite. On affiche ici un résumé et un lien vers la route
            dédiée `/parent/factures/[id]` qui vérifie le périmètre familial.
            Les factures ne sont visibles que par le parent GARDIEN
            (isGardien: true) ; un tuteur non gardien ne voit pas cette
            section. */}
        {isGardien && (
        <Card>
          <CardHeader>
            <CardTitle>{t("facturesEnfant")}</CardTitle>
          </CardHeader>
          <CardContent>
            {factures.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aucuneFacture")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">{t("numero")}</th>
                      <th className="pb-2 pr-4 font-medium">{t("libelle")}</th>
                      <th className="pb-2 pr-4 font-medium">{t("montant")}</th>
                      <th className="pb-2 pr-4 font-medium">{t("statut")}</th>
                      <th className="pb-2 pr-4 font-medium">{t("echeance")}</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map((f) => (
                      <tr key={f.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{f.numero}</td>
                        <td className="py-2 pr-4">{f.libelle}</td>
                        <td className="py-2 pr-4">
                          {new Intl.NumberFormat("fr-DJ", {
                            style: "currency",
                            currency: f.devise === "XOF" ? "DJF" : f.devise,
                            maximumFractionDigits: 0,
                          }).format(f.montant)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge
                            variant={
                              f.statut === "PAYEE"
                                ? "success"
                                : f.statut === "EN_RETARD"
                                  ? "destructive"
                                  : f.statut === "ANNULEE"
                                    ? "secondary"
                                    : "warning"
                            }
                          >
                            {f.statut === "PAYEE"
                              ? "Payée"
                              : f.statut === "EN_RETARD"
                                ? "En retard"
                                : f.statut === "ANNULEE"
                                  ? "Annulée"
                                  : "En attente"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          {f.echeance
                            ? new Intl.DateTimeFormat("fr-FR").format(f.echeance)
                            : "—"}
                        </td>
                        <td className="py-2">
                          <Link
                            href={`/parent/factures/${f.id}`}
                            className="text-primary hover:underline"
                          >
                            {t("voirDetails")}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* --- Absences à justifier --- */}
        <Card>
          <CardHeader>
            <CardTitle>{t("absencesAJustifier")}</CardTitle>
          </CardHeader>
          <CardContent>
            {absences.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aucuneAbsence")}</p>
            ) : (
              <div className="space-y-3">
                {absences.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="text-sm">
                      <p className="font-medium">
                        {new Intl.DateTimeFormat("fr-FR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }).format(a.date)}
                      </p>
                      {(a.heureDebut || a.heureFin) && (
                        <p className="text-muted-foreground">
                          {a.heureDebut ?? "—"} – {a.heureFin ?? "—"}
                          {a.isRetard && " · Retard"}
                        </p>
                      )}
                    </div>
                    <JustifierAbsenceForm
                      absenceId={a.id}
                      dateLabel={new Intl.DateTimeFormat("fr-FR").format(a.date)}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- Prise de rendez-vous --- */}
        {/* Pas de modèle de RDV complexe pour l'instant : un lien vers la
            messagerie existante, pré-rempli avec l'élève concerné. */}
        <Card>
          <CardHeader>
            <CardTitle>{t("prendreRdv")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="default">
              <Link href={`/messages?eleve=${choisi.id}`}>
                {t("prendreRdv")}
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Les réglages viennent après le dossier : on montre d'abord ce qui
            sert, le paramétrage est secondaire. */}
        <PreferencesParentForm initiales={preferences} />
      </div>
    </div>
  );
}

/**
 * Préférences de la famille, avec repli sur les valeurs par défaut.
 *
 * Résolues depuis le compte connecté, jamais depuis un paramètre : accepter
 * un identifiant permettrait de lire — ou de couper — les notifications
 * d'une autre famille.
 */
async function preferencesDuCompte(tenantId: string, userId: string) {
  // Pas de filtre de site : les préférences suivent la famille, et le rôle
  // PARENT n'est de toute façon pas borné par site (voir site-scope.ts).
  // eslint-disable-next-line ecolpro/require-site-filter
  const parent = await prisma.parent.findFirst({
    where: { tenantId, userId },
    select: {
      learnosPreferences: {
        select: {
          alertesActives: true,
          niveauMinimal: true,
          langue: true,
          plafondHebdomadaire: true,
        },
      },
    },
  });
  return parent?.learnosPreferences ?? PREFERENCES_PAR_DEFAUT;
}
