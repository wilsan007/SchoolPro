"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, Send, CheckCircle,
  Loader2, Eye, Users, ChevronRight, X,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConseilDeClasse } from "./ConseilDeClasse";
import type { BulletinData } from "@/lib/pdf/bulletin-generator";
import { BulletinPreview } from "./BulletinPreview";

interface Classe {
  id: string;
  nom: string;
  niveau: string;
  eleves: { id: string; nom: string; prenom: string; matricule: string }[];
  profPrincipal: { user: { name: string } } | null;
}

interface Periode {
  id: string;
  nom: string;
  numero: number;
  isCurrent: boolean;
}

interface EleveConseil {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  moyenneGenerale: number | null;
  rang: number | null;
  decision: "PASSAGE" | "REDOUBLEMENT" | "FELICITATIONS" | "ENCOURAGEMENTS" | "AVERTISSEMENT" | null;
  appreciation: string;
}

type View = "workflow" | "conseil" | "preview";

export function BulletinsManager({
  classes, periodes,
}: {
  classes: Classe[];
  periodes: Periode[];
  tenantId: string;
}) {
  const [selectedClasse, setSelectedClasse] = useState<Classe | null>(classes[0] ?? null);
  const [selectedPeriode, setSelectedPeriode] = useState<Periode | null>(
    periodes.find((p) => p.isCurrent) ?? periodes[0] ?? null
  );
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<View>("workflow");
  const [conseilEleves, setConseilEleves] = useState<EleveConseil[]>([]);
  const [previewData, setPreviewData] = useState<BulletinData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const key = `${selectedClasse?.id}-${selectedPeriode?.id}`;
  const isGenerated = generated.has(key);
  const isPublished = published.has(key);

  async function genererBulletins() {
    if (!selectedClasse || !selectedPeriode) return;
    setGenerating(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/bulletins/generer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classeId: selectedClasse.id, periodeId: selectedPeriode.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setGenerated((prev) => new Set([...prev, key]));
        toast.success(`${data.count} bulletins générés avec succès !`);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
      } finally {
        setGenerating(false);
      }
    });
  }

  async function publierBulletins() {
    if (!selectedClasse || !selectedPeriode) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/bulletins/publier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classeId: selectedClasse.id, periodeId: selectedPeriode.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setPublished((prev) => new Set([...prev, key]));
        toast.success(`${data.count} bulletins publiés — parents notifiés !`);
      } catch {
        toast.error("Erreur lors de la publication");
      }
    });
  }

  async function ouvrirConseil() {
    if (!selectedClasse || !selectedPeriode) return;
    try {
      const res = await fetch(
        `/api/bulletins/conseil-data?classeId=${selectedClasse.id}&periodeId=${selectedPeriode.id}`
      );
      if (res.ok) {
        const data = await res.json();
        setConseilEleves(data.eleves ?? []);
      } else {
        // Fallback: utiliser les élèves de la classe avec des valeurs vides
        setConseilEleves(
          selectedClasse.eleves.map((e) => ({
            ...e,
            moyenneGenerale: null,
            rang: null,
            decision: null,
            appreciation: "",
          }))
        );
      }
    } catch {
      setConseilEleves(
        selectedClasse.eleves.map((e) => ({
          ...e,
          moyenneGenerale: null,
          rang: null,
          decision: null,
          appreciation: "",
        }))
      );
    }
    setView("conseil");
  }

  async function previsualiser() {
    if (!selectedClasse || !selectedPeriode) return;
    setLoadingPreview(true);
    try {
      const firstEleve = selectedClasse.eleves[0];
      if (!firstEleve) {
        toast.error("Aucun élève dans cette classe");
        return;
      }
      const res = await fetch(
        `/api/bulletins/preview?eleveId=${firstEleve.id}&periodeId=${selectedPeriode.id}`
      );
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
        setView("preview");
      } else {
        toast.error("Impossible de charger la prévisualisation");
      }
    } catch {
      toast.error("Erreur lors du chargement");
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Colonne gauche : sélecteurs */}
      <div className="space-y-4">
        {/* Période */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Période
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0 space-y-1">
            {periodes.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedPeriode(p); setView("workflow"); }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  selectedPeriode?.id === p.id
                    ? "bg-primary text-white"
                    : "hover:bg-muted"
                )}
              >
                <span>{p.nom}</span>
                {p.isCurrent && (
                  <Badge
                    variant={selectedPeriode?.id === p.id ? "outline" : "success"}
                    className="text-[10px] px-1.5"
                  >
                    En cours
                  </Badge>
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Classes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Classe
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0 space-y-1">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelectedClasse(c); setView("workflow"); }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  selectedClasse?.id === c.id
                    ? "bg-primary text-white"
                    : "hover:bg-muted"
                )}
              >
                <div className="text-left">
                  <p>{c.nom}</p>
                  <p className={cn(
                    "text-xs",
                    selectedClasse?.id === c.id ? "text-white/70" : "text-muted-foreground"
                  )}>
                    {c.eleves.length} élève{c.eleves.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Colonne droite : contenu principal */}
      <div className="lg:col-span-2 space-y-4">

        {/* Onglets */}
        {(view === "conseil" || view === "preview") && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("workflow")}
              className="gap-2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
              Retour
            </Button>
            <span className="text-sm text-muted-foreground">
              {view === "conseil" ? "Conseil de classe" : "Prévisualisation bulletin"}
            </span>
          </div>
        )}

        {/* VUE : Workflow */}
        {view === "workflow" && selectedClasse && selectedPeriode && (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {selectedClasse.nom} — {selectedPeriode.nom}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedClasse.eleves.length} bulletins à générer
                      {selectedClasse.profPrincipal && (
                        <> · Prof. principal : <strong>{selectedClasse.profPrincipal.user.name}</strong></>
                      )}
                    </p>
                  </div>
                  <Badge variant={isPublished ? "success" : isGenerated ? "info" : "outline"}>
                    {isPublished ? "Publiés" : isGenerated ? "Générés" : "En attente"}
                  </Badge>
                </div>

                {/* Étapes workflow */}
                <div className="space-y-4 mb-6">
                  {[
                    {
                      step: 1,
                      label: "Calcul des moyennes",
                      desc: "Pondération par coefficient, classement, statistiques de classe",
                      done: true,
                    },
                    {
                      step: 2,
                      label: "Génération des appréciations",
                      desc: "Suggestions automatiques par niveau de moyenne",
                      done: isGenerated,
                    },
                    {
                      step: 3,
                      label: "Conseil de classe",
                      desc: "Délibérations, félicitations, avertissements, décisions de passage",
                      done: isGenerated,
                    },
                    {
                      step: 4,
                      label: "Distribution aux parents",
                      desc: "Email + notification ENT + téléchargement PDF",
                      done: isPublished,
                    },
                  ].map((s) => (
                    <div key={s.step} className="flex items-center gap-4">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors",
                          s.done
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {s.done ? <CheckCircle className="h-5 w-5" /> : s.step}
                      </div>
                      <div>
                        <p className={cn("text-sm font-medium", s.done ? "text-green-700 dark:text-green-400" : "")}>
                          {s.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Boutons d'action */}
                <div className="flex flex-wrap gap-3">
                  {!isGenerated ? (
                    <Button onClick={genererBulletins} disabled={generating || isPending} className="gap-2">
                      {generating ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Génération en cours…</>
                      ) : (
                        <><FileText className="h-4 w-4" />Générer les bulletins</>
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={previsualiser}
                        disabled={loadingPreview}
                      >
                        {loadingPreview ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        Prévisualiser
                      </Button>
                      <Button variant="outline" className="gap-2" disabled>
                        <Download className="h-4 w-4" />
                        Télécharger ZIP
                      </Button>
                      {!isPublished && (
                        <Button onClick={publierBulletins} disabled={isPending} className="gap-2">
                          {isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />Publication…</>
                          ) : (
                            <><Send className="h-4 w-4" />Publier aux parents</>
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Conseil de classe card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Conseil de classe
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Délibérez, attribuez félicitations / encouragements / avertissements, et saisissez les décisions de passage ou de redoublement pour chaque élève.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={ouvrirConseil}
                  disabled={!isGenerated}
                >
                  <Users className="h-4 w-4" />
                  {isGenerated ? "Ouvrir le conseil de classe" : "Générez les bulletins d'abord"}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {/* VUE : Conseil de classe */}
        {view === "conseil" && selectedClasse && selectedPeriode && (
          <Card>
            <CardContent className="p-6">
              <ConseilDeClasse
                classeId={selectedClasse.id}
                periodeId={selectedPeriode.id}
                classeNom={selectedClasse.nom}
                periodeNom={selectedPeriode.nom}
                eleves={conseilEleves}
              />
            </CardContent>
          </Card>
        )}

        {/* VUE : Prévisualisation bulletin */}
        {view === "preview" && previewData && (
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
              <CardTitle className="text-sm">Prévisualisation — {previewData.eleveNom} {previewData.elevePrenom}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setView("workflow")}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[80vh]">
              <BulletinPreview data={previewData} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
