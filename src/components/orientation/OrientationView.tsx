"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Compass, Search, ArrowLeft, CheckCircle2,
  Users, Loader2, BarChart3, GraduationCap, BookOpen,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, calculerMoyenne } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { FILIERES, computeFiliereScores, type ScoreFiliere, type FiliereSlug } from "@/lib/orientation";

// ─── Types ────────────────────────────────────────────────────────────────────

type TypeRecom = "FILIERE_SCIENTIFIQUE" | "FILIERE_LITTERAIRE" | "FILIERE_TECHNIQUE" |
  "FILIERE_PROFESSIONNELLE" | "REDOUBLEMENT" | "SOUTIEN_RENFORCE" | "EXCELLENTE_VOIE";

const RECOM_CONFIG: Record<TypeRecom, { labelKey: string; color: string; emoji: string }> = {
  EXCELLENTE_VOIE:      { labelKey: "recomTypes.EXCELLENTE_VOIE",     color: "bg-yellow-50 text-yellow-800 border-yellow-300",  emoji: "⭐" },
  FILIERE_SCIENTIFIQUE: { labelKey: "recomTypes.FILIERE_SCIENTIFIQUE", color: "bg-blue-50 text-blue-800 border-blue-300",       emoji: "🔬" },
  FILIERE_LITTERAIRE:   { labelKey: "recomTypes.FILIERE_LITTERAIRE",   color: "bg-purple-50 text-purple-800 border-purple-300", emoji: "📚" },
  FILIERE_TECHNIQUE:    { labelKey: "recomTypes.FILIERE_TECHNIQUE",    color: "bg-green-50 text-green-800 border-green-300",    emoji: "🔧" },
  FILIERE_PROFESSIONNELLE: { labelKey: "recomTypes.FILIERE_PROFESSIONNELLE", color: "bg-teal-50 text-teal-800 border-teal-300",   emoji: "🏭" },
  SOUTIEN_RENFORCE:     { labelKey: "recomTypes.SOUTIEN_RENFORCE",     color: "bg-orange-50 text-orange-800 border-orange-300", emoji: "🤝" },
  REDOUBLEMENT:         { labelKey: "recomTypes.REDOUBLEMENT",         color: "bg-red-50 text-red-800 border-red-300",          emoji: "🔄" },
};

const NIVEAU_OPTIONS = ["Seconde", "2nde", "2nd", "Troisième", "Quatrième", "Cinquième", "Sixième"];

interface NoteApi {
  valeur: number;
  noteMax: number;
  coefficient: number;
  matiere: { nom: string; code: string | null };
}

interface EleveResume {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe: { nom: string; niveau: string } | null;
  parcours: { annee: string; moyenneAnnuelle: number | null; recommandation: TypeRecom | null }[];
  notes: NoteApi[];
  absences: { id: string }[];
}

