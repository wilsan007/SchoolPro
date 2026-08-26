import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { roleHasPermission } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { getClassesHierarchie } from "@/lib/classes-hierarchie";
import { DevoirsManager } from "./DevoirsManager";

/**
 * Devoirs — saisie et suivi pour les enseignants et la direction.
 *
 * Les enseignants (TEACHER / CLASS_TEACHER) ne voient que les classes de leur
 * périmètre (`getTeacherScope` intégré dans `getClassesHierarchie`). La
 * direction (TENANT_ADMIN, SUPER_ADMIN, PRINCIPAL) voit toutes les classes
 * du tenant, groupées par catégorie → niveau → classe.
 */
export default async function DevoirsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("devoirs"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const claims = session.user as SessionSiteClaims;

  // Année scolaire courante — filtre obligatoire pour ne pas mélanger
  // les devoirs de plusieurs années (le modèle Devoir n'a pas de champ
  // annee direct, on filtre via la relation classe).
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  // Date simulée par la Time Machine : ne pas afficher les devoirs dont
  // la date de rendu est dans le futur (relativement à la date simulée).
  const maintenant = await getDemoNow();

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const hierarchie = await getClassesHierarchie(tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));

  const [matieres, devoirs] = await Promise.all([
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", claims) },
      select: { id: true, nom: true, couleur: true },
      orderBy: { nom: "asc" },
    }),
    prisma.devoir.findMany({
      where: {
        tenantId,
        // Restreindre aux classes de la hiérarchie (scope enseignant déjà appliqué)
        ...(hierarchieClasseIds.length > 0
          ? { classeId: { in: hierarchieClasseIds } }
          : {}),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
        ...siteFilterForModel("devoir", claims),
        dateRendu: { lte: maintenant },
      },
      include: {
        classe: { select: { nom: true } },
        matiere: { select: { nom: true, couleur: true } },
      },
      orderBy: { dateRendu: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <DevoirsManager
          hierarchie={hierarchie}
          matieres={matieres.map((m) => ({
            id: m.id,
            nom: m.nom,
            couleur: m.couleur,
          }))}
          devoirs={devoirs.map((d) => ({
            id: d.id,
            titre: d.titre,
            description: d.description,
            dateRendu: d.dateRendu.toISOString(),
            statut: d.statut,
            classe: { nom: d.classe.nom },
            matiere: { nom: d.matiere.nom, couleur: d.matiere.couleur },
          }))}
          canWrite={roleHasPermission(session.user.role as string, "notes:write")}
        />
      </div>
    </div>
  );
}
