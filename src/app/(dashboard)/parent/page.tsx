import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DossierEnfant } from "@/components/learnos/DossierEnfant";
import { PreferencesParentForm } from "@/components/learnos/PreferencesParentForm";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { dossierEleve, enfantsDuParent } from "@/lib/learnos/dossier-eleve";
import { PREFERENCES_PAR_DEFAUT } from "@/lib/learnos/alertes-parent";
import prisma from "@/lib/prisma";
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

  const [dossier, preferences] = await Promise.all([
    dossierEleve(tenantId, choisi.id, session!.user, {
      pourResponsable: "parent",
      avecFinance: true,
    }),
    preferencesDuCompte(tenantId, session!.user.id),
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
