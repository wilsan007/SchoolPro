"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertTriangle, TrendingUp, TrendingDown, Clock,
  CalendarX2, Filter, Users, Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTranslations, useFormatter } from "next-intl";
import Link from "next/link";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

interface ClasseOption {
  id: string;
  nom: string;
  niveau: string;
  annee: string;
}

interface EleveVeille {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classeId: string;
  classeNom: string;
  niveau: string;
  absencesCourantes: number;
  absencesInjustifiees: number;
  retards: number;
  absencesPrecedentes: number;
  injustifieesPrecedentes: number;
  tauxCourant: number;
  tauxPrecedent: number;
  acceleration: boolean;
  tauxCritique: boolean;
  enVeille: boolean;
  jourPire: string | null;
  jourPireCount: number;
}

interface Synthese {
  total: number;
  enVeille: number;
  enAcceleration: number;
  enTauxCritique: number;
  tauxMoyen: number;
  absencesMoyennes: number;
  joursDeClasse: number;
}

interface Props {
  classes: ClasseOption[];
  /** Hiérarchie catégorie → niveau → classe (scope enseignant appliqué). */
  hierarchie?: ClassesHierarchie;
}

export function VeilleAssiduiteView({ classes, hierarchie }: Props) {
  const t = useTranslations("veilleAssiduite");
  const format = useFormatter();
  const [classeId, setClasseId] = useState<string>("all");
  const [data, setData] = useState<{ eleves: EleveVeille[]; synthese: Synthese } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyVeille, setShowOnlyVeille] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = classeId === "all"
        ? "/api/veille-assiduite"
        : `/api/veille-assiduite?classeId=${classeId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur serveur");
      const d = await res.json();
      setData(d);
    } catch {
      setError(t("errLoad"));
    } finally {
      setLoading(false);
    }
  }, [classeId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const elevesAffiches = data?.eleves.filter((e) => !showOnlyVeille || e.enVeille) ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <Select value={classeId} onValueChange={setClasseId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("selectClass")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allClasses")}</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nom} ({c.niveau})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={showOnlyVeille ? "default" : "outline"}
          size="sm"
          onClick={() => setShowOnlyVeille(!showOnlyVeille)}
          className="gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          {t("onlyWatch")}
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      )}

      {error && (
        <div className="text-center py-12 text-red-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
          <p>{error}</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Synthèse */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label={t("synthTotal")}
              value={data.synthese.total}
              color="text-blue-600"
              bg="bg-blue-50 dark:bg-blue-950/30"
            />
            <StatCard
              icon={<AlertTriangle className="w-4 h-4" />}
              label={t("synthVeille")}
              value={data.synthese.enVeille}
              color="text-red-600"
              bg="bg-red-50 dark:bg-red-950/30"
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label={t("synthAcceleration")}
              value={data.synthese.enAcceleration}
              color="text-orange-600"
              bg="bg-orange-50 dark:bg-orange-950/30"
            />
            <StatCard
              icon={<Activity className="w-4 h-4" />}
              label={t("synthCritique")}
              value={data.synthese.enTauxCritique}
              color="text-fuchsia-600"
              bg="bg-fuchsia-50 dark:bg-fuchsia-950/30"
            />
            <StatCard
              icon={<CalendarX2 className="w-4 h-4" />}
              label={t("synthTauxMoyen")}
              value={`${data.synthese.tauxMoyen}%`}
              color="text-amber-600"
              bg="bg-amber-50 dark:bg-amber-950/30"
            />
            <StatCard
              icon={<Clock className="w-4 h-4" />}
              label={t("synthAbsMoyennes")}
              value={data.synthese.absencesMoyennes}
              color="text-gray-600"
              bg="bg-gray-50 dark:bg-gray-950/30"
            />
          </div>

          {/* Liste des élèves */}
          {elevesAffiches.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-400">
                {showOnlyVeille ? t("noWatchStudents") : t("noStudents")}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                        <th className="text-left py-3 px-3 font-medium text-gray-500">{t("colStudent")}</th>
                        <th className="text-left py-3 px-3 font-medium text-gray-500">{t("colClass")}</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-500">{t("colAbsences")}</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-500">{t("colInjustifiees")}</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-500">{t("colRetards")}</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-500">{t("colTauxCourant")}</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-500">{t("colTendance")}</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-500">{t("colPattern")}</th>
                        <th className="text-center py-3 px-3 font-medium text-gray-500">{t("colStatus")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {elevesAffiches.map((e) => (
                        <tr key={e.id} className={e.enVeille ? "bg-red-50/30 dark:bg-red-950/10" : ""}>
                          <td className="py-3 px-3">
                            <Link href={`/eleves/${e.id}`} className="hover:underline">
                              <p className="font-medium text-gray-900 dark:text-white">{e.prenom} {e.nom}</p>
                              <p className="text-xs text-gray-400">{e.matricule}</p>
                            </Link>
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-gray-300">{e.classeNom}</td>
                          <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-300">{e.absencesCourantes}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={e.absencesInjustifiees > 0 ? "text-red-600 font-medium" : "text-gray-400"}>
                              {e.absencesInjustifiees}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-300">{e.retards}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`font-medium ${e.tauxCourant >= 20 ? "text-red-600" : e.tauxCourant >= 10 ? "text-amber-600" : "text-gray-600 dark:text-gray-300"}`}>
                              {e.tauxCourant}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {e.acceleration ? (
                              <span className="inline-flex items-center gap-1 text-orange-600" title={t("accelerating")}>
                                <TrendingUp className="w-4 h-4" />
                              </span>
                            ) : e.tauxCourant < e.tauxPrecedent ? (
                              <span className="inline-flex items-center gap-1 text-green-600" title={t("improving")}>
                                <TrendingDown className="w-4 h-4" />
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center text-xs text-gray-500">
                            {e.jourPire ? `${e.jourPire} (${e.jourPireCount})` : "—"}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {e.enVeille ? (
              <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900">
                                {t("watch")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-gray-400">
                                {t("ok")}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-3 text-center`}>
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}
