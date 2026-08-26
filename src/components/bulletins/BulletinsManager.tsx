"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, Send, CheckCircle,
  Loader2, Eye, Users, ChevronRight, X,
  BookOpen, TableProperties, Brain, Lock, Unlock,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ConseilDeClasse } from "./ConseilDeClasse";
import type { BulletinData } from "@/lib/pdf/bulletin-generator";
import { BulletinPreview } from "./BulletinPreview";
import { BulletinMatrix } from "./BulletinMatrix";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

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

type View = "workflow" | "conseil" | "preview" | "matrix";

export function BulletinsManager({
  classes, hierarchie: _hierarchie, periodes, userRole,
}: {
  classes: Classe[];
  hierarchie?: ClassesHierarchie;
  periodes: Periode[];
  tenantId: string;
  userRole?: string;
}) {
  const t = useTranslations("bulletinsManager");
  const [selectedClasse, setSelectedClasse] = useState<Classe | null>(classes[0] ?? null);
  const [selectedPeriode, setSelectedPeriode] = useState<Periode | null>(
    periodes.find((p) => p.isCurrent) ?? periodes[0] ?? null
  );
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState<Set<string>>(new Set());
  const [verrouille, setVerrouille] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<View>("workflow");
  const [conseilEleves, setConseilEleves] = useState<EleveConseil[]>([]);
  const [previewData, setPreviewData] = useState<BulletinData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const key = `${selectedClasse?.id}-${selectedPeriode?.id}`;
  const isGenerated = generated.has(key);
  const isPublished = published.has(key);
  const isVerrouille = verrouille.has(key);
  const isAdmin = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL";
  // `bulletins:write` = générer, verrouiller ; `bulletins:publish` = publier.
  // TEACHER n'a que `bulletins:read` — il consulte mais n'agit pas.
  // CLASS_TEACHER a `bulletins:publish` mais pas `bulletins:delete`.
  const canWrite = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL" || userRole === "CLASS_TEACHER";
  const canPublish = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL" || userRole === "CLASS_TEACHER";

  // Vérifier si des bulletins existent déjà en DB pour cette classe/période
  const checkExistingBulletins = useCallback(async (classeId: string, periodeId: string) => {
    setCheckingExisting(true);
    try {
      const res = await fetch(`/api/bulletins/check-existing?classeId=${classeId}&periodeId=${periodeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setGenerated((prev) => new Set([...prev, `${classeId}-${periodeId}`]));
          if (data.published) {
            setPublished((prev) => new Set([...prev, `${classeId}-${periodeId}`]));
          }
          if (data.verrouille) {
            setVerrouille((prev) => new Set([...prev, `${classeId}-${periodeId}`]));
          }
          return true;
        }
      }
    } catch {
      // silent fail
    } finally {
      setCheckingExisting(false);
    }
    return false;
  }, []);

  // Quand on change de classe/période, vérifier si bulletins déjà générés.
  // Les identifiants sont extraits en variables : une expression composée
  // dans le tableau de dépendances ne peut pas être vérifiée statiquement.
  const classeIdSelectionnee = selectedClasse?.id;
  const periodeIdSelectionnee = selectedPeriode?.id;
  useEffect(() => {
    if (classeIdSelectionnee && periodeIdSelectionnee) {
      checkExistingBulletins(classeIdSelectionnee, periodeIdSelectionnee);
    }
  }, [classeIdSelectionnee, periodeIdSelectionnee, checkExistingBulletins]);

  // Replier la sidebar automatiquement en vue matricielle
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sidebar-collapse", { detail: { collapse: view === "matrix" } }));
  }, [view]);

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
        if (!res.ok) throw new Error(data.error ?? t("error"));
        setGenerated((prev) => new Set([...prev, key]));
        toast.success(t("successGenerated", { count: data.count }));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("errGeneration"));
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
        setVerrouille((prev) => new Set([...prev, key]));
        toast.success(t("successPublished", { count: data.count }));
      } catch {
        toast.error(t("errPublication"));
      }
    });
  }

  async function verrouillerBulletins() {
    if (!selectedClasse || !selectedPeriode) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/bulletins/verrouiller", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classeId: selectedClasse.id,
            periodeId: selectedPeriode.id,
            action: isVerrouille ? "deverrouiller" : "verrouiller",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (isVerrouille) {
          setVerrouille((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          toast.success(t("successUnlocked", { count: data.count }));
        } else {
          setVerrouille((prev) => new Set([...prev, key]));
          toast.success(t("successLocked", { count: data.count }));
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("errVerrouillage"));
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
        toast.error(t("errNoStudents"));
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
        toast.error(t("errPreviewLoad"));
      }
    } catch {
      toast.error(t("errLoad"));
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className={view === "matrix" ? "space-y-3" : "grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6"}>
      {/* Barre de filtres horizontale — visible seulement en vue matricielle */}
      {view === "matrix" && (
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 px-1 sticky top-0 z-30 bg-background py-2 border-b">
          {/* Retour */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("workflow")}
            className="gap-1.5 text-muted-foreground"
          >
            <X className="h-4 w-4" />
            {t("back")}
          </Button>

          <div className="h-5 w-px bg-border mx-1" />

          {/* Sélecteur classe */}
          <select
            value={selectedClasse?.id ?? ""}
            onChange={(e) => {
              const c = classes.find((c) => c.id === e.target.value);
              if (c) setSelectedClasse(c);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom} ({c.eleves.length})</option>
            ))}
          </select>

          {/* Sélecteur période */}
          <select
            value={selectedPeriode?.id ?? ""}
            onChange={(e) => {
              const p = periodes.find((p) => p.id === e.target.value);
              if (p) setSelectedPeriode(p);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            {periodes.map((p) => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
          </select>

          <div className="h-5 w-px bg-border mx-1" />

          {/* Boutons d'action rapides */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={previsualiser}
            disabled={loadingPreview || !isGenerated}
          >
            {loadingPreview ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
            {t("preview")}
          </Button>
          {!isPublished && isGenerated && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={publierBulletins}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              {t("publish")}
            </Button>
          )}
          {isPublished && (
            <Badge variant="success" className="text-xs">{t("published")}</Badge>
          )}
          {isVerrouille && !isPublished && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Lock className="h-3 w-3" />
              {t("locked")}
            </Badge>
          )}
        </div>
      )}

      {/* Colonne gauche : sélecteurs — cachée en vue matricielle */}
      {view !== "matrix" && (
      <div className="space-y-4 sm:space-y-4">
        {/* Période */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              {t("period")}
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
                    {t("inProgress")}
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
              {t("class")}
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
                    {t("studentsCount", { count: c.eleves.length })}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Colonne droite : contenu principal */}
      <div className={view === "matrix" ? "space-y-3" : "lg:col-span-2 space-y-4"}>

        {/* Onglets — cachés en vue matricielle (barre de filtres déjà présente) */}
        {(view === "conseil" || view === "preview") && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("workflow")}
              className="gap-2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
              {t("back")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {view === "conseil" ? t("viewConseil") : t("viewPreview")}
            </span>
          </div>
        )}

        {/* VUE : Workflow */}
        {view === "workflow" && selectedClasse && selectedPeriode && (
          <>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between mb-4 sm:mb-6 gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {selectedClasse.nom} — {selectedPeriode.nom}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("bulletinsToGenerate", { count: selectedClasse.eleves.length })}
                      {selectedClasse.profPrincipal && (
                        <> · {t("mainTeacher")} : <strong>{selectedClasse.profPrincipal.user.name}</strong></>
                      )}
                    </p>
                  </div>
                  <Badge variant={isPublished ? "success" : isVerrouille ? "secondary" : isGenerated ? "info" : "outline"}>
                    {isPublished ? t("published") : isVerrouille ? t("locked") : isGenerated ? t("generated") : t("pending")}
                  </Badge>
                </div>

                {/* Étapes workflow */}
                <div className="space-y-4 mb-4 sm:mb-6">
                  {[
                    {
                      step: 1,
                      label: t("step1Label"),
                      desc: t("step1Desc"),
                      done: true,
                    },
                    {
                      step: 2,
                      label: t("step2Label"),
                      desc: t("step2Desc"),
                      done: isGenerated,
                    },
                    {
                      step: 3,
                      label: t("step3Label"),
                      desc: t("step3Desc"),
                      done: isGenerated,
                    },
                    {
                      step: 4,
                      label: t("step4Label"),
                      desc: t("step4Desc"),
                      done: isPublished,
                    },
                  ].map((s) => (
                    <div key={s.step} className="flex items-center gap-3 sm:gap-4">
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
                <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                  {!isGenerated ? (
                    canWrite && (
                      <Button onClick={genererBulletins} disabled={generating || isPending || (isVerrouille && !isAdmin)} className="gap-2">
                        {generating ? (
                          <><Loader2 className="h-4 w-4 animate-spin" />{t("generating")}</>
                        ) : (
                          <><FileText className="h-4 w-4" />{t("generate")}</>
                        )}
                      </Button>
                    )
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setView("matrix")}
                      >
                        <TableProperties className="h-4 w-4" />
                        {t("viewMatrix")}
                      </Button>
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
                        {t("previewPdf")}
                      </Button>
                      <Button variant="outline" className="gap-2" disabled>
                        <Download className="h-4 w-4" />
                        {t("downloadZip")}
                      </Button>
                      {canPublish && !isPublished && (
                        <Button onClick={publierBulletins} disabled={isPending} className="gap-2">
                          {isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />{t("publishing")}</>
                          ) : (
                            <><Send className="h-4 w-4" />{t("publishToParents")}</>
                          )}
                        </Button>
                      )}
                      {/* Verrouiller / Déverrouiller */}
                      {canWrite && isGenerated && !isPublished && (
                        <Button
                          variant={isVerrouille ? "outline" : "secondary"}
                          onClick={verrouillerBulletins}
                          disabled={isPending || (isVerrouille && !isAdmin)}
                          className="gap-2"
                          title={isVerrouille && !isAdmin ? t("lockedAdminOnly") : undefined}
                        >
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isVerrouille ? (
                            <Unlock className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                          {isVerrouille ? t("unlock") : t("lock")}
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
                  {t("viewConseil")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("conseilDesc")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={ouvrirConseil}
                  disabled={!isGenerated}
                >
                  <Users className="h-4 w-4" />
                  {isGenerated ? t("openConseil") : t("generateFirst")}
                </Button>
                <Button asChild variant="ghost" size="sm" className="w-full gap-2 mt-2">
                  <Link href="/conseil-augmente">
                    <Brain className="h-4 w-4" />
                    {t("conseilAugmente")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {/* VUE : Conseil de classe */}
        {view === "conseil" && selectedClasse && selectedPeriode && (
          <Card>
            <CardContent className="p-4 sm:p-6">
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

        {/* VUE : Matrice (classe entière) */}
        {view === "matrix" && selectedClasse && selectedPeriode && (
          <BulletinMatrix
            classeId={selectedClasse.id}
            periodeId={selectedPeriode.id}
            classeNom={selectedClasse.nom}
          />
        )}

        {/* VUE : Prévisualisation bulletin */}
        {view === "preview" && previewData && (
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
              <CardTitle className="text-sm">{t("previewOf", { nom: previewData.eleveNom, prenom: previewData.elevePrenom })}</CardTitle>
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
