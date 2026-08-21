"use client";

import { useState, useTransition } from "react";
import {
  Landmark,
  Users,
  Calendar,
  Gavel,
  Plus,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";

interface Membre {
  id: string;
  role: string;
  nomExterne: string | null;
  debutMandat: string | null;
  finMandat: string | null;
  user: { id: string; name: string | null; email: string | null } | null;
}

interface Reunion {
  id: string;
  titre: string;
  date: string;
  lieu: string | null;
  ordreDuJour: string | null;
  statut: string;
  compteRendu: string | null;
}

interface Resolution {
  id: string;
  titre: string;
  description: string | null;
  statut: string;
  dateVote: string | null;
  resultats: { pour: number; contre: number; abstentions: number } | null;
  dateEffet: string | null;
}

interface Conseil {
  id: string;
  nom: string;
  type: string;
  description: string | null;
  frequence: string;
  membres: Membre[];
  reunions: Reunion[];
  resolutions: Resolution[];
  _count: { reunions: number; resolutions: number };
}

interface Props {
  conseils: Conseil[];
  canWrite: boolean;
}

const STATUT_REUNION_COLORS: Record<string, string> = {
  PLANIFIEE: "bg-blue-50 text-blue-700 border-blue-200",
  EN_COURS: "bg-amber-50 text-amber-700 border-amber-200",
  TERMINEE: "bg-green-50 text-green-700 border-green-200",
  ANNULEE: "bg-red-50 text-red-700 border-red-200",
};

const STATUT_RESOLUTION_COLORS: Record<string, string> = {
  ADOPTÉE: "bg-green-50 text-green-700 border-green-200",
  REJETÉE: "bg-red-50 text-red-700 border-red-200",
  EN_ATTENTE: "bg-amber-50 text-amber-700 border-amber-200",
  RETIRÉE: "bg-gray-50 text-gray-500 border-gray-200",
};

const ROLE_COLORS: Record<string, string> = {
  PRESIDENT: "bg-violet-50 text-violet-700 border-violet-200",
  SECRETAIRE: "bg-sky-50 text-sky-700 border-sky-200",
  MEMBRE: "bg-gray-50 text-gray-700 border-gray-200",
  OBSERVATEUR: "bg-stone-50 text-stone-600 border-stone-200",
};

export function GouvernanceView({ conseils: initial, canWrite }: Props) {
  const t = useTranslations("nav");
  const [conseils] = useState(initial);
  const [expanded, setExpanded] = useState<string | null>(
    initial[0]?.id ?? null
  );
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  function statutIcon(statut: string) {
    switch (statut) {
      case "ADOPTÉE":
        return <CheckCircle2 className="w-3.5 h-3.5" />;
      case "REJETÉE":
        return <XCircle className="w-3.5 h-3.5" />;
      default:
        return <Clock className="w-3.5 h-3.5" />;
    }
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {conseils.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Landmark className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Aucun conseil de gouvernance configuré.</p>
        </div>
      )}

      {conseils.map((conseil) => {
        const isOpen = expanded === conseil.id;
        return (
          <div
            key={conseil.id}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
          >
            {/* En-tête du conseil */}
            <button
              onClick={() => toggle(conseil.id)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                <Landmark className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">
                  {conseil.nom}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {conseil.type}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {conseil.frequence}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {conseil.membres.length} membres · {conseil._count.reunions}{" "}
                    réunions · {conseil._count.resolutions} résolutions
                  </span>
                </div>
              </div>
            </button>

            {/* Détail du conseil */}
            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-5">
                {conseil.description && (
                  <p className="text-sm text-gray-600">{conseil.description}</p>
                )}

                {/* Membres */}
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    <Users className="w-3.5 h-3.5" />
                    Membres
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {conseil.membres.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-semibold text-violet-700">
                          {(m.user?.name ?? m.nomExterne ?? "?")
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-800">
                            {m.user?.name ?? m.nomExterne ?? "Membre externe"}
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 h-4 ${
                              ROLE_COLORS[m.role] ?? ROLE_COLORS.MEMBRE
                            }`}
                          >
                            {m.role}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Réunions */}
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    <Calendar className="w-3.5 h-3.5" />
                    Réunions
                  </h4>
                  <div className="space-y-2">
                    {conseil.reunions.length === 0 && (
                      <p className="text-sm text-gray-400 italic">
                        Aucune réunion enregistrée.
                      </p>
                    )}
                    {conseil.reunions.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50"
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Calendar className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">
                              {r.titre}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1 py-0 h-4 ${
                                STATUT_REUNION_COLORS[r.statut] ??
                                "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              {r.statut}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span>{formatDate(r.date)}</span>
                            {r.lieu && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />
                                {r.lieu}
                              </span>
                            )}
                          </div>
                          {r.compteRendu && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {r.compteRendu}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Résolutions */}
                <div>
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    <Gavel className="w-3.5 h-3.5" />
                    Résolutions
                  </h4>
                  <div className="space-y-2">
                    {conseil.resolutions.length === 0 && (
                      <p className="text-sm text-gray-400 italic">
                        Aucune résolution enregistrée.
                      </p>
                    )}
                    {conseil.resolutions.map((res) => (
                      <div
                        key={res.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50"
                      >
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                          {statutIcon(res.statut)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">
                              {res.titre}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1 py-0 h-4 ${
                                STATUT_RESOLUTION_COLORS[res.statut] ??
                                "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              {res.statut}
                            </Badge>
                          </div>
                          {res.description && (
                            <p className="text-xs text-gray-500 mt-1">
                              {res.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            {res.dateVote && (
                              <span>Votée le {formatDate(res.dateVote)}</span>
                            )}
                            {res.resultats && (
                              <span className="flex items-center gap-1.5">
                                <span className="text-green-600">
                                  {res.resultats.pour} pour
                                </span>
                                <span className="text-red-600">
                                  {res.resultats.contre} contre
                                </span>
                                <span className="text-gray-500">
                                  {res.resultats.abstentions} abst.
                                </span>
                              </span>
                            )}
                            {res.dateEffet && (
                              <span>Effet au {formatDate(res.dateEffet)}</span>
                            )}
                          </div>
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
