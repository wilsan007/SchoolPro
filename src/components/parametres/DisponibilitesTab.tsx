"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarX, Plus, Trash2, Loader2, Clock, Upload, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

interface Enseignant {
  id: string;
  user: { name: string | null };
  specialite: string | null;
}

interface Disponibilite {
  id: string;
  enseignantId: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  enseignant?: { user: { name: string | null } };
}

interface Indisponibilite {
  id: string;
  enseignantId: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  source: string;
  sourceLibelle: string | null;
  enseignant?: { user: { name: string | null } };
  periode?: { nom: string; numero: number } | null;
}

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"] as const;
const SOURCE_LABELS: Record<string, string> = {
  SAISIE_MANUELLE: "Saisie manuelle",
  IMPORT_EXTERNE: "Import externe",
  CONGE: "Congé",
  FORMATION: "Formation",
};

interface Props {
  canManage: boolean;
}

export function DisponibilitesTab({ canManage }: Props) {
  const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
  const [disponibilites, setDisponibilites] = useState<Disponibilite[]>([]);
  const [indisponibilites, setIndisponibilites] = useState<Indisponibilite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEnseignant, setSelectedEnseignant] = useState<string>("");
  const [mode, setMode] = useState<"disponibilites" | "indisponibilites">("indisponibilites");

  // Formulaire indisponibilité
  const [jour, setJour] = useState<string>("LUNDI");
  const [heureDebut, setHeureDebut] = useState("08:00");
  const [heureFin, setHeureFin] = useState("12:00");
  const [sourceLibelle, setSourceLibelle] = useState("");
  const [saving, setSaving] = useState(false);

  // Import EDT externe
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPlan, setImportPlan] = useState<{ lignes: Array<{ numero: number; action: string; donnees: Record<string, unknown>; message?: string }> } | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dispoRes, indispoRes, rhRes] = await Promise.all([
        fetch("/api/disponibilites"),
        fetch("/api/indisponibilites"),
        fetch("/api/rh").then((r) => (r.ok ? r.json() : { enseignants: [] })).catch(() => ({ enseignants: [] })),
      ]);
      if (dispoRes.ok) setDisponibilites(await dispoRes.json());
      if (indispoRes.ok) setIndisponibilites(await indispoRes.json());
      const rhData = rhRes as { enseignants?: Array<{ id: string; user: { name: string | null }; specialite: string | null }> };
      setEnseignants(rhData.enseignants ?? []);
    } catch {
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addIndisponibilite() {
    if (!selectedEnseignant) { toast.error("Sélectionnez un enseignant"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/indisponibilites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enseignantId: selectedEnseignant,
          jour,
          heureDebut,
          heureFin,
          source: "SAISIE_MANUELLE",
          sourceLibelle: sourceLibelle || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Erreur");
      }
      toast.success("Indisponibilité ajoutée");
      setSourceLibelle("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function deleteIndisponibilite(id: string) {
    try {
      const res = await fetch(`/api/indisponibilites/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Indisponibilité supprimée");
      setIndisponibilites((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  async function deleteDisponibilite(id: string) {
    try {
      const res = await fetch(`/api/disponibilites/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Disponibilité supprimée");
      setDisponibilites((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  async function analyzeImport() {
    if (!importFile) { toast.error("Sélectionnez un fichier"); return; }
    setImporting(true);
    setImportPlan(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/import/edt-externes", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur d'analyse");
      setImportPlan(data);
      if (data.lignesErreurs > 0) {
        toast.warning(`${data.lignesErreurs} ligne(s) en erreur sur ${data.totalLignes}`);
      } else {
        toast.success(`${data.lignesValides} ligne(s) prête(s) à importer`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'analyse");
    } finally {
      setImporting(false);
    }
  }

  async function applyImport() {
    if (!importPlan) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import/edt-externes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: importPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      toast.success(`${data.crees} indisponibilité(s) créée(s), ${data.ignores} ignorée(s)`);
      setShowImport(false);
      setImportPlan(null);
      setImportFile(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setImporting(false);
    }
  }

  const filteredDispos = selectedEnseignant
    ? disponibilites.filter((d) => d.enseignantId === selectedEnseignant)
    : disponibilites;
  const filteredIndispos = selectedEnseignant
    ? indisponibilites.filter((d) => d.enseignantId === selectedEnseignant)
    : indisponibilites;

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header avec toggle mode + bouton import */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            variant={mode === "indisponibilites" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("indisponibilites")}
          >
            <Ban className="h-4 w-4 mr-2" />
            Indisponibilités ({indisponibilites.length})
          </Button>
          <Button
            variant={mode === "disponibilites" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("disponibilites")}
          >
            <Clock className="h-4 w-4 mr-2" />
            Disponibilités ({disponibilites.length})
          </Button>
        </div>
        {canManage && mode === "indisponibilites" && (
          <Button variant="outline" size="sm" onClick={() => setShowImport(!showImport)}>
            <Upload className="h-4 w-4 mr-2" />
            Importer EDT externe
          </Button>
        )}
      </div>

      {/* Import EDT externe */}
      {showImport && canManage && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
          <h4 className="font-semibold text-sm">Import d&apos;emploi du temps externe</h4>
          <p className="text-xs text-muted-foreground">
            Importez le fichier Excel/CSV des cours d&apos;un enseignant dans un autre établissement.
            Chaque ligne deviendra une indisponibilité dans SchoolPro.
            Colonnes attendues: nom, prenom, email, jour, heureDebut, heureFin, etablissement, matiere.
          </p>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportPlan(null); }}
              className="text-sm flex-1"
            />
            <Button size="sm" onClick={analyzeImport} disabled={!importFile || importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyser"}
            </Button>
          </div>
          {importPlan && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {importPlan.lignes?.length ?? 0} ligne(s) — {importPlan.lignes?.filter((l: { action: string }) => l.action === "CREER").length ?? 0} à créer, {importPlan.lignes?.filter((l: { action: string }) => l.action === "ERREUR").length ?? 0} erreur(s)
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border bg-white text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Enseignant</th>
                      <th className="text-left p-2">Jour</th>
                      <th className="text-left p-2">Heures</th>
                      <th className="text-left p-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPlan.lignes?.map((l) => (
                      <tr key={l.numero} className={cn("border-t", l.action === "ERREUR" && "bg-red-50")}>
                        <td className="p-2">{l.numero}</td>
                        <td className="p-2">{String(l.donnees.enseignantNom ?? "")} {String(l.donnees.enseignantPrenom ?? "")}</td>
                        <td className="p-2">{String(l.donnees.jour ?? "")}</td>
                        <td className="p-2">{String(l.donnees.heureDebut ?? "")}–{String(l.donnees.heureFin ?? "")}</td>
                        <td className="p-2">
                          <Badge variant={l.action === "ERREUR" ? "destructive" : "default"} className="text-[10px]">
                            {l.action === "ERREUR" ? (l.message ?? "Erreur") : l.action}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button size="sm" onClick={applyImport} disabled={importing || importPlan.lignes?.every((l: { action: string }) => l.action !== "CREER")}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmer l'import"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Filtre enseignant */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Enseignant:</label>
        <select
          value={selectedEnseignant}
          onChange={(e) => setSelectedEnseignant(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
        >
          <option value="">Tous</option>
          {enseignants.map((e) => (
            <option key={e.id} value={e.id}>{e.user.name ?? "Sans nom"}</option>
          ))}
        </select>
      </div>

      {/* Formulaire ajout indisponibilité */}
      {canManage && mode === "indisponibilites" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Ajouter une indisponibilité
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              value={selectedEnseignant}
              onChange={(e) => setSelectedEnseignant(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm col-span-2"
            >
              <option value="">— Sélectionner —</option>
              {enseignants.map((e) => (
                <option key={e.id} value={e.id}>{e.user.name ?? "Sans nom"}</option>
              ))}
            </select>
            <select value={jour} onChange={(e) => setJour(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
              {JOURS.map((j) => <option key={j} value={j}>{j.charAt(0) + j.slice(1).toLowerCase()}</option>)}
            </select>
            <div className="flex gap-1">
              <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm flex-1" />
              <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm flex-1" />
            </div>
          </div>
          <input
            type="text"
            placeholder="Libellé (ex: École B, Formation, Rendez-vous…)"
            value={sourceLibelle}
            onChange={(e) => setSourceLibelle(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm w-full"
          />
          <Button size="sm" onClick={addIndisponibilite} disabled={saving || !selectedEnseignant}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
          </Button>
        </div>
      )}

      {/* Liste */}
      {mode === "indisponibilites" ? (
        <div className="space-y-2">
          {filteredIndispos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
              <CalendarX className="h-8 w-8 opacity-40" />
              Aucune indisponibilité enregistrée
            </div>
          ) : (
            filteredIndispos.map((ind) => (
              <div key={ind.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <Ban className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {ind.enseignant?.user.name ?? "Enseignant"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ind.jour.charAt(0) + ind.jour.slice(1).toLowerCase()} {ind.heureDebut}–{ind.heureFin}
                      {ind.sourceLibelle && ` · ${ind.sourceLibelle}`}
                      {ind.periode && ` · ${ind.periode.nom}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {SOURCE_LABELS[ind.source] ?? ind.source}
                  </Badge>
                  {canManage && (
                    <Button variant="ghost" size="icon" onClick={() => deleteIndisponibilite(ind.id)} className="h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDispos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Clock className="h-8 w-8 opacity-40" />
              Aucune disponibilité enregistrée — les enseignants sont libres par défaut
            </div>
          ) : (
            filteredDispos.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {d.enseignant?.user.name ?? "Enseignant"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.jour.charAt(0) + d.jour.slice(1).toLowerCase()} {d.heureDebut}–{d.heureFin}
                    </div>
                  </div>
                </div>
                {canManage && (
                  <Button variant="ghost" size="icon" onClick={() => deleteDisponibilite(d.id)} className="h-7 w-7">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
