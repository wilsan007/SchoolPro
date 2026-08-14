import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { EmploiDuTempsView } from "@/components/emploi-du-temps/EmploiDuTempsView";
import { Badge } from "@/components/ui/badge";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { eleveScopeFilter, siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { cn } from "@/lib/utils";

/**
 * Emploi du temps en lecture pour les familles.
 *
 * L'éditeur `/emploi-du-temps` est fermé aux familles (il exige un rôle du
 * personnel). Cette route est la vue consultation dédiée : elle récupère la
 * classe de l'enfant (parent) ou de l'élève connecté (student) et affiche la
 * grille horaire en lecture seule.
 *
 * ISOLATION — le périmètre relationnel protège l'accès, pas le filtre de site.
 * L'élève est résolu via `eleveScopeFilter` (lien familial ou identité
 * personnelle), jamais depuis un paramètre d'URL.
 */
export default async function MonEmploiPage({
  searchParams,
}: {
  searchParams: Promise<{ enfant?: string }>;
}) {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("emploi"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const role = session.user.role;
  const claims = session.user as SessionSiteClaims & { id?: string; userId?: string };
  const { enfant: demande } = await searchParams;

  // Résoudre les élèves selon le rôle.
  // PARENT : ses enfants. STUDENT : lui-même.
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
      title={t("title")}
      subtitle={t("subtitleConsultation")}
      userName={session.user.name}
      userAvatar={session.user.image ?? undefined}
    />
  );

  if (eleves.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {entete}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <p className="text-sm text-muted-foreground">{t("aucunEleve")}</p>
        </div>
      </div>
    );
  }

  // Le paramètre URL ne sert qu'à CHOISIR parmi les élèves déjà autorisés.
  const choisi = eleves.find((e) => e.id === demande) ?? eleves[0];

  if (!choisi.classeId) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {entete}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <p className="text-sm text-muted-foreground">{t("aucuneClasse")}</p>
        </div>
      </div>
    );
  }

  // Charger les créneaux de la classe de l'élève, les matières et salles
  // associées. Pas besoin des enseignants complets ni des disponibilités :
  // c'est une vue lecture.
  const [emplois, matieres, salles] = await Promise.all([
    prisma.emploiTemps.findMany({
      where: { tenantId, classeId: choisi.classeId, ...siteFilterForModel("emploiTemps", claims) },
      include: {
        matiere: { select: { nom: true, code: true, couleur: true } },
        classe: { select: { nom: true } },
        enseignant: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    }),
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", claims) },
      select: { id: true, nom: true, code: true, couleur: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
    prisma.salle.findMany({
      where: { tenantId, ...siteFilterForModel("salle", claims) },
      select: { id: true, nom: true, capacite: true, type: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  const classePourVue = choisi.classe
    ? [{ id: choisi.classe.id, nom: choisi.classe.nom, niveau: choisi.classe.niveau ?? "" }]
    : [];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {entete}
      <div className="flex-1 space-y-4 overflow-y-auto p-6 scrollbar-thin">
        {eleves.length > 1 && (
          <nav aria-label={t("choisirEnfant")} className="flex flex-wrap gap-2">
            {eleves.map((e) => (
              <Link
                key={e.id}
                href={`/mon-emploi?enfant=${e.id}`}
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

        <EmploiDuTempsView
          classes={classePourVue}
          matieres={matieres}
          enseignants={[]}
          emplois={emplois as unknown as React.ComponentProps<typeof EmploiDuTempsView>["emplois"]}
          matiereToEnseignants={{}}
          salles={salles}
          disponibilites={[]}
          tenantId={tenantId}
          readOnly={true}
        />
      </div>
    </div>
  );
}
