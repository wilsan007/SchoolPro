"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileUp, Loader2, Check, X, Trash2, BookOpenCheck, Quote, Sparkles,
  AlertTriangle, Plus, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { cn } from "@/lib/utils";

type Origine = "lu" | "deduit";

interface CompetenceImportee {
  code: string;
  libelle: string;
  origine: Origine;
  extrait: string;
}

interface ChapitreImporte {
  nom: string;
  niveau: string;
  origine: Origine;
  extrait: string;
  competences: CompetenceImportee[];
}

/**
 * Import d'un programme officiel, en trois temps : fournir, relire, appliquer.
 *
 * LA DISTINCTION QUI PORTE TOUT L'ÉCRAN
 * -------------------------------------
 * Chaque élément est marqué **lu** — il figure dans le document, l'extrait est
 * consultable — ou **déduit** — le modèle l'a proposé à partir d'un contenu.
 * Les programmes officiels listent le plus souvent des contenus (« Les
 * fractions ») et non des compétences (« additionner deux fractions de
 * dénominateurs différents ») : la seconde catégorie est donc la plus
 * nombreuse, et la plus à vérifier.
 *
 * Sans cette distinction, l'enseignant devrait tout revérifier — donc tout
 * ressaisir, et l'import ne servirait à rien.
 *
 * Tout est éditable avant application : le modèle prépare le terrain, il ne
 * décide pas.
 */
