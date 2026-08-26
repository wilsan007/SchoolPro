"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  BookOpen, Plus, Trash2, Loader2, ChevronDown, ChevronRight,
  Link2, AlertTriangle, Target, Info,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { PrerequisProposes } from "@/components/curriculum/PrerequisProposes";
import { ImportProgramme } from "@/components/curriculum/ImportProgramme";
import { cn } from "@/lib/utils";

interface Matiere {
  id: string;
  nom: string;
  code: string;
  couleur: string | null;
}

interface Competence {
  id: string;
  code: string;
  libelle: string;
  description: string | null;
  ordre: number;
  prerequis: { id: string; code: string; libelle: string }[];
  _count: { evidences: number; dependants: number };
}

interface Chapitre {
  id: string;
  matiereId: string;
  nom: string;
  niveau: string;
  ordre: number;
  competences: Competence[];
}

interface Props {
  matieres: Matiere[];
  chapitres: Chapitre[];
  peutModifier: boolean;
}

export function CurriculumView({ matieres, chapitres, peutModifier }: Props) {
  const t = useTranslations("learnos.curriculum");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  const [matiereActive, setMatiereActive] = useState<string>(matieres[0]?.id ?? "");
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  const [dialogChapitre, setDialogChapitre] = useState(false);
  const [dialogCompetence, setDialogCompetence] = useState<string | null>(null);

  const [formChapitre, setFormChapitre] = useState({ nom: "", niveau: "" });
  const [formCompetence, setFormCompetence] = useState({
    code: "", libelle: "", description: "", prerequisIds: [] as string[],
  });

  const chapitresFiltres = useMemo(
    () => chapitres.filter((c) => c.matiereId === matiereActive),
    [chapitres, matiereActive]
  );

  /** Toutes les compétences du tenant : candidates comme prérequis, y compris hors matière. */
  const toutesCompetences = useMemo(
    () => chapitres.flatMap((c) => c.competences.map((k) => ({ ...k, chapitre: c.nom }))),
    [chapitres]
  );

  const stats = useMemo(() => {
    const comps = chapitresFiltres.flatMap((c) => c.competences);
    return {
      chapitres: chapitresFiltres.length,
      competences: comps.length,
      avecPrerequis: comps.filter((c) => c.prerequis.length > 0).length,
      evaluees: comps.filter((c) => c._count.evidences > 0).length,
    };
  }, [chapitresFiltres]);

  function basculer(id: string) {
    setDeplies((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  async function appeler(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));
    return data;
  }

  function creerChapitre() {
    if (!formChapitre.nom.trim() || !formChapitre.niveau.trim()) {
      toast.error(t("nomNiveauRequis"));
      return;
    }
    demarrer(async () => {
      try {
        await appeler("/api/curriculum/chapitres", "POST", {
          matiereId: matiereActive,
          nom: formChapitre.nom.trim(),
          niveau: formChapitre.niveau.trim(),
          ordre: chapitresFiltres.length,
        });
        toast.success(t("chapitreCree"));
        setDialogChapitre(false);
        setFormChapitre({ nom: "", niveau: "" });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function creerCompetence(chapitreId: string) {
    if (!formCompetence.code.trim() || !formCompetence.libelle.trim()) {
      toast.error(t("codeLibelleRequis"));
      return;
    }
    demarrer(async () => {
      try {
        await appeler("/api/curriculum/competences", "POST", {
          chapitreId,
          code: formCompetence.code.trim().toUpperCase(),
          libelle: formCompetence.libelle.trim(),
          description: formCompetence.description.trim() || undefined,
          prerequisIds: formCompetence.prerequisIds,
        });
        toast.success(t("competenceCreee"));
        setDialogCompetence(null);
        setFormCompetence({ code: "", libelle: "", description: "", prerequisIds: [] });
        setDeplies((s) => new Set(s).add(chapitreId));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function supprimer(type: "chapitres" | "competences", id: string, nom: string) {
    if (!confirm(t("confirmerSuppression", { nom }))) return;
    demarrer(async () => {
      try {
        await appeler(`/api/curriculum/${type}/${id}`, "DELETE");
        toast.success(t("supprime"));
        router.refresh();
      } catch (e) {
        // Le serveur refuse quand des preuves d'apprentissage sont rattachées :
        // on affiche son explication, qui est plus utile qu'un message générique.
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  if (matieres.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">{t("aucuneMatiere")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("aucuneMatiereAide")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pourquoi cet écran existe — sans quoi son intérêt reste opaque. */}
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
        <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="text-sm text-blue-900 dark:text-blue-200">
          <p className="font-medium">{t("aQuoiSertTitre")}</p>
          <p className="mt-1 opacity-90">
            {t("aQuoiSertTexte")}
          </p>
        </div>
      </div>

      {/* Matières */}
      <div className="flex flex-wrap gap-2">
        {matieres.map((m) => (
          <button
            key={m.id}
            onClick={() => setMatiereActive(m.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              matiereActive === m.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            )}
          >
            {m.nom}
          </button>
        ))}
      </div>

      {/* Repères chiffrés */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { label: t("statChapitres"), valeur: stats.chapitres },
          { label: t("statCompetences"), valeur: stats.competences },
          { label: t("statAvecPrerequis"), valeur: stats.avecPrerequis },
          { label: t("statEvaluees"), valeur: stats.evaluees },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{s.valeur}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("chapitres")}</h2>
        {peutModifier && (
          <div className="flex flex-wrap gap-2">
            <ImportProgramme
              matiereId={matiereActive}
              matiereNom={matieres.find((m) => m.id === matiereActive)?.nom ?? ""}
              niveaux={[...new Set(chapitres.map((c) => c.niveau))].sort()}
            />
            {/* La proposition n'a de sens qu'avec de quoi relier : sur une
                matière vide, le bouton ne ferait qu'annoncer un échec. */}
            {stats.competences >= 2 && <PrerequisProposes matiereId={matiereActive} />}
            <Button size="sm" onClick={() => setDialogChapitre(true)} disabled={enCours}>
              <Plus className="mr-1 h-4 w-4" /> {t("chapitre")}
            </Button>
          </div>
        )}
      </div>

      {chapitresFiltres.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("aucunChapitre")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {chapitresFiltres.map((chapitre) => {
            const ouvert = deplies.has(chapitre.id);
            return (
              <Card key={chapitre.id}>
                <CardHeader className="cursor-pointer py-3" onClick={() => basculer(chapitre.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {ouvert ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <CardTitle className="truncate text-base">{chapitre.nom}</CardTitle>
                      <Badge variant="outline">{chapitre.niveau}</Badge>
                      <Badge variant="secondary">
                        {t("nbCompetences", { n: chapitre.competences.length })}
                      </Badge>
                    </div>
                    {peutModifier && (
                      <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDialogCompetence(chapitre.id)}
                          disabled={enCours}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => supprimer("chapitres", chapitre.id, chapitre.nom)}
                          disabled={enCours}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                {ouvert && (
                  <CardContent className="pt-0">
                    {chapitre.competences.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        {t("aucuneCompetence")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {chapitre.competences.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-start justify-between gap-3 rounded-lg border p-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="font-mono text-xs">
                                  {c.code}
                                </Badge>
                                <span className="font-medium">{c.libelle}</span>
                              </div>
                              {c.description && (
                                <p className="text-sm text-muted-foreground">{c.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                {c.prerequis.length > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Link2 className="h-3 w-3" />
                                    {t("exige", { liste: c.prerequis.map((p) => p.libelle).join(", ") })}
                                  </span>
                                )}
                                {c._count.dependants > 0 && (
                                  <span className="flex items-center gap-1 text-amber-600">
                                    <Target className="h-3 w-3" />
                                    {t("conditionne", { n: c._count.dependants })}
                                  </span>
                                )}
                                {c._count.evidences > 0 && (
                                  <span>{t("preuvesCollectees", { n: c._count.evidences })}</span>
                                )}
                              </div>
                            </div>
                            {peutModifier && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => supprimer("competences", c.id, c.libelle)}
                                disabled={enCours}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Nouveau chapitre */}
      <Dialog open={dialogChapitre} onOpenChange={setDialogChapitre}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("nouveauChapitre")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ch-nom">{t("nom")}</Label>
              <Input
                id="ch-nom"
                value={formChapitre.nom}
                onChange={(e) => setFormChapitre((f) => ({ ...f, nom: e.target.value }))}
                placeholder={t("exempleChapitreNom")}
              />
            </div>
            <div>
              <Label htmlFor="ch-niveau">{t("niveau")}</Label>
              <Input
                id="ch-niveau"
                value={formChapitre.niveau}
                onChange={(e) => setFormChapitre((f) => ({ ...f, niveau: e.target.value }))}
                placeholder={t("exempleNiveau")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogChapitre(false)}>
              {tc("annuler")}
            </Button>
            <Button onClick={creerChapitre} disabled={enCours}>
              {enCours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("creer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nouvelle compétence */}
      <Dialog
        open={dialogCompetence !== null}
        onOpenChange={(o) => !o && setDialogCompetence(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("nouvelleCompetence")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="co-code">{t("code")}</Label>
              <Input
                id="co-code"
                value={formCompetence.code}
                onChange={(e) => setFormCompetence((f) => ({ ...f, code: e.target.value }))}
                placeholder={t("exempleCode")}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("codeAide")}
              </p>
            </div>
            <div>
              <Label htmlFor="co-libelle">{t("libelle")}</Label>
              <Input
                id="co-libelle"
                value={formCompetence.libelle}
                onChange={(e) => setFormCompetence((f) => ({ ...f, libelle: e.target.value }))}
                placeholder={t("exempleCompetenceLibelle")}
              />
            </div>
            <div>
              <Label htmlFor="co-desc">{t("description")}</Label>
              <Textarea
                id="co-desc"
                value={formCompetence.description}
                onChange={(e) =>
                  setFormCompetence((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </div>

            <div>
              <Label>{t("prerequis")}</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                {t("prerequisAide")}
              </p>
              {toutesCompetences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("aucuneAutreCompetence")}
                </p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {toutesCompetences.map((c) => {
                    const choisi = formCompetence.prerequisIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={choisi}
                          onChange={() =>
                            setFormCompetence((f) => ({
                              ...f,
                              prerequisIds: choisi
                                ? f.prerequisIds.filter((i) => i !== c.id)
                                : [...f.prerequisIds, c.id],
                            }))
                          }
                        />
                        <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                        <span className="truncate">{c.libelle}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCompetence(null)}>
              {tc("annuler")}
            </Button>
            <Button
              onClick={() => dialogCompetence && creerCompetence(dialogCompetence)}
              disabled={enCours}
            >
              {enCours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc("creer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!peutModifier && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          {tc("consultationSeule")}
        </p>
      )}
    </div>
  );
}
