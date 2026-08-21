"use client";

import { useState } from "react";
import {
  Users,
  Target,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface Objectif {
  id: string;
  titre: string;
  description: string | null;
  statut: string;
  priorite: number;
  progression: number;
  dateCible: string | null;
}

interface Seance {
  id: string;
  date: string;
  duree: number | null;
  statut: string;
  compteRendu: string | null;
  lieu: string | null;
}

interface Mentorat {
  id: string;
  type: string;
  statut: string;
  frequence: string;
  notes: string | null;
  dateDebut: string;
  dateFin: string | null;
  mentor: { id: string; name: string | null; email: string | null };
  mentore: { id: string; name: string | null; email: string | null };
  objectifs: Objectif[];
  seances: Seance[];
  _count: { objectifs: number; seances: number };
}

interface Props {
  mentorats: Mentorat[];
  canWrite: boolean;
}

const STATUT_COLORS: Record<string, string> = {
  ACTIF: "bg-green-50 text-green-700 border-green-200",
  SUSPENDU: "bg-amber-50 text-amber-700 border-amber-200",
  TERMINE: "bg-gray-50 text-gray-500 border-gray-200",
  ANNULE: "bg-red-50 text-red-700 border-red-200",
};

const STATUT_OBJECTIF_COLORS: Record<string, string> = {
  EN_COURS: "bg-blue-50 text-blue-700 border-blue-200",
  ATTEINT: "bg-green-50 text-green-700 border-green-200",
  NON_ATTEINT: "bg-red-50 text-red-700 border-red-200",
  ABANDONNE: "bg-gray-50 text-gray-500 border-gray-200",
};

const STATUT_SEANCE_COLORS: Record<string, string> = {
  PLANIFIEE: "bg-blue-50 text-blue-700 border-blue-200",
  EFFECTUEE: "bg-green-50 text-green-700 border-green-200",
  ANNULEE: "bg-red-50 text-red-700 border-red-200",
  "REPORTÉE": "bg-amber-50 text-amber-700 border-amber-200",
};

export function MentoratView({ mentorats }: Props) {
  const [expanded, setExpanded] = useState<string | null>(
    mentorats[0]?.id ?? null
  );

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {mentorats.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Aucune relation de mentorat enregistrée.</p>
        </div>
      )}

      {mentorats.map((m) => {
        const isOpen = expanded === m.id;
        const objectifsAtteints = m.objectifs.filter((o) => o.statut === "ATTEINT").length;
        const seancesEffectuees = m.seances.filter((s) => s.statut === "EFFECTUEE").length;

        return (
          <div
            key={m.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
          >
            <button
              onClick={() => toggle(m.id)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">
                  {m.mentor.name ?? "Mentor"} → {m.mentore.name ?? "Mentoré"}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {m.type}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${STATUT_COLORS[m.statut] ?? STATUT_COLORS.ACTIF}`}
                  >
                    {m.statut}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {m.frequence} · {m._count.objectifs} objectifs ·{" "}
                    {m._count.seances} séances
                  </span>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-5">
                {m.notes && (
                  <p className="text-sm text-gray-600">{m.notes}</p>
                )}

                {/* Objectifs */}
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    <Target className="w-3.5 h-3.5" />
                    Objectifs ({objectifsAtteints}/{m.objectifs.length} atteints)
                  </h4>
                  <div className="space-y-2">
                    {m.objectifs.length === 0 && (
                      <p className="text-sm text-gray-400 italic">
                        Aucun objectif défini.
                      </p>
                    )}
                    {m.objectifs.map((o) => (
                      <div
                        key={o.id}
                        className="p-3 rounded-lg border border-gray-100 bg-gray-50/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-800">
                            {o.titre}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 h-4 ${
                              STATUT_OBJECTIF_COLORS[o.statut] ??
                              STATUT_OBJECTIF_COLORS.EN_COURS
                            }`}
                          >
                            {o.statut}
                          </Badge>
                        </div>
                        {o.description && (
                          <p className="text-xs text-gray-500 mt-1">
                            {o.description}
                          </p>
                        )}
                        {/* Barre de progression */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full transition-all"
                              style={{ width: `${o.progression}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums">
                            {o.progression}%
                          </span>
                        </div>
                        {o.dateCible && (
                          <p className="text-xs text-gray-400 mt-1">
                            Cible : {formatDate(o.dateCible)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Séances */}
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    <Calendar className="w-3.5 h-3.5" />
                    Séances ({seancesEffectuees}/{m.seances.length} effectuées)
                  </h4>
                  <div className="space-y-2">
                    {m.seances.length === 0 && (
                      <p className="text-sm text-gray-400 italic">
                        Aucune séance enregistrée.
                      </p>
                    )}
                    {m.seances.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50"
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                          {s.statut === "EFFECTUEE" ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : s.statut === "ANNULEE" ? (
                            <XCircle className="w-4 h-4 text-red-600" />
                          ) : (
                            <Clock className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">
                              {formatDate(s.date)}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1 py-0 h-4 ${
                                STATUT_SEANCE_COLORS[s.statut] ??
                                "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              {s.statut}
                            </Badge>
                            {s.duree && (
                              <span className="text-xs text-gray-400">
                                {s.duree} min
                              </span>
                            )}
                          </div>
                          {s.compteRendu && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {s.compteRendu}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
