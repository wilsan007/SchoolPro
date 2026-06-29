"use client";

import { useState, useTransition, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Download, Printer, Star, BarChart3, ClipboardList,
  Loader2, CheckCircle2, Users, GraduationCap, BookOpen, School,
  TrendingUp, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types rapports ───────────────────────────────────────────────────────────

type TypeRapport = "palmares" | "statistiques" | "inspection";

const RAPPORTS: { type: TypeRapport; titre: string; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    type: "palmares",
    titre: "Palmarès des élèves",
    desc: "Classement des meilleurs élèves par bulletin publié, podium et distinctions",
    icon: <Star className="w-5 h-5 text-yellow-600" />,
    color: "bg-yellow-100 dark:bg-yellow-900/30",
  },
  {
    type: "statistiques",
    titre: "Statistiques annuelles",
    desc: "Vue synthétique de l'année : effectifs, moyennes, absences, taux de réussite",
    icon: <BarChart3 className="w-5 h-5 text-blue-600" />,
    color: "bg-blue-100 dark:bg-blue-900/30",
  },
  {
    type: "inspection",
    titre: "Rapport d'inspection",
    desc: "Rapport complet pour l'autorité de tutelle : classes, matières, corps enseignant",
    icon: <ClipboardList className="w-5 h-5 text-purple-600" />,
    color: "bg-purple-100 dark:bg-purple-900/30",
  },
];

// ─── Rendu rapport Palmarès ───────────────────────────────────────────────────

