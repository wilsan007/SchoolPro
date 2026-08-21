"use client";

import { useState, useCallback, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BadgeCheck,
  Route,
  AlertTriangle,
  Target,
  Sparkles,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AttestationsAValider, type Attestation } from "./AttestationsAValider";
import { PlansAValider, type PlanAValider } from "./PlansAValider";
import { RecommandationsView } from "./RecommandationsView";

interface RecommandationItem {
  id: string;
  niveau: string;
  statut: string;
  motif: string;
  actionProposee: string;
  regleDeclenchee: string;
  motifParams: unknown;
  competencesBloquees: number;
  createdAt: string | Date;
  eleve: { id: string; nom: string; prenom: string; classe: { nom: string } | null };
  competence: {
    code: string;
    libelle: string;
    chapitre: { matiere: { nom: string } | null } | null;
  };
}

/**
 * Wrapper client — organise les trois files (attestations, parcours,
 * recommandations) en onglets avec un en-tête de synthèse.
 *
 * Avant, les trois sections étaient empilées verticalement sans hiérarchie :
 * l'enseignant devait scroller sans savoir ce qui l'attendait, et les trois
 * types de travail — de natures très différentes — se ressemblaient visuellement.
 */
export function RecommandationsTabs({
  attestations,
  plans,
  recommandations,
}: {
  attestations: Attestation[];
  plans: PlanAValider[];
  recommandations: RecommandationItem[];
}) {
  const t = useTranslations("learnos.recommandations");
  const tAtt = useTranslations("learnos.attestations");
  const tPlans = useTranslations("learnos.plans");

  const [nbAttestations, setNbAttestations] = useState(attestations.length);
  const onAttestationsCountChange = useCallback((n: number) => setNbAttestations(n), []);

  // Compter les recommandations par niveau pour les cartes de synthèse.
  const recParNiveau = useMemo(() => {
    const counts = { OBLIGATOIRE: 0, RECOMMANDEE: 0, PROPOSEE: 0 };
    for (const r of recommandations) {
      if (r.statut in counts) {
        counts[r.statut as keyof typeof counts]++;
      }
    }
    return counts;
  }, [recommandations]);

  const totalRecommandations = recommandations.length;
  const totalPlans = plans.length;
  const totalGlobal = nbAttestations + totalPlans + totalRecommandations;

  // L'onglet par défaut est celui qui a le plus de travail urgent.
  // Attestations > Plans > Recommandations (par ordre de priorité).
  const defaultTab = nbAttestations > 0
    ? "attestations"
    : totalPlans > 0
      ? "plans"
      : "recommandations";

  const [activeTab, setActiveTab] = useState(defaultTab);

  // Cartes de synthèse — visibles sur tous les onglets.
  const cartes = [
    {
      key: "attestations",
      tab: "attestations",
      icone: BadgeCheck,
      couleur: "text-amber-600",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      label: tAtt("titre"),
      sub: tAtt("sousTitre"),
      count: nbAttestations,
    },
    {
      key: "plans",
      tab: "plans",
      icone: Route,
      couleur: "text-indigo-600",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
      label: tPlans("titre"),
      sub: tPlans("sousTitre"),
      count: totalPlans,
    },
    {
      key: "recommandations",
      tab: "recommandations",
      icone: AlertTriangle,
      couleur: "text-red-600",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      label: t("titre"),
      sub: t("sousTitre"),
      count: totalRecommandations,
    },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* En-tête de synthèse — KPI cards */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cartes.map((c) => {
            const Icone = c.icone;
            return (
              <button
                key={c.key}
                className="text-left"
                onClick={() => setActiveTab(c.tab)}
              >
                <Card
                  className={cn(
                    "border p-4 transition-all hover:shadow-md cursor-pointer",
                    c.border,
                    activeTab === c.tab && "ring-2 ring-offset-1",
                    activeTab === c.tab && c.border.replace("border-", "ring-")
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center", c.bg)}>
                      <Icone className={cn("w-5 h-5", c.couleur)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold tabular-nums">{c.count}</span>
                        {c.count > 0 && (
                          <span className={cn("text-xs font-medium", c.couleur)}>
                            <ArrowRight className="inline h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{c.label}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{c.sub}</p>
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>

        {totalGlobal === 0 && (
          <Card className="mt-4 border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
              <div>
                <p className="font-medium text-emerald-700 dark:text-emerald-400">
                  {t("rienATraiter")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("aucunePourInstant")}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Onglets */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 sm:px-6 lg:px-8 pb-2">
          <TabsList className="w-full justify-start h-auto p-1 flex-wrap">
            <TabsTrigger value="attestations" className="gap-1.5 py-2">
              <BadgeCheck className="h-4 w-4 text-amber-600" />
              {tAtt("titre")}
              {nbAttestations > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {nbAttestations}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-1.5 py-2">
              <Route className="h-4 w-4 text-indigo-600" />
              {tPlans("titre")}
              {totalPlans > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {totalPlans}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="recommandations" className="gap-1.5 py-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              {t("titre")}
              {totalRecommandations > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {totalRecommandations}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Contenu — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-6 scrollbar-thin">
          <TabsContent value="attestations" className="space-y-4 mt-0">
            <AttestationsAValider
              attestations={attestations}
              onCountChange={onAttestationsCountChange}
            />
          </TabsContent>

          <TabsContent value="plans" className="space-y-4 mt-0">
            <PlansAValider plans={plans} />
          </TabsContent>

          <TabsContent value="recommandations" className="space-y-4 mt-0">
            {/* Sous-résumé des trois files */}
            {totalRecommandations > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { n: recParNiveau.OBLIGATOIRE, icone: AlertTriangle, couleur: "text-red-600", bg: "bg-red-500/10", label: t("fileObligatoire") },
                  { n: recParNiveau.RECOMMANDEE, icone: Target, couleur: "text-amber-600", bg: "bg-amber-500/10", label: t("fileRecommandee") },
                  { n: recParNiveau.PROPOSEE, icone: Sparkles, couleur: "text-violet-600", bg: "bg-violet-500/10", label: t("fileProposee") },
                ].map((f) => {
                  if (f.n === 0) return null;
                  const Icone = f.icone;
                  return (
                    <div
                      key={f.label}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
                        f.bg
                      )}
                    >
                      <Icone className={cn("h-4 w-4", f.couleur)} />
                      <span className="font-medium">{f.n}</span>
                      <span className="text-muted-foreground">{f.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <RecommandationsView recommandations={recommandations} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
