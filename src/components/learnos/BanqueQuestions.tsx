"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Plus, Check, EyeOff, Loader2, Wand2, BookOpen, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { texteErreur } from "@/lib/erreurs-client";
import {
  EditeurQuestion,
  depuisStructure,
  etapeVierge,
  versStructure,
  type EtapeSaisie,
} from "@/components/learnos/EditeurQuestion";

const PALIERS = ["RESTITUTION", "APPLICATION", "CONSOLIDATION", "TRANSFERT", "OUVERTURE"] as const;
const FORMATS = [
  "SAISIE_COURTE",
  "CHOIX_UNIQUE",
  "ETAPES_GUIDEES",
  "REMISE_EN_ORDRE",
  "APPARIEMENT",
] as const;

type Palier = (typeof PALIERS)[number];
type Format = (typeof FORMATS)[number];

interface Question {
  id: string;
  enonce: string;
  palier: Palier;
  format: Format | "SAISIE_LIBRE";
  structure: unknown;
  bareme: number;
  origine: string;
  relueLe: string | null;
  actif: boolean;
  _count: { exercices: number };
}

interface Competence {
  id: string;
  code: string;
  libelle: string;
}

interface Chapitre {
  id: string;
  nom: string;
  niveau: string;
  competences: Competence[];
}

/**
 * Banque de questions — saisie, génération, relecture.
 *
 * TROIS GESTES, DANS L'ORDRE OÙ ILS SE PRÉSENTENT VRAIMENT
 * --------------------------------------------------------
 * Générer d'abord (c'est ce qui remplit vite), relire ensuite (c'est ce qui
 * rend les preuves fiables), saisir à la main enfin (c'est ce qui reste quand
 * l'IA n'est pas configurée). L'ordre de l'écran suit celui-là — mettre la
 * saisie manuelle en tête laisserait croire qu'elle est le chemin normal.
 *
 * POURQUOI LA RELECTURE EST MISE EN AVANT
 * ---------------------------------------
 * Une question générée est servie tout de suite, mais la preuve qu'elle produit
 * est décotée tant que personne ne l'a lue. Ce n'est pas une file d'attente
 * bloquante — le dispositif tourne sans — mais un travail qui *améliore*
 * mesurablement ce que le système sait des élèves. Le compteur en haut existe
 * pour ça : sans lui, personne ne relirait jamais rien.
 */
