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
    <div className="p-6 bg-gray-50 dark:bg-gray-950 min-h-full">
      {matiereId && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <p className="text-sm text-blue-800 dark:text-blue-400 font-medium">
              {t("filterActive")}
            </p>
          </div>
          <Link href="/evaluations">
            <Button size="sm" variant="outline" className="text-blue-600 hover:text-blue-800 bg-white border-blue-200">
              {t("viewAllExams")}
            </Button>
          </Link>
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t("title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("subtitle")}</p>
        </div>
        <CreateEvaluationForm classes={classes} matieres={matieres} periodes={periodes} />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#0f4c75] dark:bg-gray-800 text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("colTitle")}</th>
                <th className="px-4 py-3 font-semibold">{t("colClass")}</th>
                <th className="px-4 py-3 font-semibold">{t("colLevel")}</th>
                <th className="px-4 py-3 font-semibold">{t("colSubject")}</th>
                <th className="px-4 py-3 font-semibold">{t("colDate")}</th>
                <th className="px-4 py-3 font-semibold">{t("colDuration")}</th>
                <th className="px-4 py-3 font-semibold">{t("colCoef")}</th>
                <th className="px-4 py-3 font-semibold">{t("colType")}</th>
                <th className="px-4 py-3 font-semibold">{t("colStatus")}</th>
                <th className="px-4 py-3 font-semibold">{t("colPeriod")}</th>
                <th className="px-4 py-3 font-semibold text-center">{t("colNotes")}</th>
                <th className="px-4 py-3 font-semibold text-center">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {evaluations.map((ev, idx) => (
                <tr key={ev.id} className={idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-800/50"}>
                  <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-100">{ev.titre}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ev.classe.nom}</td>
                  <td className="px-4 py-3">
                    <Badge className="bg-orange-500 hover:bg-orange-600">{ev.classe.niveau ?? tc("defaultLevel")}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 dark:text-gray-100">{ev.matiere.nom}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Coef: {ev.coefficient}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    <div className="font-medium">{format(ev.date, "dd/MM/yyyy")}</div>
                    <div className="text-xs">{format(ev.date, "HH:mm")}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ev.duree} min</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {ev.coefficient.toFixed(1)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={getTypeColor(ev.type)}>{ev.type}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 border-none">
                      {ev.statut === "PLANIFIE" ? t("statusPlanned") : t("statusCompleted")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ev.periode.nom}</td>
                  <td className="px-4 py-3 text-center">
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
                      <Button variant="outline" size="icon" className="h-8 w-8 text-yellow-600 border-yellow-200 hover:bg-yellow-50">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-green-600 border-green-200 hover:bg-green-50">
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
