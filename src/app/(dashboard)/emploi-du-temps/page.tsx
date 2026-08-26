import React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { EmploiDuTempsView } from "@/components/emploi-du-temps/EmploiDuTempsView";
import { fuzzyFind } from "@/lib/text-match";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getSitesForUser } from "@/lib/actions/eleve";
import { getSiteColorMap } from "@/lib/site-colors";
import { guardPage } from "@/lib/guard-page";
import { isTeacherRole } from "@/lib/teacher-classes";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getPeriodesForCloture } from "@/lib/actions/parametres";
import { getClassesHierarchie, aplatirHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";
import type { Role } from "@prisma/client";

// Les fragments d'isolation sont construits ici, au plus près des requêtes :
// passés en paramètres, ils n'étaient plus rattachables à leur origine, ni par
// un relecteur ni par l'analyse statique.
async function getEmploiData(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeCourante: string | null,
  classes: { id: string; nom: string; niveau: string }[],
) {
  const [matieres, enseignants, emplois, salles, disponibilites, indisponibilites] = await Promise.all([
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", claims) },
      select: { id: true, nom: true, code: true, couleur: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
    prisma.enseignant.findMany({
      where: { tenantId, ...siteFilterForModel("enseignant", claims) },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.emploiTemps.findMany({
      where: { tenantId, ...siteFilterForModel("emploiTemps", claims), ...(anneeCourante ? { annee: anneeCourante } : {}) },
      include: {
        matiere: { select: { nom: true, code: true, couleur: true } },
        classe: { select: { nom: true } },
        enseignant: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    }),
    prisma.salle.findMany({
      where: { tenantId, ...siteFilterForModel("salle", claims) },
      select: { id: true, nom: true, capacite: true, type: true },
      orderBy: { nom: "asc" },
    }),
    prisma.disponibiliteEnseignant.findMany({
      where: { tenantId, ...siteFilterForModel("disponibiliteEnseignant", claims) },
      select: { id: true, enseignantId: true, jour: true, heureDebut: true, heureFin: true },
    }),
    prisma.indisponibiliteEnseignant.findMany({
      where: { tenantId, ...siteFilterForModel("indisponibiliteEnseignant", claims) },
      select: { id: true, enseignantId: true, jour: true, heureDebut: true, heureFin: true, source: true, sourceLibelle: true },
    }),
  ]);
  // flou que le moteur de génération — teacherPoolFor). Sans la spécialité,
  // une matière jamais planifiée n'offrirait aucun enseignant dans les
  // listes déroulantes. Volontairement PAS de repli sur "tous les
  // enseignants" : on ne propose jamais un prof d'une autre matière.
  const matiereToEnseignants: Record<string, { id: string; user: { name: string | null } }[]> = {};
  function addEnseignant(matiereId: string, ens: { id: string; user: { name: string | null } }) {
    if (!matiereToEnseignants[matiereId]) matiereToEnseignants[matiereId] = [];
    if (!matiereToEnseignants[matiereId].some((e) => e.id === ens.id)) {
      matiereToEnseignants[matiereId].push({ id: ens.id, user: ens.user });
    }
  }
  for (const emp of emplois) {
    if (emp.enseignantId && emp.matiereId && emp.enseignant) {
      addEnseignant(emp.matiereId, emp.enseignant);
    }
  }
  // fuzzyFind matcherait toute matière contre une spécialité vide
  // (n.includes("") est toujours vrai) — on exclut donc les profs sans spécialité.
  const enseignantsAvecSpecialite = enseignants
    .filter((e) => e.specialite && e.specialite.trim() !== "")
    .map((e) => ({ id: e.id, nom: e.specialite! }));
  for (const matiere of matieres) {
    const bySpecialite = fuzzyFind(enseignantsAvecSpecialite, matiere.nom);
    const ids = new Set(bySpecialite.map((e) => e.id));
    for (const ens of enseignants) {
      if (ids.has(ens.id)) addEnseignant(matiere.id, ens);
    }
  }

  return { matieres, enseignants, emplois, matiereToEnseignants, salles, disponibilites, indisponibilites };
}

export default async function EmploiDuTempsPage() {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const [t, tCommon, sites, siteColors, periodes] = await Promise.all([
    getTranslations("emploi"),
    getTranslations("common"),
    getSitesForUser(),
    getSiteColorMap(session.user.tenantId),
    getPeriodesForCloture(),
  ]);

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const hierarchie: ClassesHierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const classes = aplatirHierarchie(hierarchie);

  const { matieres, enseignants, emplois, matiereToEnseignants, salles, disponibilites, indisponibilites } = await getEmploiData(
    session.user.tenantId, session.user, anneeCourante, classes
  );

  // Un enseignant consulte son service, il n'édite pas la grille de
  // l'établissement : on restreint les données à ses créneaux et à ses
  // classes, et on passe la vue en lecture seule.
  const role = session.user.role as Role;
  const estEnseignant = isTeacherRole(role);
  let mesClasses = classes;
  let mesEmplois = emplois;
  if (estEnseignant) {
    // eslint-disable-next-line ecolpro/require-site-filter -- résolution de l'enseignant par userId+tenantId
    const ens = await prisma.enseignant.findFirst({
      where: { userId: session.user.id, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (ens) {
      mesEmplois = emplois.filter((e) => e.enseignantId === ens.id);
      const mesClasseIds = new Set(mesEmplois.map((e) => e.classeId).filter(Boolean) as string[]);
      mesClasses = classes.filter((c) => mesClasseIds.has(c.id));
    }
  }

  const currentSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
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
        subtitle={estEnseignant ? t("subtitleConsultation") : t("subtitle")}
        site={currentSiteName}
        siteColor={currentSiteColor}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <EmploiDuTempsView
          classes={mesClasses}
          hierarchie={hierarchie}
          matieres={matieres}
          enseignants={enseignants}
          emplois={mesEmplois as unknown as React.ComponentProps<typeof EmploiDuTempsView>["emplois"]}
          matiereToEnseignants={matiereToEnseignants}
          salles={salles}
          disponibilites={disponibilites}
          indisponibilites={indisponibilites}
          periodes={periodes.map((p) => ({ id: p.id, nom: p.nom, numero: p.numero }))}
          tenantId={session.user.tenantId}
          readOnly={estEnseignant}
        />
      </div>
    </div>
  );
}
