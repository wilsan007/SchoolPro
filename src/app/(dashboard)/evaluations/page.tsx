import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CreateEvaluationForm } from "@/components/evaluations/CreateEvaluationForm";
import Link from "next/link";
import { Eye, Edit, Star, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel } from "@/lib/site-scope";

export const metadata = {
  title: "Liste des examens | EcolPro",
};

export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ matiereId?: string }>;
}) {
  const [session, t, tc, sp] = await Promise.all([
    auth(),
    getTranslations("evaluations"),
    getTranslations("common"),
    searchParams,
  ]);
  if (!session?.user?.tenantId) redirect("/login");
  await guardPage(session);

  const tenantId = session.user.tenantId;
  const { matiereId } = sp;

  const evalFilter = siteFilterForModel("evaluation", session.user);
  const classeFilter = siteFilterForModel("classe", session.user);
  const matiereFilter = siteFilterForModel("matiere", session.user);

  const [evaluations, classes, matieres, periodes] = await Promise.all([
    prisma.evaluation.findMany({
      where: {
        tenantId,
        ...evalFilter,
        ...(matiereId ? { matiereId } : {}),
      },
      include: {
        classe: { select: { nom: true, niveau: true } },
        matiere: { select: { nom: true, coefficient: true } },
        periode: { select: { nom: true } },
        _count: { select: { notes: true } }
      },
      orderBy: { date: "desc" }
    }),
    prisma.classe.findMany({ where: { tenantId, ...classeFilter }, select: { id: true, nom: true } }),
    prisma.matiere.findMany({ where: { tenantId, ...matiereFilter }, select: { id: true, nom: true } }),
    prisma.periode.findMany({ where: { annee: { tenantId } }, select: { id: true, nom: true } }),
  ]);

  function getTypeColor(type: string) {
    switch (type) {
      case "CONTROLE": return "bg-cyan-500 hover:bg-cyan-600";
      case "DEVOIR": return "bg-orange-500 hover:bg-orange-600";
      case "EXAMEN": return "bg-red-500 hover:bg-red-600";
      default: return "bg-blue-500 hover:bg-blue-600";
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-gray-50 dark:bg-gray-950 min-h-full">
      {matiereId && (
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
        <CreateEvaluationForm classes={classes} matieres={matieres} periodes={periodes} />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[640px]">
            <thead className="bg-[#0f4c75] dark:bg-gray-800 text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("colTitle")}</th>
                <th className="px-4 py-3 font-semibold">{t("colClass")}</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">{t("colLevel")}</th>
                <th className="px-4 py-3 font-semibold">{t("colSubject")}</th>
                <th className="px-4 py-3 font-semibold">{t("colDate")}</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">{t("colDuration")}</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">{t("colCoef")}</th>
                <th className="px-4 py-3 font-semibold">{t("colType")}</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">{t("colStatus")}</th>
                <th className="px-4 py-3 font-semibold hidden lg:table-cell">{t("colPeriod")}</th>
                <th className="px-4 py-3 font-semibold text-center hidden sm:table-cell">{t("colNotes")}</th>
                <th className="px-4 py-3 font-semibold text-center">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {evaluations.map((ev, idx) => (
                <tr key={ev.id} className={idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-800/50"}>
                  <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-100 truncate max-w-[160px]">{ev.titre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ev.classe.nom}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge className="bg-orange-500 hover:bg-orange-600">{ev.classe.niveau ?? tc("defaultLevel")}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[140px]">{ev.matiere.nom}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Coef: {ev.coefficient}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    <div className="font-medium">{format(ev.date, "dd/MM/yyyy")}</div>
                    <div className="text-xs">{format(ev.date, "HH:mm")}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">{ev.duree} min</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {ev.coefficient.toFixed(1)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={getTypeColor(ev.type)}>{ev.type}</Badge>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 border-none">
                      {ev.statut === "PLANIFIE" ? t("statusPlanned") : t("statusCompleted")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">{ev.periode.nom}</td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <Badge className={ev._count.notes > 0 ? "bg-green-500" : "bg-orange-500"}>
                      {ev._count.notes}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <Link href={`/evaluations/${ev.id}`}>
                        <Button className="bg-[#10b981] hover:bg-[#059669] text-white gap-1.5 h-8 px-3 text-xs font-semibold shadow-sm border-none">
                          <PenLine className="h-3.5 w-3.5" />
                          {t("enterGrades")}
                        </Button>
                      </Link>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-yellow-600 border-yellow-200 hover:bg-yellow-50 hidden sm:inline-flex">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-green-600 border-green-200 hover:bg-green-50 hidden sm:inline-flex">
                        <Star className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {evaluations.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {t("noExams")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