export function ImportProgramme({
  matiereId,
  matiereNom,
  niveaux,
}: {
  matiereId: string;
  matiereNom: string;
  /** Niveaux déjà connus dans le tenant (distinct de Classe.niveau). */
  niveaux: string[];
}) {
  const t = useTranslations("learnos.import");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");
  const router = useRouter();

  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [niveau, setNiveau] = useState("");
  const [texte, setTexte] = useState("");
  const [chapitres, setChapitres] = useState<ChapitreImporte[] | null>(null);
  const [modele, setModele] = useState<string | null>(null);
  const [tronque, setTronque] = useState(false);
  const [nbTranches, setNbTranches] = useState(1);
  const champFichier = useRef<HTMLInputElement>(null);

  function reinitialiser() {
    setChapitres(null);
    setTexte("");
    setTronque(false);
    setNbTranches(1);
    if (champFichier.current) champFichier.current.value = "";
  }

  async function traiterReponse(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));
    setChapitres(data.chapitres ?? []);
    setModele(data.modele ?? null);
    setTronque(Boolean(data.tronque));
    setNbTranches(Number(data.tranches) || 1);
  }

  function analyserFichier(fichier: File) {
    if (!niveau.trim()) {
      toast.error(t("niveauRequis"));
      return;
    }
    demarrer(async () => {
      try {
        const form = new FormData();
        form.append("matiereId", matiereId);
        form.append("niveau", niveau.trim());
        form.append("fichier", fichier);
        await traiterReponse(
          await fetch("/api/curriculum/import", { method: "POST", body: form })
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function analyserTexte() {
    if (!niveau.trim() || texte.trim().length < 50) {
      toast.error(t("texteRequis"));
      return;
    }
    demarrer(async () => {
      try {
        await traiterReponse(
          await fetch("/api/curriculum/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matiereId, niveau: niveau.trim(), texte }),
          })
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function appliquer() {
    if (!chapitres || chapitres.length === 0) return;
    demarrer(async () => {
      try {
        const res = await fetch("/api/curriculum/import", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matiereId, chapitres }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        toast.success(
          t("importe", {
            chapitres: data.chapitresCrees ?? 0,
            competences: data.competencesCreees ?? 0,
          })
        );
        for (const ignore of data.ignores ?? []) {
          toast.info(t(`ignore_${ignore.motif}`, { nom: ignore.nom }));
        }
        // Alerte de couverture : l'import vient de créer des compétences qui
        // n'ont aucune question en banque. Le dire tout de suite, tant que
        // l'enseignant est dans l'action, plutôt que d'attendre qu'un élève
        // reçoive une séance vide.
        if (data.couverture?.trousTotal > 0) {
          toast.warning(t("couvertureAlerte", { trous: data.couverture.trousTotal }), {
            duration: 8000,
          });
        }
        setOuvert(false);
        reinitialiser();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  // --- édition locale de la proposition ---

  function majChapitre(i: number, patch: Partial<ChapitreImporte>) {
    setChapitres((prev) =>
      prev ? prev.map((c, k) => (k === i ? { ...c, ...patch } : c)) : prev
    );
  }

  function retirerChapitre(i: number) {
    setChapitres((prev) => (prev ? prev.filter((_, k) => k !== i) : prev));
  }

  function majCompetence(i: number, j: number, patch: Partial<CompetenceImportee>) {
    setChapitres((prev) =>
      prev
        ? prev.map((c, k) =>
            k === i
              ? {
                  ...c,
                  competences: c.competences.map((x, m) =>
                    m === j ? { ...x, ...patch } : x
                  ),
                }
              : c
          )
        : prev
    );
  }

  function retirerCompetence(i: number, j: number) {
    setChapitres((prev) =>
      prev
        ? prev.map((c, k) =>
            k === i ? { ...c, competences: c.competences.filter((_, m) => m !== j) } : c
          )
        : prev
    );
  }

  function ajouterCompetence(i: number) {
    setChapitres((prev) =>
      prev
        ? prev.map((c, k) =>
            k === i
              ? {
                  ...c,
                  competences: [
                    ...c.competences,
                    // Ajoutée à la main : ni lue ni déduite, mais `deduit` est
                    // la marque honnête — elle n'est pas dans le document.
                    { code: "", libelle: "", origine: "deduit" as const, extrait: "" },
                  ],
                }
              : c
          )
        : prev
    );
  }

  const totaux = chapitres
    ? {
        chapitres: chapitres.length,
        competences: chapitres.reduce((n, c) => n + c.competences.length, 0),
        lues: chapitres.reduce(
          (n, c) => n + c.competences.filter((x) => x.origine === "lu").length,
          0
        ),
      }
    : null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <FileUp className="mr-1.5 h-4 w-4" />
        {t("bouton")}
      </Button>

      <Dialog
        open={ouvert}
        onOpenChange={(o) => {
          setOuvert(o);
          if (!o) reinitialiser();
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("titre", { matiere: matiereNom })}</DialogTitle>
          </DialogHeader>

          {chapitres === null ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("aide")}</p>

              <div className="space-y-1.5">
                <Label htmlFor="imp-niveau">{t("niveau")}</Label>
                {niveaux.length > 0 ? (
                  <Select value={niveau} onValueChange={setNiveau}>
                    <SelectTrigger id="imp-niveau">
                      <SelectValue placeholder={t("niveauExemple")} />
                    </SelectTrigger>
                    <SelectContent>
                      {niveaux.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="imp-niveau"
                    value={niveau}
                    onChange={(e) => setNiveau(e.target.value)}
                    placeholder={t("niveauExemple")}
                  />
                )}
                <p className="text-xs text-muted-foreground">{t("niveauAide")}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="imp-fichier">{t("fichier")}</Label>
                <Input
                  id="imp-fichier"
                  ref={champFichier}
                  type="file"
                  accept="application/pdf"
                  disabled={enCours}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) analyserFichier(f);
                  }}
                />
                {/* Dit d'emblée : un scan n'a aucun texte à lire, et c'est le
                    cas le plus fréquent des documents ministériels. */}
                <p className="text-xs text-muted-foreground">{t("fichierAide")}</p>
              </div>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{t("ou")}</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="imp-texte">{t("texte")}</Label>
                <Textarea
                  id="imp-texte"
                  rows={8}
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                  placeholder={t("textePlaceholder")}
                />
              </div>

              <Button onClick={analyserTexte} disabled={enCours} className="w-full">
                {enCours ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <BookOpenCheck className="mr-1.5 h-4 w-4" />
                )}
                {t("analyser")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Le rapport de lecture, avant tout le reste : combien vient
                  vraiment du document ? */}
              <Card className="border-l-4 border-l-fuchsia-500">
                <CardContent className="space-y-2 p-4 text-sm">
                  <p className="font-medium">
                    {t("resume", {
                      chapitres: totaux!.chapitres,
                      competences: totaux!.competences,
                    })}
                  </p>
                  <p className="text-muted-foreground">
                    {t("resumeOrigine", {
                      lues: totaux!.lues,
                      deduites: totaux!.competences - totaux!.lues,
                    })}
                  </p>
                  {tronque && (
                    <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {t("tronque")}
                    </p>
                  )}
                  {nbTranches > 1 && !tronque && (
                    <p className="flex items-start gap-1.5 text-blue-700 dark:text-blue-400">
                      <Layers className="mt-0.5 h-4 w-4 shrink-0" />
                      {t("tranchesAnalysees", { n: nbTranches })}
                    </p>
                  )}
                  {modele && (
                    <p className="text-xs text-muted-foreground">
                      {t("origine", { modele })}
                    </p>
                  )}
                </CardContent>
              </Card>

              {chapitres.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("aucunChapitre")}
                </p>
              ) : (
                chapitres.map((chapitre, i) => (
                  <Card key={i}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start gap-2">
                        <Input
                          value={chapitre.nom}
                          onChange={(e) => majChapitre(i, { nom: e.target.value })}
                          className="min-w-0 flex-1 font-medium"
                        />
                        <Input
                          value={chapitre.niveau}
                          onChange={(e) => majChapitre(i, { niveau: e.target.value })}
                          className="w-28"
                        />
                        <MarqueOrigine origine={chapitre.origine} t={t} />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => retirerChapitre(i)}
                          aria-label={t("retirerChapitre")}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      {chapitre.extrait && (
                        <blockquote className="border-l-2 pl-3 text-xs italic text-muted-foreground">
                          {chapitre.extrait}
                        </blockquote>
                      )}

                      <ul className="space-y-2">
                        {chapitre.competences.map((competence, j) => (
                          <li
                            key={j}
                            className={cn(
                              "space-y-1.5 rounded-lg border p-2.5",
                              competence.origine === "deduit" &&
                                "border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20"
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={competence.code}
                                onChange={(e) =>
                                  majCompetence(i, j, { code: e.target.value })
                                }
                                className="w-32 font-mono text-xs"
                                placeholder={t("code")}
                              />
                              <Input
                                value={competence.libelle}
                                onChange={(e) =>
                                  majCompetence(i, j, { libelle: e.target.value })
                                }
                                className="min-w-0 flex-1"
                                placeholder={t("libelle")}
                              />
                              <MarqueOrigine origine={competence.origine} t={t} />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => retirerCompetence(i, j)}
                                aria-label={t("retirerCompetence")}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            {competence.extrait && (
                              <p className="flex items-start gap-1.5 text-xs italic text-muted-foreground">
                                <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                                {competence.extrait}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => ajouterCompetence(i)}
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        {t("ajouterCompetence")}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={reinitialiser} disabled={enCours}>
                  {t("recommencer")}
                </Button>
                <Button
                  onClick={appliquer}
                  disabled={enCours || chapitres.length === 0}
                >
                  {enCours ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-4 w-4" />
                  )}
                  {t("appliquer")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Marque visuelle de l'origine — c'est la seule information non éditable. */
function MarqueOrigine({
  origine,
  t,
}: {
  origine: Origine;
  t: (cle: string) => string;
}) {
  if (origine === "lu") {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <Quote className="h-3 w-3" />
        {t("lu")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0 gap-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
    >
      <Sparkles className="h-3 w-3" />
      {t("deduit")}
    </Badge>
  );
}