export function BanqueQuestions({ chapitres }: { chapitres: Chapitre[] }) {
  const t = useTranslations("learnos.banque");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");

  const [competenceId, setCompetenceId] = useState<string>("");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [enCours, demarrer] = useTransition();

  // Génération
  const [palierGen, setPalierGen] = useState<Palier>("APPLICATION");
  const [formatGen, setFormatGen] = useState<Format>("ETAPES_GUIDEES");
  const [nombreGen, setNombreGen] = useState(3);
  const [generation, setGeneration] = useState(false);

  // Saisie manuelle
  const [saisieOuverte, setSaisieOuverte] = useState(false);
  const [enonce, setEnonce] = useState("");
  const [palierSaisie, setPalierSaisie] = useState<Palier>("APPLICATION");
  const [formatSaisie, setFormatSaisie] = useState<Format>("CHOIX_UNIQUE");
  const [etapes, setEtapes] = useState<EtapeSaisie[]>([etapeVierge("CHOIX_UNIQUE")]);

  // Relecture d'une question existante
  const [enRelecture, setEnRelecture] = useState<Question | null>(null);
  const [etapesRelues, setEtapesRelues] = useState<EtapeSaisie[]>([]);

  const charger = useCallback(
    async (id: string) => {
      if (!id) return setQuestions(null);
      const res = await fetch(`/api/learnos/questions?competenceId=${id}`);
      setQuestions(res.ok ? (await res.json()).questions : []);
    },
    []
  );

  useEffect(() => {
    void charger(competenceId);
  }, [competenceId, charger]);

  async function appeler(url: string, init: RequestInit): Promise<boolean> {
    const res = await fetch(url, init);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(texteErreur(data, te, tc("erreurServeur")));
      return false;
    }
    return true;
  }

  async function generer() {
    setGeneration(true);
    try {
      const res = await fetch("/api/learnos/questions/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competenceId,
          palier: palierGen,
          format: formatGen,
          nombre: nombreGen,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

      // Le nombre de rejets est dit, pas caché : c'est le seul signal qui
      // permet de voir qu'un prompt ou un modèle s'est mis à dériver.
      toast.success(
        data.rejetees > 0
          ? t("genereesAvecRejets", { n: data.creees.length, rejets: data.rejetees })
          : t("generees", { n: data.creees.length })
      );
      await charger(competenceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tc("erreur"));
    } finally {
      setGeneration(false);
    }
  }

  function creer() {
    demarrer(async () => {
      const ok = await appeler("/api/learnos/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competenceId,
          enonce,
          palier: palierSaisie,
          format: formatSaisie,
          structure: versStructure(etapes),
        }),
      });
      if (!ok) return;
      toast.success(t("creee"));
      setEnonce("");
      setEtapes([etapeVierge(formatEtapeDe(formatSaisie))]);
      setSaisieOuverte(false);
      await charger(competenceId);
    });
  }

  function relire(question: Question, avecCorrection: boolean) {
    demarrer(async () => {
      const ok = await appeler(`/api/learnos/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          avecCorrection
            ? { structure: versStructure(etapesRelues), relue: true }
            : { relue: true }
        ),
      });
      if (!ok) return;
      toast.success(t("relue"));
      setEnRelecture(null);
      await charger(competenceId);
    });
  }

  function desactiver(id: string) {
    demarrer(async () => {
      const ok = await appeler(`/api/learnos/questions/${id}`, { method: "DELETE" });
      if (!ok) return;
      toast.success(t("desactivee"));
      await charger(competenceId);
    });
  }

  const aRelire = (questions ?? []).filter((q) => q.origine === "ia" && !q.relueLe && q.actif);

  return (
    <div className="space-y-4">
      {/* Sélection de la compétence — tout le reste en dépend. */}
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={competenceId}
        onChange={(e) => {
          setCompetenceId(e.target.value);
          setEnRelecture(null);
          setSaisieOuverte(false);
        }}
      >
        <option value="">{t("choisirCompetence")}</option>
        {chapitres.map((chapitre) => (
          <optgroup key={chapitre.id} label={`${chapitre.niveau} — ${chapitre.nom}`}>
            {chapitre.competences.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.libelle}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {!competenceId && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("choisirCompetenceAide")}
        </p>
      )}

      {competenceId && (
        <>
          {aRelire.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>{t("aRelire", { n: aRelire.length })}</p>
            </div>
          )}

          {/* 1. Générer */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Wand2 className="h-4 w-4 text-violet-600" />
                {t("titreGeneration")}
              </h3>
              <div className="flex flex-wrap gap-2">
                <SelectSimple
                  value={palierGen}
                  onChange={(v) => setPalierGen(v as Palier)}
                  options={PALIERS.map((p) => ({ value: p, label: t(`palier${p}`) }))}
                />
                <SelectSimple
                  value={formatGen}
                  onChange={(v) => setFormatGen(v as Format)}
                  options={FORMATS.map((f) => ({ value: f, label: t(`format${f}`) }))}
                />
                <Input
                  type="number"
                  min={1}
                  max={5}
                  className="w-20"
                  value={nombreGen}
                  onChange={(e) => setNombreGen(Number(e.target.value))}
                />
                <Button onClick={() => void generer()} disabled={generation}>
                  {generation ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-4 w-4" />
                  )}
                  {t("generer")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("generationNote")}</p>
            </CardContent>
          </Card>

          {/* 2. Les questions existantes */}
          {questions === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : questions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("banqueVide")}
            </p>
          ) : (
            <div className="space-y-2">
              {questions.map((q) => {
                const nonRelue = q.origine === "ia" && !q.relueLe;
                const ouverte = enRelecture?.id === q.id;
                return (
                  <Card
                    key={q.id}
                    className={cn(
                      "border-l-4",
                      !q.actif
                        ? "border-l-muted opacity-60"
                        : nonRelue
                          ? "border-l-amber-500"
                          : "border-l-emerald-500"
                    )}
                  >
                    <CardContent className="space-y-2.5 p-3.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="outline">{t(`palier${q.palier}`)}</Badge>
                        <Badge variant="secondary">{t(`format${q.format}`)}</Badge>
                        {q.origine === "ia" && (
                          <Badge
                            variant={nonRelue ? "destructive" : "secondary"}
                            className="gap-1"
                          >
                            <Sparkles className="h-3 w-3" />
                            {nonRelue ? t("nonRelue") : t("relueBadge")}
                          </Badge>
                        )}
                        {!q.actif && <Badge variant="outline">{t("desactiveeBadge")}</Badge>}
                        {q._count.exercices > 0 && (
                          <span className="text-muted-foreground">
                            {t("dejaServie", { n: q._count.exercices })}
                          </span>
                        )}
                      </div>

                      <p className="text-sm">{q.enonce}</p>

                      {/* Le corrigé est visible ici, et seulement ici : un
                          enseignant ne peut pas relire ce qu'il ne voit pas. */}
                      {ouverte ? (
                        <div className="space-y-3 rounded-lg bg-muted/30 p-3">
                          <EditeurQuestion
                            etapes={etapesRelues}
                            onChange={setEtapesRelues}
                            multiEtapes={q.format === "ETAPES_GUIDEES"}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => relire(q, true)} disabled={enCours}>
                              <Check className="mr-1.5 h-4 w-4" />
                              {t("enregistrerEtRelire")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEnRelecture(null)}
                            >
                              {tc("annuler")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEnRelecture(q);
                              setEtapesRelues(depuisStructure(q.structure));
                            }}
                          >
                            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                            {t("ouvrirCorrige")}
                          </Button>
                          {nonRelue && (
                            <Button size="sm" onClick={() => relire(q, false)} disabled={enCours}>
                              <Check className="mr-1.5 h-3.5 w-3.5" />
                              {t("validerTelQuel")}
                            </Button>
                          )}
                          {q.actif && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => desactiver(q.id)}
                              disabled={enCours}
                              title={t("desactiverAide")}
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 3. Saisie manuelle */}
          {saisieOuverte ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="text-sm font-semibold">{t("titreSaisie")}</h3>
                <Input
                  value={enonce}
                  onChange={(e) => setEnonce(e.target.value)}
                  placeholder={t("enonceGeneral")}
                />
                <div className="flex flex-wrap gap-2">
                  <SelectSimple
                    value={palierSaisie}
                    onChange={(v) => setPalierSaisie(v as Palier)}
                    options={PALIERS.map((p) => ({ value: p, label: t(`palier${p}`) }))}
                  />
                  <SelectSimple
                    value={formatSaisie}
                    onChange={(v) => {
                      const format = v as Format;
                      setFormatSaisie(format);
                      setEtapes([etapeVierge(formatEtapeDe(format))]);
                    }}
                    options={FORMATS.map((f) => ({ value: f, label: t(`format${f}`) }))}
                  />
                </div>
                <EditeurQuestion
                  etapes={etapes}
                  onChange={setEtapes}
                  multiEtapes={formatSaisie === "ETAPES_GUIDEES"}
                />
                <div className="flex gap-2">
                  <Button onClick={creer} disabled={enCours || enonce.trim() === ""}>
                    {enCours ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    {t("ajouter")}
                  </Button>
                  <Button variant="ghost" onClick={() => setSaisieOuverte(false)}>
                    {tc("annuler")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button variant="outline" onClick={() => setSaisieOuverte(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("saisirAMain")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Format d'étape correspondant à un format de question.
 *
 * `ETAPES_GUIDEES` n'est pas un format d'étape : c'est un assemblage. Sa
 * première étape démarre en saisie courte, l'enseignant change ensuite.
 */
function formatEtapeDe(format: Format) {
  return format === "ETAPES_GUIDEES" ? "SAISIE_COURTE" : format;
}

function SelectSimple({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="h-9 rounded-md border bg-background px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
