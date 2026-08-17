"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CalendarX, Plane, Plus, Check, X, Clock, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface AbsencePersonnelItem {
  id: string;
  date: Date;
  heureDebut: string | null;
  heureFin: string | null;
  type: string;
  statut: string;
  motif: string | null;
  commentaire: string | null;
  enseignant: { id: string; user: { name: string } };
  saisiePar: { name: string } | null;
}

interface CongePersonnelItem {
  id: string;
  type: string;
  statut: string;
  dateDebut: Date;
  dateFin: Date;
  nbJours: number;
  motif: string | null;
  enseignant: { id: string; user: { name: string } };
  demandePar: { name: string } | null;
  approuvePar: { name: string } | null;
}

interface EnseignantOption {
  id: string;
  user: { name: string };
}

interface PersonnelAbsencesCongesProps {
  absences: AbsencePersonnelItem[];
  conges: CongePersonnelItem[];
  enseignants: EnseignantOption[];
}

const TYPE_ABSENCE_CONFIG: Record<string, { color: string }> = {
  ABSENCE: { color: "bg-red-50 text-red-700 border-red-200" },
  RETARD: { color: "bg-orange-50 text-orange-700 border-orange-200" },
  MISSION: { color: "bg-blue-50 text-blue-700 border-blue-200" },
  FORMATION: { color: "bg-purple-50 text-purple-700 border-purple-200" },
  MALADIE: { color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  AUTRE: { color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const STATUT_CONGE_CONFIG: Record<string, { color: string; labelKey: string }> = {
  DEMANDE: { color: "bg-orange-50 text-orange-700 border-orange-200", labelKey: "congeStatusDemande" },
  APPROUVE: { color: "bg-green-50 text-green-700 border-green-200", labelKey: "congeStatusApprouve" },
  REFUSE: { color: "bg-red-50 text-red-700 border-red-200", labelKey: "congeStatusRefuse" },
  EN_COURS: { color: "bg-blue-50 text-blue-700 border-blue-200", labelKey: "congeStatusEnCours" },
  TERMINE: { color: "bg-gray-100 text-gray-600 border-gray-200", labelKey: "congeStatusTermine" },
  ANNULE: { color: "bg-gray-100 text-gray-500 border-gray-200", labelKey: "congeStatusAnnule" },
};

export function PersonnelAbsencesConges({
  absences: initialAbsences,
  conges: initialConges,
  enseignants,
}: PersonnelAbsencesCongesProps) {
  const t = useTranslations("rh");
  const [absences, setAbsences] = useState(initialAbsences);
  const [conges, setConges] = useState(initialConges);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [showCongeForm, setShowCongeForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [absenceForm, setAbsenceForm] = useState({
    enseignantId: "",
    date: new Date().toISOString().split("T")[0],
    heureDebut: "",
    heureFin: "",
    type: "ABSENCE",
    motif: "",
  });

  const [congeForm, setCongeForm] = useState({
    enseignantId: "",
    type: "ANNUEL",
    dateDebut: new Date().toISOString().split("T")[0],
    dateFin: new Date().toISOString().split("T")[0],
    nbJours: 1,
    motif: "",
  });

  async function submitAbsence(e: React.FormEvent) {
    e.preventDefault();
    if (!absenceForm.enseignantId) {
      toast.error(t("selectTeacher"));
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/rh/absences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(absenceForm),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setAbsences([data.absence, ...absences]);
        setShowAbsenceForm(false);
        setAbsenceForm({
          enseignantId: "",
          date: new Date().toISOString().split("T")[0],
          heureDebut: "",
          heureFin: "",
          type: "ABSENCE",
          motif: "",
        });
        toast.success(t("absenceAdded"));
      } catch {
        toast.error(t("absenceError"));
      }
    });
  }

  async function submitConge(e: React.FormEvent) {
    e.preventDefault();
    if (!congeForm.enseignantId) {
      toast.error(t("selectTeacher"));
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/rh/conges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(congeForm),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConges([data.conge, ...conges]);
        setShowCongeForm(false);
        setCongeForm({
          enseignantId: "",
          type: "ANNUEL",
          dateDebut: new Date().toISOString().split("T")[0],
          dateFin: new Date().toISOString().split("T")[0],
          nbJours: 1,
          motif: "",
        });
        toast.success(t("congeAdded"));
      } catch {
        toast.error(t("congeError"));
      }
    });
  }

  async function updateCongeStatut(id: string, action: "APPROUVE" | "REFUSE" | "ANNULE") {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/rh/conges/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConges(conges.map((c) => (c.id === id ? { ...c, statut: data.conge.statut } : c)));
        toast.success(t(`conge${action === "APPROUVE" ? "Approved" : action === "REFUSE" ? "Refused" : "Cancelled"}`));
      } catch {
        toast.error(t("congeError"));
      }
    });
  }

  async function updateAbsenceStatut(id: string, statut: "JUSTIFIEE" | "INJUSTIFIEE") {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/rh/absences/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setAbsences(absences.map((a) => (a.id === id ? { ...a, statut: data.absence.statut } : a)));
        toast.success(t(`absence${statut === "JUSTIFIEE" ? "Justified" : "Unjustified"}`));
      } catch {
        toast.error(t("absenceError"));
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Onglets visuels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section Absences */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarX className="h-4 w-4 text-red-500" />
              {t("staffAbsences")}
              <Badge variant="secondary" className="text-xs">{absences.length}</Badge>
            </h3>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAbsenceForm(!showAbsenceForm)}>
              <Plus className="h-3.5 w-3.5" />
              {t("addAbsence")}
            </Button>
          </div>

          {showAbsenceForm && (
            <Card>
              <CardContent className="pt-4">
                <form onSubmit={submitAbsence} className="space-y-3">
                  <div>
                    <Label className="text-xs">{t("teacher")}</Label>
                    <select
                      value={absenceForm.enseignantId}
                      onChange={(e) => setAbsenceForm({ ...absenceForm, enseignantId: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t("selectTeacher")}</option>
                      {enseignants.map((en) => (
                        <option key={en.id} value={en.id}>{en.user.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">{t("date")}</Label>
                      <Input type="date" value={absenceForm.date} onChange={(e) => setAbsenceForm({ ...absenceForm, date: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("type")}</Label>
                      <select
                        value={absenceForm.type}
                        onChange={(e) => setAbsenceForm({ ...absenceForm, type: e.target.value })}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="ABSENCE">{t("typeAbsence")}</option>
                        <option value="RETARD">{t("typeRetard")}</option>
                        <option value="MISSION">{t("typeMission")}</option>
                        <option value="FORMATION">{t("typeFormation")}</option>
                        <option value="MALADIE">{t("typeMaladie")}</option>
                        <option value="AUTRE">{t("typeAutre")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">{t("startTime")}</Label>
                      <Input type="time" value={absenceForm.heureDebut} onChange={(e) => setAbsenceForm({ ...absenceForm, heureDebut: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("endTime")}</Label>
                      <Input type="time" value={absenceForm.heureFin} onChange={(e) => setAbsenceForm({ ...absenceForm, heureFin: e.target.value })} className="h-9" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">{t("motif")}</Label>
                    <Input value={absenceForm.motif} onChange={(e) => setAbsenceForm({ ...absenceForm, motif: e.target.value })} className="h-9" placeholder={t("motifPlaceholder")} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={isPending} className="gap-1">
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {t("validate")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowAbsenceForm(false)}>
                      {t("cancel")}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {absences.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{t("noAbsences")}</CardContent></Card>
            ) : (
              absences.slice(0, 15).map((a) => {
                const cfg = TYPE_ABSENCE_CONFIG[a.type] ?? TYPE_ABSENCE_CONFIG.AUTRE;
                return (
                  <Card key={a.id} className="border-0 shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{a.enseignant.user.name}</span>
                            <Badge className={cn("text-xs", cfg.color)}>{t(`type${a.type.charAt(0)}${a.type.slice(1).toLowerCase()}`)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(a.date).toLocaleDateString("fr-FR")}
                            {a.heureDebut && ` · ${a.heureDebut}${a.heureFin ? `–${a.heureFin}` : ""}`}
                          </p>
                          {a.motif && <p className="text-xs text-muted-foreground mt-0.5">{a.motif}</p>}
                          {a.saisiePar && <p className="text-xs text-gray-400 mt-0.5">{t("recordedBy")}: {a.saisiePar.name}</p>}
                        </div>
                        <div className="flex gap-1">
                          {a.statut === "EN_ATTENTE" && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600" onClick={() => updateAbsenceStatut(a.id, "JUSTIFIEE")}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => updateAbsenceStatut(a.id, "INJUSTIFIEE")}>
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {a.statut !== "EN_ATTENTE" && (
                            <Badge className={cn("text-xs", a.statut === "JUSTIFIEE" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>
                              {a.statut === "JUSTIFIEE" ? t("justified") : t("unjustified")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Section Congés */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Plane className="h-4 w-4 text-blue-500" />
              {t("staffLeaves")}
              <Badge variant="secondary" className="text-xs">{conges.length}</Badge>
            </h3>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowCongeForm(!showCongeForm)}>
              <Plus className="h-3.5 w-3.5" />
              {t("addLeave")}
            </Button>
          </div>

          {showCongeForm && (
            <Card>
              <CardContent className="pt-4">
                <form onSubmit={submitConge} className="space-y-3">
                  <div>
                    <Label className="text-xs">{t("teacher")}</Label>
                    <select
                      value={congeForm.enseignantId}
                      onChange={(e) => setCongeForm({ ...congeForm, enseignantId: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{t("selectTeacher")}</option>
                      {enseignants.map((en) => (
                        <option key={en.id} value={en.id}>{en.user.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">{t("leaveType")}</Label>
                      <select
                        value={congeForm.type}
                        onChange={(e) => setCongeForm({ ...congeForm, type: e.target.value })}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="ANNUEL">{t("congeAnnuel")}</option>
                        <option value="MALADIE">{t("congeMaladie")}</option>
                        <option value="SPECIAL">{t("congeSpecial")}</option>
                        <option value="MATERNITE">{t("congeMaternite")}</option>
                        <option value="PATERNITE">{t("congePaternite")}</option>
                        <option value="SANS_SOLDE">{t("congeSansSolde")}</option>
                        <option value="AUTRE">{t("congeAutre")}</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">{t("nbDays")}</Label>
                      <Input type="number" min="0.5" step="0.5" value={congeForm.nbJours} onChange={(e) => setCongeForm({ ...congeForm, nbJours: parseFloat(e.target.value) || 1 })} className="h-9" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">{t("startDate")}</Label>
                      <Input type="date" value={congeForm.dateDebut} onChange={(e) => setCongeForm({ ...congeForm, dateDebut: e.target.value })} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("endDate")}</Label>
                      <Input type="date" value={congeForm.dateFin} onChange={(e) => setCongeForm({ ...congeForm, dateFin: e.target.value })} className="h-9" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">{t("motif")}</Label>
                    <Input value={congeForm.motif} onChange={(e) => setCongeForm({ ...congeForm, motif: e.target.value })} className="h-9" placeholder={t("motifPlaceholder")} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={isPending} className="gap-1">
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {t("validate")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowCongeForm(false)}>
                      {t("cancel")}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {conges.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{t("noLeaves")}</CardContent></Card>
            ) : (
              conges.slice(0, 15).map((c) => {
                const cfg = STATUT_CONGE_CONFIG[c.statut] ?? STATUT_CONGE_CONFIG.DEMANDE;
                return (
                  <Card key={c.id} className="border-0 shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{c.enseignant.user.name}</span>
                            <Badge className={cn("text-xs", cfg.color)}>{t(cfg.labelKey)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {new Date(c.dateDebut).toLocaleDateString("fr-FR")} → {new Date(c.dateFin).toLocaleDateString("fr-FR")}
                            <span className="ml-1">· {c.nbJours} {t("days")}</span>
                          </p>
                          {c.motif && <p className="text-xs text-muted-foreground mt-0.5">{c.motif}</p>}
                          {c.approuvePar && <p className="text-xs text-gray-400 mt-0.5">{t("approvedBy")}: {c.approuvePar.name}</p>}
                        </div>
                        {c.statut === "DEMANDE" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600" onClick={() => updateCongeStatut(c.id, "APPROUVE")}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => updateCongeStatut(c.id, "REFUSE")}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
