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

/**
 * Travail à faire — vue élève / parent.
 *
 * Résout l'élève connecté (ou l'enfant choisi par un parent) via
 * `eleveScopeFilter`, puis charge les devoirs de sa classe dont la date de
 * rendu est à venir (`dateRendu >= now()`), triés par échéance croissante.
 */
export default async function TravailPage({
  searchParams,
}: {
  searchParams: Promise<{ enfant?: string }>;
}) {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("travail"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const claims = session.user as SessionSiteClaims & {
    id?: string;
    userId?: string;
  };
  const { enfant: demande } = await searchParams;

  // Année scolaire courante — filtre les élèves par leur classe de l'année.
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Résoudre les élèves selon le rôle (PARENT : ses enfants, STUDENT : lui-même).
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      deletedAt: null,
      statut: "ACTIF",
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
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
          <p className="text-sm text-muted-foreground">{t("aucunTravail")}</p>
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
          <p className="text-sm text-muted-foreground">{t("aucunTravail")}</p>
        </div>
      </div>
    );
  }

  const now = await getDemoNow();
  const devoirs = await prisma.devoir.findMany({
    where: {
      tenantId,
      classeId: choisi.classeId,
      dateRendu: { gte: now },
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      ...siteFilterForModel("devoir", claims),
    },
    include: {
      matiere: { select: { nom: true, code: true, couleur: true } },
      classe: { select: { nom: true } },
    },
    orderBy: { dateRendu: "asc" },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {entete}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        {eleves.length > 1 && (
          <nav className="flex flex-wrap gap-2">
            {eleves.map((e) => (
              <Link
                key={e.id}
                href={`/travail?enfant=${e.id}`}
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

        {devoirs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("aucunTravail")}</p>
        ) : (
          <ul className="space-y-3">
            {devoirs.map((d) => {
              const couleur = d.matiere?.couleur ?? "#6366f1";
              return (
                <li
                  key={d.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="font-semibold leading-tight">{d.titre}</h3>
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
                      {d.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {d.description}
                        </p>
                      )}
                    </div>
                    {d.statut === "RENDU" && (
                      <Badge variant="secondary">{t("rendu")}</Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
