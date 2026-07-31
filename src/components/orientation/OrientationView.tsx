"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Compass, Search, TrendingUp, TrendingDown, Star,
  ChevronRight, ArrowLeft, AlertTriangle, CheckCircle2,
  BookOpen, Calendar, Users, Loader2, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, calculerMoyenne } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

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

interface EleveResume {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe: { nom: string; niveau: string } | null;
  parcours: { annee: string; moyenneAnnuelle: number | null; recommandation: TypeRecom | null }[];
  notes: { valeur: number; noteMax: number; coefficient: number }[];
  absences: { id: string }[];
}

// ─── Calcul recommandation automatique ───────────────────────────────────────

function calculerRecommandation(moyenne: number | null, absences: number): TypeRecom {
  if (moyenne === null) return "SOUTIEN_RENFORCE";
  if (moyenne >= 16) return "EXCELLENTE_VOIE";
  if (moyenne >= 14) return "FILIERE_SCIENTIFIQUE";
  if (moyenne >= 12) return "FILIERE_LITTERAIRE";
  if (moyenne >= 10) return "FILIERE_TECHNIQUE";
  if (moyenne >= 8 && absences < 5) return "SOUTIEN_RENFORCE";
  if (moyenne < 8 || absences > 10) return "REDOUBLEMENT";
  return "FILIERE_PROFESSIONNELLE";
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
  const recomAuto = calculerRecommandation(moyenneActuelle, absencesInjust);

  // Données graphique évolution
  const chartData = [...parcours].reverse().map((p: any) => ({
    annee: p.annee.slice(-2), // "24-25" → "24-25"
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
            recommandation: recomChoisie || recomAuto,
            commentaire,
          }),
        });
        toast.success(t("orientationSaved"));
      } catch { toast.error(t("error")); }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white text-lg">
            {eleve.prenom} {eleve.nom}
          </h2>
          <p className="text-sm text-gray-500">{eleve.classe?.nom} · {eleve.matricule}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Colonne gauche : stats */}
        <div className="space-y-4">
          {/* Moyenne actuelle */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 text-center">
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

          {/* Indicateurs */}
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
          {/* Graphique évolution */}
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

          {/* Recommandation auto */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
                <Compass className="w-4 h-4 text-primary" />
                {t("recomTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn("p-3 rounded-xl border-2 flex items-center gap-3", RECOM_CONFIG[recomAuto].color)}>
                <span className="text-2xl">{RECOM_CONFIG[recomAuto].emoji}</span>
                <div>
                  <p className="font-semibold text-sm">{t(RECOM_CONFIG[recomAuto].labelKey)}</p>
                  <p className="text-xs opacity-70">{t("recomAuto")}</p>
                </div>
              </div>

              {/* Override manuel */}
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block font-medium">
                  {t("recomEdit")}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
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

              {/* Commentaire */}
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

// ─── Vue principale ───────────────────────────────────────────────────────────

export function OrientationView() {
  const t = useTranslations("orientation");
  const [eleves, setEleves] = useState<EleveResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/orientation")
      .then((r) => r.json())
      .then((d) => setEleves(d.eleves ?? []))
      .finally(() => setLoading(false));
  }, []);

  const elevesAvecMoyenne = useMemo(() => eleves.map((e) => {
    const moy = calculerMoyenne(e.notes);
    const recom = calculerRecommandation(moy, e.absences.length);
    return { ...e, moyenne: moy, recomAuto: recom };
  }), [eleves]);

  const filtered = useMemo(() => elevesAvecMoyenne.filter((e) => {
    const q = search.toLowerCase();
    return !q || `${e.prenom} ${e.nom} ${e.classe?.nom ?? ""}`.toLowerCase().includes(q);
  }), [elevesAvecMoyenne, search]);

  if (selectedId) {
    return <FicheOrientationEleve eleveId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  // Répartition par recommandation
  const recomStats = elevesAvecMoyenne.reduce<Record<string, number>>((acc, e) => {
    acc[e.recomAuto] = (acc[e.recomAuto] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* En-tête stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t("studentsToOrient"), value: elevesAvecMoyenne.length, icon: <Users className="w-5 h-5 text-indigo-600" />, color: "bg-indigo-100 dark:bg-indigo-900/30" },
          { label: t("excellentPath"), value: recomStats["EXCELLENTE_VOIE"] ?? 0, icon: <Star className="w-5 h-5 text-yellow-600" />, color: "bg-yellow-100 dark:bg-yellow-900/30" },
          { label: t("supportRepeat"), value: (recomStats["SOUTIEN_RENFORCE"] ?? 0) + (recomStats["REDOUBLEMENT"] ?? 0), icon: <AlertTriangle className="w-5 h-5 text-orange-600" />, color: "bg-orange-100 dark:bg-orange-900/30" },
          { label: t("withParcours"), value: elevesAvecMoyenne.filter((e) => e.parcours.length > 0).length, icon: <BarChart3 className="w-5 h-5 text-green-600" />, color: "bg-green-100 dark:bg-green-900/30" },
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

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder={t("searchStudent")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <Compass className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t("noStudentFound")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const recomCfg = RECOM_CONFIG[e.recomAuto];
            return (
              <Card
                key={e.id}
                className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer"
                onClick={() => setSelectedId(e.id)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm font-semibold">
                      {getInitials(`${e.prenom} ${e.nom}`)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{e.prenom} {e.nom}</p>
                      <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                        {e.classe?.nom ?? t("noClass")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={cn(
                        "text-sm font-bold",
                        (e.moyenne ?? 0) >= 14 ? "text-green-600" :
                        (e.moyenne ?? 0) >= 10 ? "text-blue-600" :
                        (e.moyenne ?? 0) >= 8 ? "text-orange-500" : "text-red-600"
                      )}>
                        {e.moyenne?.toFixed(2) ?? "—"}/20
                      </span>
                      {e.absences.length > 0 && (
                        <span className="text-xs text-orange-500">{t("absShort", { count: e.absences.length })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={cn("text-xs gap-1", recomCfg.color)}>
                      {recomCfg.emoji} {t(recomCfg.labelKey)}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