function PalmaresReport({ data, tenant }: { data: any[]; tenant: any }) {
  const top3 = data.slice(0, 3);
  const reste = data.slice(3);

  const MEDALS = ["🥇", "🥈", "🥉"];

  return (
    <div className="p-8 bg-white text-gray-900 print:p-0" id="rapport-content">
      {/* En-tête */}
      <div className="text-center border-b-2 border-gray-800 pb-6 mb-8">
        <h1 className="text-2xl font-bold uppercase tracking-wide">{tenant?.name}</h1>
        <p className="text-gray-500 text-sm mt-1">{tenant?.city} · Année {tenant?.currentYear}</p>
        <h2 className="text-xl font-bold mt-4 text-primary">🏆 PALMARÈS DES ÉLÈVES</h2>
      </div>

      {/* Podium Top 3 */}
      {top3.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">Podium</h3>
          <div className="grid grid-cols-3 gap-4">
            {top3.map((b: any, i: number) => (
              <div key={b.id} className="text-center p-4 rounded-xl border-2 border-primary/20 bg-primary/5">
                <div className="text-3xl mb-2">{MEDALS[i]}</div>
                <p className="font-bold text-sm">{b.eleve.prenom} {b.eleve.nom}</p>
                <p className="text-xs text-gray-500">{b.eleve.classe?.nom ?? "—"}</p>
                <p className="text-xl font-bold text-primary mt-2">{b.moyenneGenerale?.toFixed(2)}/20</p>
                {b.decision && <Badge className="mt-1 text-xs">{b.decision}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tableau complet */}
      {reste.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Classement complet</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-2 border border-gray-200">Rang</th>
                <th className="text-left p-2 border border-gray-200">Élève</th>
                <th className="text-left p-2 border border-gray-200">Classe</th>
                <th className="text-left p-2 border border-gray-200">Période</th>
                <th className="text-right p-2 border border-gray-200">Moyenne</th>
                <th className="text-left p-2 border border-gray-200">Décision</th>
              </tr>
            </thead>
            <tbody>
              {reste.map((b: any, i: number) => (
                <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="p-2 border border-gray-200 text-center font-bold text-gray-500">{i + 4}</td>
                  <td className="p-2 border border-gray-200 font-medium">{b.eleve.prenom} {b.eleve.nom}</td>
                  <td className="p-2 border border-gray-200 text-gray-500">{b.eleve.classe?.nom ?? "—"}</td>
                  <td className="p-2 border border-gray-200 text-gray-500">{b.periode?.nom}</td>
                  <td className={cn(
                    "p-2 border border-gray-200 text-right font-bold",
                    (b.moyenneGenerale ?? 0) >= 14 ? "text-green-600" :
                    (b.moyenneGenerale ?? 0) >= 10 ? "text-blue-600" : "text-red-600"
                  )}>
                    {b.moyenneGenerale?.toFixed(2)}
                  </td>
                  <td className="p-2 border border-gray-200 text-gray-500">{b.decision ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-8 text-center">
        Document généré le {new Date().toLocaleDateString("fr-FR")} · EcolPro
      </p>
    </div>
  );
}

// ─── Rendu rapport Statistiques ───────────────────────────────────────────────

function StatistiquesReport({ data, tenant }: { data: any; tenant: any }) {
  const tauxReussite = data.totalNotes > 0
    ? Math.round(((data.moyenneGenerale ?? 0) / 20) * 100)
    : 0;

  return (
    <div className="p-8 bg-white text-gray-900" id="rapport-content">
      <div className="text-center border-b-2 border-gray-800 pb-6 mb-8">
        <h1 className="text-2xl font-bold uppercase">{tenant?.name}</h1>
        <p className="text-gray-500 text-sm mt-1">{tenant?.city} · Année {tenant?.currentYear}</p>
        <h2 className="text-xl font-bold mt-4">📊 RAPPORT STATISTIQUE ANNUEL</h2>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {[
          { label: "Élèves inscrits", value: data.totalEleves, icon: <Users className="w-5 h-5" />, color: "text-blue-600" },
          { label: "Enseignants", value: data.totalEnseignants, icon: <GraduationCap className="w-5 h-5" />, color: "text-green-600" },
          { label: "Classes", value: data.totalClasses, icon: <BookOpen className="w-5 h-5" />, color: "text-purple-600" },
          { label: "Notes saisies", value: data.totalNotes, icon: <FileText className="w-5 h-5" />, color: "text-orange-600" },
        ].map((s) => (
          <div key={s.label} className="border rounded-xl p-5 flex items-center gap-4">
            <div className={cn("w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center", s.color)}>
              {s.icon}
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{s.value}</p>
              <p className="text-sm text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border rounded-xl p-5 mb-6">
        <h3 className="font-bold text-gray-700 mb-3">Résultats académiques</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-4xl font-bold text-primary">
              {data.moyenneGenerale?.toFixed(2) ?? "N/A"}/20
            </p>
            <p className="text-sm text-gray-500 mt-1">Moyenne générale tous niveaux</p>
          </div>
          <div className="text-right">
            <div className="w-24 h-24 rounded-full border-8 border-primary/20 flex items-center justify-center">
              <span className="text-xl font-bold text-primary">{tauxReussite}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Indice de réussite</p>
          </div>
        </div>
      </div>

      <div className="border rounded-xl p-5">
        <h3 className="font-bold text-gray-700 mb-3">Absences</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{data.absences?.JUSTIFIEE ?? 0}</p>
            <p className="text-xs text-green-700 mt-1">Justifiées</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{data.absences?.INJUSTIFIEE ?? 0}</p>
            <p className="text-xs text-red-700 mt-1">Injustifiées</p>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-600">{data.absences?.EN_ATTENTE ?? 0}</p>
            <p className="text-xs text-yellow-700 mt-1">En attente</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-8 text-center">
        Document généré le {new Date().toLocaleDateString("fr-FR")} · EcolPro
      </p>
    </div>
  );
}

// ─── Rendu rapport Inspection ─────────────────────────────────────────────────

function InspectionReport({ data, tenant }: { data: any; tenant: any }) {
  return (
    <div className="p-8 bg-white text-gray-900" id="rapport-content">
      <div className="text-center border-b-2 border-gray-800 pb-6 mb-8">
        <h1 className="text-2xl font-bold uppercase">{tenant?.name}</h1>
        <p className="text-gray-500 text-sm mt-1">{tenant?.city} · Année {tenant?.currentYear}</p>
        <h2 className="text-xl font-bold mt-4">📋 RAPPORT D'INSPECTION</h2>
        <p className="text-xs text-gray-400 mt-2">Confidentiel — Usage administratif</p>
      </div>

      {/* Classes */}
      <section className="mb-8">
        <h3 className="font-bold text-gray-800 border-b border-gray-300 pb-2 mb-4 uppercase text-sm tracking-wide">
          I. Structure pédagogique — Classes
        </h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-2 border border-gray-200">Classe</th>
              <th className="text-left p-2 border border-gray-200">Niveau</th>
              <th className="text-left p-2 border border-gray-200">Filière</th>
              <th className="text-right p-2 border border-gray-200">Effectif</th>
              <th className="text-right p-2 border border-gray-200">Capacité</th>
            </tr>
          </thead>
          <tbody>
            {data.classes?.map((c: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="p-2 border border-gray-200 font-medium">{c.nom}</td>
                <td className="p-2 border border-gray-200 text-gray-500">{c.niveau}</td>
                <td className="p-2 border border-gray-200 text-gray-500">{c.filiere ?? "—"}</td>
                <td className="p-2 border border-gray-200 text-right font-bold">{c._count?.eleves ?? 0}</td>
                <td className="p-2 border border-gray-200 text-right text-gray-500">{c.effectifMax}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Corps enseignant */}
      <section className="mb-8">
        <h3 className="font-bold text-gray-800 border-b border-gray-300 pb-2 mb-4 uppercase text-sm tracking-wide">
          II. Corps enseignant
        </h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-2 border border-gray-200">Nom</th>
              <th className="text-left p-2 border border-gray-200">Spécialité</th>
              <th className="text-left p-2 border border-gray-200">Type contrat</th>
            </tr>
          </thead>
          <tbody>
            {data.enseignants?.map((e: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="p-2 border border-gray-200 font-medium">{e.user?.name}</td>
                <td className="p-2 border border-gray-200 text-gray-500">{e.specialite ?? "—"}</td>
                <td className="p-2 border border-gray-200 text-gray-500">{e.typeContrat ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Matières */}
      <section>
        <h3 className="font-bold text-gray-800 border-b border-gray-300 pb-2 mb-4 uppercase text-sm tracking-wide">
          III. Matières enseignées
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {data.matieres?.map((m: any, i: number) => (
            <div key={i} className="border rounded-lg p-2 text-sm">
              <p className="font-medium">{m.nom}</p>
              <p className="text-xs text-gray-400">Coeff. {m.coefficient}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-gray-400 mt-8 text-center">
        Document généré le {new Date().toLocaleDateString("fr-FR")} · EcolPro
      </p>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function RapportsView() {
  const [selected, setSelected] = useState<TypeRapport | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async (type: TypeRapport) => {
    setLoading(true);
    setSelected(type);
    setReportData(null);
    try {
      const res = await fetch(`/api/rapports?type=${type}`);
      const json = await res.json();
      setReportData(json);
    } catch {
      toast.error("Erreur lors de la génération du rapport");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* CSS print - masque tout sauf le rapport */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #rapport-print-container { display: block !important; }
          #rapport-print-container > * { display: block !important; }
        }
      `}</style>

      {/* Sélection du type de rapport */}
      {!selected && (
        <div>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Rapports officiels</h2>
            <p className="text-sm text-gray-500">Générez des rapports PDF pour l'administration, les inspections et les archives</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {RAPPORTS.map((r) => (
              <Card
                key={r.type}
                className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() => handleGenerate(r.type)}
              >
                <CardContent className="p-6">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4", r.color)}>
                    {r.icon}
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-primary transition-colors">
                    {r.titre}
                  </h3>
                  <p className="text-sm text-gray-500">{r.desc}</p>
                  <Button className="w-full mt-4 gap-2" variant="outline" size="sm">
                    <FileText className="w-4 h-4" /> Générer
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Aperçu du rapport */}
      {selected && (
        <div>
          {/* Actions */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => { setSelected(null); setReportData(null); }}>
                ← Retour
              </Button>
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {RAPPORTS.find((r) => r.type === selected)?.titre}
              </h2>
            </div>
            {reportData && (
              <div className="flex gap-2">
                <Button onClick={handlePrint} className="gap-2">
                  <Printer className="w-4 h-4" /> Imprimer / PDF
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => handleGenerate(selected)}>
                  <FileText className="w-4 h-4" /> Régénérer
                </Button>
              </div>
            )}
          </div>

          {/* Contenu rapport */}
          <div id="rapport-print-container">
            {loading && (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-20 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Génération du rapport en cours…</p>
                </CardContent>
              </Card>
            )}

            {!loading && reportData && (
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <div ref={printRef}>
                    {selected === "palmares" && (
                      <PalmaresReport data={reportData.data} tenant={reportData.tenant} />
                    )}
                    {selected === "statistiques" && (
                      <StatistiquesReport data={reportData.data} tenant={reportData.tenant} />
                    )}
                    {selected === "inspection" && (
                      <InspectionReport data={reportData.data} tenant={reportData.tenant} />
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