function FiliereScoreBar({ score }: { score: ScoreFiliere }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span>{score.emoji}</span>
          <span className="font-medium">{score.label}</span>
          {score.matchedCount > 0 && (
            <span className="text-xs text-muted-foreground">({score.matchedCount} matière{score.matchedCount > 1 ? "s" : ""})</span>
          )}
        </div>
        <span className={cn("font-bold", score.percent >= 70 ? "text-green-600" : score.percent >= 50 ? "text-blue-600" : "text-orange-600")}>
          {score.percent}%
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", score.color)}
          style={{ width: `${Math.max(0, Math.min(100, score.percent))}%` }}
        />
      </div>
      {score.details.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
          {score.details.slice(0, 4).map((d, i) => (
            <div key={i} className="flex justify-between">
              <span className="truncate max-w-[70%]">{d.matiere}</span>
              <span>{d.noteSur20.toFixed(1)}/20 (×{d.coefficient})</span>
            </div>
          ))}
          {score.details.length > 4 && (
            <p className="italic">+ {score.details.length - 4} autres matières</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fiche individuelle ───────────────────────────────────────────────────────

function FicheOrientationEleve({
  eleveId,
  onBack,
}: { eleveId: string; onBack: () => void }) {
  const t = useTranslations("orientation");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [recomChoisie, setRecomChoisie] = useState<TypeRecom | "">("");
  const [commentaire, setCommentaire] = useState("");

  useEffect(() => {
    fetch(`/api/orientation?eleveId=${eleveId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.parcours?.[0]?.recommandation) {
          setRecomChoisie(d.parcours[0].recommandation);
          setCommentaire(d.parcours[0].commentaire ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [eleveId]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
  if (!data?.eleve) return null;

  const { eleve, parcours, notes, absencesInjust, incidents } = data;
  const moyenneActuelle = calculerMoyenne(notes);
  const filiereScores = computeFiliereScores(notes);
  const topFiliere = filiereScores[0] ?? null;

  const chartData = [...parcours].reverse().map((p: any) => ({
    annee: p.annee,
    moyenne: p.moyenneAnnuelle ?? 0,
  }));

  const handleSauvegarder = () => {
    startTransition(async () => {
      try {
        const anneeActuelle = `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;
        await fetch("/api/orientation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eleveId,
            annee: anneeActuelle,
            classe: eleve.classe?.nom ?? "",
            niveau: eleve.classe?.niveau ?? "",
            moyenneAnnuelle: moyenneActuelle,
            recommandation: recomChoisie || (topFiliere ? mapFiliereToRecom(topFiliere.key) : undefined),
            commentaire,
          }),
        });
        toast.success(t("orientationSaved"));
      } catch { toast.error(t("error")); }
    });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white text-lg">
            {eleve.prenom} {eleve.nom}
          </h2>
          <p className="text-sm text-gray-500">{eleve.classe?.nom} · {eleve.matricule}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Colonne gauche : stats */}
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 sm:p-5 text-center">
              <p className="text-xs text-gray-500 mb-2">{t("currentAverage")}</p>
              <p className={cn(
                "text-4xl font-bold",
                (moyenneActuelle ?? 0) >= 14 ? "text-green-600" :
                (moyenneActuelle ?? 0) >= 10 ? "text-blue-600" :
                (moyenneActuelle ?? 0) >= 8 ? "text-orange-500" : "text-red-600"
              )}>
                {moyenneActuelle?.toFixed(2) ?? "—"}/20
              </p>
              <p className="text-xs text-gray-400 mt-1">{t("publishedGrades", { count: notes.length })}</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">{t("unjustAbsences")}</span>
                <Badge className={absencesInjust > 5 ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}>
                  {absencesInjust}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">{t("incidents")}</span>
                <Badge className={incidents > 0 ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-gray-100 text-gray-500"}>
                  {incidents}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">{t("parcoursYears")}</span>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200">{parcours.length}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Colonne centrale : évolution + recommandation */}
        <div className="lg:col-span-2 space-y-4">
          {chartData.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-600">{t("avgEvolution")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="annee" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="4 4" label={{ value: t("threshold"), position: "right", fontSize: 10 }} />
                    <Line type="monotone" dataKey="moyenne" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Scores par filière */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                {t("filiereScores")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {topFiliere && (
                <div className={cn("p-3 rounded-xl border-2 flex items-center gap-3 bg-muted/30", topFiliere.color.replace("bg-", "border-"))}>
                  <span className="text-2xl">{topFiliere.emoji}</span>
                  <div>
                    <p className="font-semibold text-sm">
                      {t("preferredFiliere")}: {topFiliere.label} ({topFiliere.percent}%)
                    </p>
                    <p className="text-xs opacity-70">{t("preferredFiliereHint")}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {filiereScores.map((score) => (
                  <FiliereScoreBar key={score.key} score={score} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recommandation manuelle */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
                <Compass className="w-4 h-4 text-primary" />
                {t("recomTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block font-medium">
                  {t("recomEdit")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(Object.keys(RECOM_CONFIG) as TypeRecom[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRecomChoisie(r)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all text-left",
                        recomChoisie === r
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      )}
                    >
                      <span>{RECOM_CONFIG[r].emoji}</span>
                      <span className="truncate">{t(RECOM_CONFIG[r].labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-600 mb-1 block font-medium">{t("counselorComment")}</label>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  rows={3}
                  placeholder={t("commentPlaceholder")}
                  className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background resize-none"
                />
              </div>

              <Button onClick={handleSauvegarder} disabled={isPending} className="w-full gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t("saveOrientation")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function mapFiliereToRecom(key: FiliereSlug): TypeRecom {
  switch (key) {
    case "SCIENTIFIQUE": return "FILIERE_SCIENTIFIQUE";
    case "LITTERAIRE": return "FILIERE_LITTERAIRE";
    case "TECHNOLOGIQUE": return "FILIERE_TECHNIQUE";
    case "ECONOMIQUE":
    case "AUTRES":
    default: return "FILIERE_PROFESSIONNELLE";
  }
}

// ─── Vue principale ───────────────────────────────────────────────────────────

export function OrientationView() {
  const t = useTranslations("orientation");
  const [eleves, setEleves] = useState<EleveResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [niveau, setNiveau] = useState("Seconde");
  const [openedFiliere, setOpenedFiliere] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orientation?niveau=${encodeURIComponent(niveau)}`)
      .then((r) => r.json())
      .then((d) => setEleves(d.eleves ?? []))
      .finally(() => setLoading(false));
  }, [niveau]);

  const elevesAvecScores = useMemo(() => eleves.map((e) => {
    const moy = calculerMoyenne(e.notes);
    const scores = computeFiliereScores(e.notes);
    const best = scores[0] ?? null;
    return { ...e, moyenne: moy, scores, bestFiliere: best };
  }), [eleves]);

  const filtered = useMemo(() => elevesAvecScores.filter((e) => {
    const q = search.toLowerCase();
    return !q || `${e.prenom} ${e.nom} ${e.classe?.nom ?? ""}`.toLowerCase().includes(q);
  }), [elevesAvecScores, search]);

  const elevesByFiliere = useMemo(() => {
    const map: Record<string, typeof elevesAvecScores> = {};
    for (const f of FILIERES) map[f.key] = [];
    for (const e of filtered) {
      const key = e.bestFiliere?.key ?? "AUTRES";
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [filtered]);

  if (selectedId) {
    return <FicheOrientationEleve eleveId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  const totalEleves = filtered.length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-48">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t("level")}</label>
          <Select value={niveau} onValueChange={setNiveau}>
            <SelectTrigger>
              <SelectValue placeholder={t("level")} />
            </SelectTrigger>
            <SelectContent>
              {NIVEAU_OPTIONS.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t("searchStudent")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("studentsToOrient"), value: totalEleves, icon: <Users className="w-5 h-5 text-indigo-600" />, color: "bg-indigo-100 dark:bg-indigo-900/30" },
          { label: t("scientificStream"), value: elevesByFiliere["SCIENTIFIQUE"].length, icon: <BookOpen className="w-5 h-5 text-blue-600" />, color: "bg-blue-100 dark:bg-blue-900/30" },
          { label: t("literaryStream"), value: elevesByFiliere["LITTERAIRE"].length, icon: <BookOpen className="w-5 h-5 text-purple-600" />, color: "bg-purple-100 dark:bg-purple-900/30" },
          { label: t("technologicalStream"), value: elevesByFiliere["TECHNOLOGIQUE"].length, icon: <BarChart3 className="w-5 h-5 text-amber-600" />, color: "bg-amber-100 dark:bg-amber-900/30" },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{s.value}</p>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.color)}>{s.icon}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Groupes de filières */}
      {totalEleves === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <Compass className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t("noStudentFound")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {FILIERES.map((filiere) => {
            const group = elevesByFiliere[filiere.key] ?? [];
            const isOpen = openedFiliere === filiere.key;
            return (
              <Card
                key={filiere.key}
                className={cn("border-0 shadow-sm transition-all", group.length === 0 && "opacity-60")}
              >
                <button
                  onClick={() => setOpenedFiliere(isOpen ? null : filiere.key)}
                  className="w-full"
                  type="button"
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white", filiere.color)}>
                        <span className="text-lg">{filiere.emoji}</span>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-white">{filiere.label}</p>
                        <p className="text-xs text-muted-foreground">{group.length} élève{group.length > 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                        {group.length > 0 ? Math.round(group.reduce((sum, e) => sum + (e.bestFiliere?.percent ?? 0), 0) / group.length) : 0}% moy.
                      </span>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </div>
                  </CardContent>
                </button>

                {isOpen && (
                  <CardContent className="px-4 pb-4 pt-0">
                    <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                      {group.map((e) => (
                        <div
                          key={e.id}
                          onClick={() => setSelectedId(e.id)}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <Avatar className="h-10 w-10 flex-shrink-0">
                            <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm font-semibold">
                              {getInitials(`${e.prenom} ${e.nom}`)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                              {e.prenom} {e.nom}
                            </p>
                            <p className="text-xs text-muted-foreground">{e.classe?.nom ?? t("noClass")}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={cn(
                              "text-sm font-bold",
                              (e.moyenne ?? 0) >= 14 ? "text-green-600" :
                              (e.moyenne ?? 0) >= 10 ? "text-blue-600" :
                              (e.moyenne ?? 0) >= 8 ? "text-orange-500" : "text-red-600"
                            )}>
                              {e.moyenne?.toFixed(2) ?? "—"}/20
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {e.bestFiliere ? `${e.bestFiliere.percent}%` : "—"}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
