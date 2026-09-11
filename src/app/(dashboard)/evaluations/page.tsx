import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreateEvaluationForm } from "@/components/evaluations/CreateEvaluationForm";
import { EvaluationsListView } from "@/components/evaluations/EvaluationsListView";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getClassesHierarchie, aplatirHierarchie } from "@/lib/classes-hierarchie";
import { roleHasPermission } from "@/lib/permissions";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

export const metadata = {
  title: "Liste des examens | EcolPro",
};

export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ matiereId?: string; filter?: string }>;
}) {
  const [session, t, sp] = await Promise.all([
    auth(),
    getTranslations("evaluations"),
    searchParams,
  ]);
  if (!session?.user?.tenantId) redirect("/login");
  await guardPage(session);

  const tenantId = session.user.tenantId;
  const { matiereId, filter } = sp;
  const claims = session.user as SessionSiteClaims;
  const filtreSansNotes = filter === "sans-notes";

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const maintenant = await getDemoNow();

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const hierarchie = await getClassesHierarchie(tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  const classes = aplatirHierarchie(hierarchie).map(c => ({ id: c.id, nom: c.nom }));

  const [evaluations, matieres, periodes] = await Promise.all([
    prisma.evaluation.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("evaluation", claims),
        ...(matiereId ? { matiereId } : {}),
        ...(hierarchieClasseIds.length > 0
          ? { classeId: { in: hierarchieClasseIds } }
          : {}),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
        // Filtre "sans-notes" : évaluations passées sans aucune note saisie.
        ...(filtreSansNotes
          ? {
              statut: { not: "ANNULE" },
              date: { lt: maintenant },
              notes: { none: {} },
            }
          : {
              OR: [{ statut: "PLANIFIE" }, { date: { lte: maintenant } }],
            }),
      },
      include: {
        classe: { select: { nom: true, niveau: true } },
        matiere: { select: { nom: true, coefficient: true } },
        periode: { select: { nom: true } },
        _count: { select: { notes: true } }
      },
      orderBy: { date: "desc" }
    }),
    prisma.matiere.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("matiere", claims),
      },
      select: { id: true, nom: true },
    }),
    prisma.periode.findMany({ where: { annee: { tenantId } }, select: { id: true, nom: true } }),
  ]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-gray-50 dark:bg-gray-950 min-h-full">
      {filtreSansNotes && (
        <div className="mb-4 sm:mb-6 p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
            <p className="text-sm text-orange-800 dark:text-orange-400 font-medium">
              {evaluations.length} évaluation{evaluations.length > 1 ? "s" : ""} sans notes · cliquez sur « Saisir les notes » pour traiter chaque retard
            </p>
          </div>
          <Link href="/evaluations" className="w-full sm:w-auto">
            <Button size="sm" variant="outline" className="text-orange-600 hover:text-orange-800 bg-white border-orange-200 w-full sm:w-auto">
              Voir tous les examens
            </Button>
          </Link>
        </div>
      )}
      {matiereId && !filtreSansNotes && (
        <div className="mb-4 sm:mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <p className="text-sm text-blue-800 dark:text-blue-400 font-medium">
              {t("filterActive")}
            </p>
          </div>
          <Link href="/evaluations" className="w-full sm:w-auto">
            <Button size="sm" variant="outline" className="text-blue-600 hover:text-blue-800 bg-white border-blue-200 w-full sm:w-auto">
              {t("viewAllExams")}
            </Button>
          </Link>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100">{t("title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
        </div>
        <CreateEvaluationForm classes={classes} hierarchie={hierarchie} matieres={matieres} periodes={periodes} canWrite={roleHasPermission(session.user.role as string, "evaluations:write")} />
      </div>

      <EvaluationsListView
        evaluations={evaluations.map((ev) => ({
          id: ev.id,
          titre: ev.titre,
          classeNom: ev.classe.nom,
          classeNiveau: ev.classe.niveau,
          matiereNom: ev.matiere.nom,
          coefficient: ev.coefficient,
          date: ev.date.toISOString(),
          duree: ev.duree,
          type: ev.type,
          statut: ev.statut,
          periodeNom: ev.periode.nom,
          nbNotes: ev._count.notes,
        }))}
        hierarchie={hierarchie}
      />
    </div>
  );
}
