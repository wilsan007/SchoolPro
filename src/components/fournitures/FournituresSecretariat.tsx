"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Send, Loader2, BookOpen, PencilRuler, Calculator, Package, CheckCircle2 } from "lucide-react";
import {
  validerDemandeFourniture,
  rejeterDemandeFourniture,
  publierListePourNiveau,
} from "@/lib/actions/fournitures";
import type { TypeFourniture, StatutDemandeFourniture } from "@prisma/client";
import { useTranslations } from "next-intl";

interface DemandeItem {
  id: string;
  niveau: string;
  matiereId: string | null;
  matiere: { nom: string } | null;
  enseignant: { user: { name: string | null } };
  type: TypeFourniture;
  nom: string;
  description: string | null;
  quantite: number;
  format: string | null;
  prixEstime: number | null;
  statut: StatutDemandeFourniture;
  commentaireValidation: string | null;
  createdAt: Date;
}

interface ClassesParNiveau {
  [niveau: string]: { id: string; nom: string }[];
}

const TYPE_ICONS: Record<TypeFourniture, typeof BookOpen> = {
  LIVRE: BookOpen,
  CAHIER: PencilRuler,
  INSTRUMENT: Calculator,
  AUTRE: Package,
};

const TYPE_LABEL_KEYS: Record<TypeFourniture, string> = {
  LIVRE: "typeLivre",
  CAHIER: "typeCahier",
  INSTRUMENT: "typeInstrument",
  AUTRE: "typeAutre",
};

const STATUT_LABEL_KEYS: Record<StatutDemandeFourniture, string> = {
  PROPOSEE: "statutProposee",
  VALIDEE: "statutValidee",
  REJETEE: "statutRejetee",
};

const STATUT_COLORS: Record<StatutDemandeFourniture, string> = {
  PROPOSEE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  VALIDEE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  REJETEE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function FournituresSecretariat({
  demandes: initialDemandes,
  classesParNiveau,
}: {
  demandes: DemandeItem[];
  classesParNiveau: ClassesParNiveau;
}) {
  const [isPending, startTransition] = useTransition();
  const [demandes, setDemandes] = useState<DemandeItem[]>(initialDemandes);
  const [niveauActif, setNiveauActif] = useState<string | null>(null);
  const t = useTranslations("fournitures");

  // Grouper par niveau
  const parNiveau: Record<string, DemandeItem[]> = {};
  for (const d of demandes) {
    if (!parNiveau[d.niveau]) parNiveau[d.niveau] = [];
    parNiveau[d.niveau].push(d);
  }

  const niveaux = Object.keys(parNiveau).sort();

  async function handleValider(id: string) {
    startTransition(async () => {
      try {
        await validerDemandeFourniture(id);
        setDemandes((prev) => prev.map((d) => d.id === id ? { ...d, statut: "VALIDEE" } : d));
        toast.success(t("demandeValidee"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  async function handleRejeter(id: string) {
    startTransition(async () => {
      try {
        await rejeterDemandeFourniture(id);
        setDemandes((prev) => prev.map((d) => d.id === id ? { ...d, statut: "REJETEE" } : d));
        toast.success(t("demandeRejetee"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  async function handlePublier(niveau: string) {
    startTransition(async () => {
      try {
        const result = await publierListePourNiveau(niveau);
        toast.success(t("listePubliee", { nbClasses: result.nbClasses, nbItems: result.nbItems }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  // Statistiques par niveau
  function statsNiveau(niveau: string) {
    const items = parNiveau[niveau] || [];
    const proposees = items.filter((d) => d.statut === "PROPOSEE").length;
    const validees = items.filter((d) => d.statut === "VALIDEE").length;
    const rejetees = items.filter((d) => d.statut === "REJETEE").length;
    return { total: items.length, proposees, validees, rejetees };
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("titre")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("sousTitreSecretariat")}
        </p>
      </div>

      {niveaux.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("aucuneDemandeAttente")}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Onglets par niveau */}
          <div className="flex flex-wrap gap-2">
            {niveaux.map((niveau) => {
              const stats = statsNiveau(niveau);
              const isActive = niveauActif === niveau;
              return (
                <button
                  key={niveau}
                  onClick={() => setNiveauActif(isActive ? null : niveau)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    isActive ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted/50"
                  }`}
                >
                  {niveau}
                  <span className="ml-2 text-xs opacity-70">
                    {stats.validees}/{stats.total} {t("statutValidee").toLowerCase()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Détail d'un niveau */}
          {niveauActif && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {t("niveau")} {niveauActif}
                    {classesParNiveau[niveauActif] && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        ({classesParNiveau[niveauActif].length} {t("niveau").toLowerCase()})
                      </span>
                    )}
                  </CardTitle>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={isPending || statsNiveau(niveauActif).validees === 0}
                    onClick={() => handlePublier(niveauActif)}
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t("publier", { niveau: niveauActif })}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(parNiveau[niveauActif] || []).map((d) => {
                    const Icon = TYPE_ICONS[d.type];
                    return (
                      <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{d.nom}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[d.statut]}`}>
                              {t(STATUT_LABEL_KEYS[d.statut] as any)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t(TYPE_LABEL_KEYS[d.type] as any)} · {t("quantite")} {d.quantite}
                            {d.format && ` · ${d.format}`}
                            {d.matiere && ` · ${d.matiere.nom}`}
                            {d.prixEstime != null && ` · ~${d.prixEstime} FCFA`}
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {t("demandePar", { name: d.enseignant.user.name ?? "—" })}
                          </p>
                        </div>
                        {d.statut === "PROPOSEE" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => handleValider(d.id)} disabled={isPending} className="text-emerald-600 hover:text-emerald-700">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleRejeter(d.id)} disabled={isPending} className="text-red-500 hover:text-red-700">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {d.statut === "VALIDEE" && (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vue globale — toutes les demandes */}
          {!niveauActif && (
            <div className="space-y-3">
              {niveaux.map((niveau) => {
                const stats = statsNiveau(niveau);
                return (
                  <Card key={niveau}>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Niveau {niveau}</span>
                        <div className="flex gap-2">
                          {stats.proposees > 0 && <Badge variant="secondary" className="bg-amber-100 text-amber-700">{t("enAttente", { count: stats.proposees })}</Badge>}
                          {stats.validees > 0 && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">{t("validees", { count: stats.validees })}</Badge>}
                          {stats.rejetees > 0 && <Badge variant="secondary" className="bg-red-100 text-red-700">{t("rejetees", { count: stats.rejetees })}</Badge>}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        {(parNiveau[niveau] || []).slice(0, 5).map((d) => {
                          const Icon = TYPE_ICONS[d.type];
                          return (
                            <div key={d.id} className="flex items-center gap-2 text-sm">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{d.nom}</span>
                              <span className="text-xs text-muted-foreground">· {d.enseignant.user.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ml-auto ${STATUT_COLORS[d.statut]}`}>
                                {t(STATUT_LABEL_KEYS[d.statut] as any)}
                              </span>
                            </div>
                          );
                        })}
                        {(parNiveau[niveau] || []).length > 5 && (
                          <button onClick={() => setNiveauActif(niveau)} className="text-xs text-primary hover:underline">
                            {t("voirDemandes", { count: (parNiveau[niveau] || []).length })} →
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
