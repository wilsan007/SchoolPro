import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import {
  eleveScopeFilter,
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { cn } from "@/lib/utils";
import type { Jour } from "@prisma/client";

/**
 * Ma journée — vue élève.
 *
 * Récapitulatif quotidien de l'élève connecté : cours du jour, travail à
 * rendre et prochaines évaluations. L'élève est résolu via `eleveScopeFilter`
 * (lien familial ou identité personnelle), jamais depuis un paramètre d'URL.
 */
export default async function MaJourneePage({
  searchParams,
}: {
  searchParams: Promise<{ enfant?: string }>;
}) {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("maJournee"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const claims = session.user as SessionSiteClaims & {
    id?: string;
    userId?: string;
  };
  const { enfant: demande } = await searchParams;

  // Résoudre les élèves selon le rôle (PARENT : ses enfants, STUDENT : lui-même).
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      deletedAt: null,
      statut: "ACTIF",
      ...eleveScopeFilter(claims, null),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      classeId: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  const entete = (
    <Header
      title={t("titre")}
      subtitle={t("sousTitre")}
      userName={session.user.name}
      userAvatar={session.user.image ?? undefined}
    />
  );

  if (eleves.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {entete}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
          <p className="text-sm text-muted-foreground">{t("aucunCours")}</p>
        </div>
      </div>
    );
  }

  // Le paramètre URL ne sert qu'à choisir parmi les élèves déjà autorisés.
  const choisi = eleves.find((e) => e.id === demande) ?? eleves[0];

  if (!choisi.classeId) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {entete}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
          <p className="text-sm text-muted-foreground">{t("aucunCours")}</p>
        </div>
      </div>
    );
  }

  // Jour d'aujourd'hui au format de l'enum Jour.
  const jours: Jour[] = [
    "DIMANCHE",
    "LUNDI",
    "MARDI",
    "MERCREDI",
    "JEUDI",
    "VENDREDI",
    "SAMEDI",
  ];
  const now = await getDemoNow();
  const todayJour = jours[now.getDay()];

  // Cours du jour, travail à rendre et prochaines évaluations.
  const [cours, devoirs, evaluations] = await Promise.all([
    prisma.emploiTemps.findMany({
      where: {
        tenantId,
        classeId: choisi.classeId,
        jour: todayJour,
        ...siteFilterForModel("emploiTemps", claims),
        ...(anneeCourante ? { annee: anneeCourante } : {}),
      },
      include: {
        matiere: { select: { nom: true, couleur: true } },
        enseignant: { select: { user: { select: { name: true } } } },
      },
      orderBy: { heureDebut: "asc" },
    }),
    prisma.devoir.findMany({
      where: {
        tenantId,
        classeId: choisi.classeId,
        dateRendu: { gte: now },
        ...siteFilterForModel("devoir", claims),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
      include: {
        matiere: { select: { nom: true, couleur: true } },
      },
      orderBy: { dateRendu: "asc" },
      take: 5,
    }),
    prisma.evaluation.findMany({
      where: {
        tenantId,
        classeId: choisi.classeId,
        ...siteFilterForModel("evaluation", claims),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
      include: {
        matiere: { select: { nom: true, couleur: true } },
      },
      orderBy: { date: "asc" },
      take: 3,
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {entete}
      <div className="flex-1 space-y-4 sm:space-y-6 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        {eleves.length > 1 && (
          <nav className="flex flex-wrap gap-2">
            {eleves.map((e) => (
              <Link
                key={e.id}
                href={`/ma-journee?enfant=${e.id}`}
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

        {/* Cours du jour */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold">{t("coursAujourdhui")}</h3>
          {cours.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucunCours")}</p>
          ) : (
            <ul className="space-y-2">
              {cours.map((c) => {
                const couleur = c.matiere?.couleur ?? "#6366f1";
                return (
                  <li
                    key={c.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: `${couleur}1a`,
                            color: couleur,
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: couleur }}
                          />
                          {c.matiere?.nom ?? "—"}
                        </span>
                        {c.enseignant?.user?.name && (
                          <span className="text-xs text-muted-foreground">
                            {t("enseignant")}: {c.enseignant.user.name}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium tabular-nums">
                        {c.heureDebut} – {c.heureFin}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Travail à rendre */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold">{t("travailARendre")}</h3>
          {devoirs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucunTravail")}</p>
          ) : (
            <ul className="space-y-2">
              {devoirs.map((d) => {
                const couleur = d.matiere?.couleur ?? "#6366f1";
                return (
                  <li
                    key={d.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="font-semibold leading-tight">{d.titre}</h4>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${couleur}1a`,
                              color: couleur,
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: couleur }}
                            />
                            {d.matiere?.nom ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t("aRendre")}{" "}
                            {d.dateRendu.toLocaleDateString(undefined, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Prochaines évaluations */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold">{t("prochaineEvaluation")}</h3>
          {evaluations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucuneEvaluation")}</p>
          ) : (
            <ul className="space-y-2">
              {evaluations.map((e) => {
                const couleur = e.matiere?.couleur ?? "#6366f1";
                return (
                  <li
                    key={e.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="font-semibold leading-tight">{e.titre}</h4>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${couleur}1a`,
                              color: couleur,
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: couleur }}
                            />
                            {e.matiere?.nom ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t("date")}{" "}
                            {e.date.toLocaleDateString(undefined, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
