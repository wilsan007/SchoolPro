"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompetencesEleve } from "@/components/learnos/CompetencesEleve";
import { EvolutionEleve } from "@/components/learnos/EvolutionEleve";
import { getInitials, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Edit, User, Phone, MapPin, BookOpen,
  CalendarX, AlertTriangle, CreditCard, TrendingUp,
  Clock, CheckCircle2, XCircle, AlertCircle, ShieldOff, Lock, Target,
  Trash2, Loader2, Plus, Banknote, FileText, LineChart, Brain,
} from "lucide-react";
import { DispenseMatiereManager } from "./DispenseMatiereManager";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import { deleteEleve } from "@/lib/actions/eleve";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Note {
  id: string;
  valeur: number;
  noteMax: number;
  coefficient: number;
  intitule: string | null;
  type: string;
  date: Date;
  matiere: { nom: string; code: string; couleur: string | null; coefficient: number };
  periode: { nom: string; numero: number } | null;
}

interface Absence {
  id: string;
  date: Date;
  heureDebut: string | null;
  heureFin: string | null;
  isRetard: boolean;
  motif: string;
  statut: string;
  commentaire: string | null;
}

interface Incident {
  id: string;
  type: string;
  statut: string;
  gravite: number;
  description: string;
  lieu: string | null;
  date: Date;
  sanctions: Array<{ id: string; type: string; description: string | null; dateDebut: Date }>;
}

interface Facture {
  id: string;
  numero: string;
  libelle: string;
  montant: number;
  devise: string;
  statut: string;
  echeance: Date | null;
  paiements: Array<{ id: string; montant: number; methode: string; date: Date }>;
}

interface ParcoursScolaire {
  id: string;
  annee: string;
  classe: string;
  niveau: string;
  moyenneAnnuelle: number | null;
  rang: number | null;
  effectif: number | null;
  decision: string | null;
  mention: string | null;
  recommandation: string | null;
}

interface Eleve {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: Date;
  lieuNaissance: string | null;
  nationalite: string | null;
  sexe: string;
  photoUrl: string | null;
  statut: string;
  regime: string | null;
  transport: string | null;
  groupeSanguin: string | null;
  allergies: string | null;
  besoinsSpeciaux: string | null;
  contactUrgenceNom: string | null;
  contactUrgencePhone: string | null;
  anneeInscription: string;
  classe: { id: string; nom: string; niveau: string } | null;
  parents: Array<{
    lien: string;
    isGardien: boolean;
    parent: {
      id: string;
      nom: string;
      prenom: string;
      phone: string;
      phone2: string | null;
      email: string | null;
      profession: string | null;
      adresse: string | null;
    };
  }>;
  notes: Note[];
  absences: Absence[];
  incidents: Incident[];
  factures: Facture[];
  parcours: ParcoursScolaire[];
}

interface MatiereInfo {
  id: string;
  nom: string;
  code: string;
}

interface DispenseInfo {
  id: string;
  matiereId: string;
  matiereNom: string;
  motif: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const statutColors: Record<string, string> = {
  ACTIF: "bg-green-100 text-green-800",
  TRANSFERE: "bg-blue-100 text-blue-800",
  DIPLOME: "bg-purple-100 text-purple-800",
  EXCLU: "bg-red-100 text-red-800",
  ABANDONNE: "bg-yellow-100 text-yellow-800",
};

const absenceStatutIcon: Record<string, React.ReactNode> = {
  JUSTIFIEE: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  INJUSTIFIEE: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  EN_ATTENTE: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
};

const factureStatutColors: Record<string, string> = {
  PAYEE: "bg-green-100 text-green-800",
  EN_ATTENTE: "bg-yellow-100 text-yellow-800",
  EN_RETARD: "bg-red-100 text-red-800",
  ANNULEE: "bg-gray-100 text-gray-500",
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-muted/20 border rounded-xl p-4 flex flex-col gap-1">
      <p className={cn("text-2xl font-bold", color ?? "text-foreground")}>{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function EleveDetailView({
  eleve,
  matieres = [],
  dispenses = [],
  situationFinanciere,
  userRole,
}: {
  eleve: Eleve;
  matieres?: MatiereInfo[];
  dispenses?: DispenseInfo[];
  situationFinanciere?: {
    totalFacture: number;
    totalPaye: number;
    totalRestant: number;
    nbFacturesEnRetard: number;
    nbRelances: number;
    estExclu: boolean;
    exclusionId: string | null;
    exclusionMotif: string | null;
    exclusionDateDebut: Date | null;
  };
  userRole?: string;
}) {
  const t = useTranslations("eleveDetail");
  const libelleNiveau = useLibelleNiveau();
  const router = useRouter();

  // Le comptable ne voit que la facturation et les absences dans le profil élève.
  // Les autres rôles voient tous les onglets.
  const isComptable = userRole === "ACCOUNTANT";
  // `eleves:write` = TENANT_ADMIN, SUPER_ADMIN, PRINCIPAL, SECRETARY.
  // TEACHER n'a que `eleves:read` — il consulte mais n'édite pas.
  const canWrite = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL" || userRole === "SECRETARY";
  const canDelete = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL";
  const visibleTabs = isComptable
    ? ["absences", "facturation"]
    : ["notes", "competences", "absences", "discipline", "facturation", "parcours", "dispenses", "evolution"];

  const [tab, setTab] = useState(isComptable ? "facturation" : "notes");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const tuteur = eleve.parents.find((p) => p.isGardien) ?? eleve.parents[0];

  // Compute average per subject from notes
  const notesByMatiere = eleve.notes.reduce<Record<string, { notes: Note[]; nom: string; code: string; couleur: string | null; coeff: number }>>((acc, n) => {
    const key = n.matiere.code;
    if (!acc[key]) acc[key] = { notes: [], nom: n.matiere.nom, code: n.matiere.code, couleur: n.matiere.couleur, coeff: n.matiere.coefficient };
    acc[key].notes.push(n);
    return acc;
  }, {});

  const moyenneGenerale =
    eleve.notes.length > 0
      ? (
          eleve.notes.reduce((sum, n) => sum + (n.valeur / n.noteMax) * 20 * n.coefficient, 0) /
          eleve.notes.reduce((sum, n) => sum + n.coefficient, 0)
        ).toFixed(2)
      : null;

  const totalAbsences = eleve.absences.filter((a) => !a.isRetard).length;
  const totalRetards = eleve.absences.filter((a) => a.isRetard).length;
  const totalDu = eleve.factures.reduce((s, f) => s + f.montant, 0);
  const totalPaye = eleve.factures.reduce(
    (s, f) => s + f.paiements.reduce((ps, p) => ps + p.montant, 0),
    0
  );

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteEleve(eleve.id);
      toast.success(t("studentDeleted"));
      router.push("/eleves");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteError"));
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back + Edit + Delete */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/eleves">
            <ArrowLeft className="h-4 w-4" />
            {t("backToList")}
          </Link>
        </Button>
        {!isComptable && (
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href={`/eleves/${eleve.id}/modifier`}>
                  <Edit className="h-4 w-4" />
                  {t("editProfile")}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={`/dossier-progression/${eleve.id}`}>
                <Brain className="h-4 w-4" />
                {t("dossierProgression")}
              </Link>
            </Button>
            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t("deleteStudent")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-destructive">{t("deleteConfirmTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("deleteConfirmDescription", { name: `${eleve.prenom} ${eleve.nom}` })}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("deleteSoftNote")}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                {t("deleteCancel")}
              </Button>
              <Button variant="destructive" size="sm" className="gap-2" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("deleteConfirm")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile card */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          <Avatar className="h-20 w-20 flex-shrink-0">
            {eleve.photoUrl && <AvatarImage src={eleve.photoUrl} />}
            <AvatarFallback
              className={cn(
                "text-xl font-bold",
                eleve.sexe === "F"
                  ? "bg-pink-100 text-pink-700"
                  : "bg-blue-100 text-blue-700"
              )}
            >
              {getInitials(`${eleve.prenom} ${eleve.nom}`)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold">
                {eleve.prenom} {eleve.nom}
              </h2>
              <span
                className={cn(
                  "text-xs font-semibold px-2.5 py-1 rounded-full",
                  statutColors[eleve.statut] ?? "bg-gray-100 text-gray-600"
                )}
              >
                {t.has(`statut${eleve.statut}`) ? t(`statut${eleve.statut}`) : eleve.statut}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
              <InfoRow label={t("matricule")} value={eleve.matricule} />
              <InfoRow label={t("class")} value={eleve.classe?.nom ?? t("notAssigned")} />
              <InfoRow label={t("level")} value={eleve.classe?.niveau ? libelleNiveau(eleve.classe.niveau) : undefined} />
              <InfoRow label={t("regime")} value={eleve.regime ?? t("external")} />
              <InfoRow label={t("birthDate")} value={formatDate(eleve.dateNaissance)} />
              <InfoRow label={t("placeOfBirth")} value={eleve.lieuNaissance} />
              <InfoRow label={t("nationality")} value={eleve.nationalite} />
              <InfoRow label={t("sex")} value={eleve.sexe === "F" ? t("female") : t("male")} />
              <InfoRow label={t("enrollmentYear")} value={eleve.anneeInscription} />
              <InfoRow label={t("transport")} value={eleve.transport} />
              <InfoRow label={t("bloodGroup")} value={eleve.groupeSanguin} />
              {eleve.allergies && <InfoRow label={t("allergies")} value={eleve.allergies} />}
              {eleve.besoinsSpeciaux && <InfoRow label={t("specialNeeds")} value={eleve.besoinsSpeciaux} />}
            </div>
          </div>
        </div>
      </Card>

      {/* KPI strip — le comptable ne voit que les absences et le solde dû */}
      <div className={cn("grid gap-4", isComptable ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
        {!isComptable && (
          <StatCard
            label={t("generalAverage")}
            value={moyenneGenerale ? `${moyenneGenerale}/20` : "—"}
            sub={t("notesCount", { count: eleve.notes.length })}
            color={
              moyenneGenerale
                ? parseFloat(moyenneGenerale) >= 14
                  ? "text-green-600"
                  : parseFloat(moyenneGenerale) >= 10
                  ? "text-blue-600"
                  : "text-red-600"
                : undefined
            }
          />
        )}
        <StatCard label={t("absences")} value={totalAbsences} sub={t("latesCount", { count: totalRetards })} color="text-orange-600" />
        {!isComptable && (
          <StatCard label={t("incidents")} value={eleve.incidents.length} color={eleve.incidents.length > 0 ? "text-red-600" : "text-green-600"} />
        )}
        <StatCard
          label={t("balanceDue")}
          value={`${(totalDu - totalPaye).toLocaleString()} FDJ`}
          sub={`${t("paid")}: ${totalPaye.toLocaleString()} FDJ`}
          color={totalDu - totalPaye > 0 ? "text-red-600" : "text-green-600"}
        />
      </div>

      {/* Parent / tuteur */}
      {tuteur && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            {t("legalGuardian")}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
            <InfoRow
              label={t("fullName")}
              value={`${tuteur.parent.prenom} ${tuteur.parent.nom}`}
            />
            <InfoRow label={t("relationship")} value={tuteur.lien} />
            <InfoRow label={t("phone")} value={tuteur.parent.phone} />
            {tuteur.parent.phone2 && <InfoRow label={t("secondaryPhone")} value={tuteur.parent.phone2} />}
            <InfoRow label={t("email")} value={tuteur.parent.email} />
            <InfoRow label={t("profession")} value={tuteur.parent.profession} />
            <InfoRow label={t("address")} value={tuteur.parent.adresse} />
          </div>
          {(eleve.contactUrgenceNom || eleve.contactUrgencePhone) && (
            <div className="mt-4 pt-4 border-t flex gap-6">
              <InfoRow label={t("emergencyContact")} value={eleve.contactUrgenceNom} />
              <InfoRow label={t("emergencyPhone")} value={eleve.contactUrgencePhone} />
            </div>
          )}
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          {visibleTabs.includes("notes") && (
            <TabsTrigger value="notes" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {t("tabNotes")}
            </TabsTrigger>
          )}
          {visibleTabs.includes("competences") && (
            <TabsTrigger value="competences" className="gap-1.5">
              <Target className="h-3.5 w-3.5" />
              Compétences
            </TabsTrigger>
          )}
          {visibleTabs.includes("absences") && (
            <TabsTrigger value="absences" className="gap-1.5">
              <CalendarX className="h-3.5 w-3.5" />
              {t("tabAbsences")}
            </TabsTrigger>
          )}
          {visibleTabs.includes("discipline") && (
            <TabsTrigger value="discipline" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("tabDiscipline")}
            </TabsTrigger>
          )}
          {visibleTabs.includes("facturation") && (
            <TabsTrigger value="facturation" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              {t("tabBilling")}
            </TabsTrigger>
          )}
          {visibleTabs.includes("parcours") && (
            <TabsTrigger value="parcours" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              {t("tabParcours")}
            </TabsTrigger>
          )}
          {visibleTabs.includes("dispenses") && (
            <TabsTrigger value="dispenses" className="gap-1.5">
              <ShieldOff className="h-3.5 w-3.5" />
              {t("tabDispenses")}
            </TabsTrigger>
          )}
          {visibleTabs.includes("evolution") && (
            <TabsTrigger value="evolution" className="gap-1.5">
              <LineChart className="h-3.5 w-3.5" />
              {t("tabEvolution")}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─ Compétences (LEARNOS) ─ */}
        <TabsContent value="competences" className="mt-4">
          <CompetencesEleve eleveId={eleve.id} />
        </TabsContent>

        {/* ─ Évolution annuelle (LEARNOS) ─ */}
        <TabsContent value="evolution" className="mt-4">
          <EvolutionEleve eleveId={eleve.id} />
        </TabsContent>

        {/* ─ Notes ─ */}
        <TabsContent value="notes" className="mt-4">
          {Object.keys(notesByMatiere).length === 0 ? (
            <EmptyState message={t("noNotes")} />
          ) : (
            <div className="space-y-4">
              {Object.values(notesByMatiere).map((m) => {
                const avg = (
                  m.notes.reduce((s, n) => s + (n.valeur / n.noteMax) * 20 * n.coefficient, 0) /
                  m.notes.reduce((s, n) => s + n.coefficient, 0)
                ).toFixed(2);
                return (
                  <Card key={m.code} className="overflow-hidden">
                    <div
                      className="flex items-center justify-between px-4 py-3 border-b"
                      style={{ borderLeftColor: m.couleur ?? "#6366f1", borderLeftWidth: 4 }}
                    >
                      <div>
                        <span className="font-semibold">{m.nom}</span>
                        <span className="ml-2 text-xs text-muted-foreground font-mono">{m.code}</span>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          parseFloat(avg) >= 14
                            ? "text-green-600"
                            : parseFloat(avg) >= 10
                            ? "text-blue-600"
                            : "text-red-600"
                        )}
                      >
                        {t("avgShort", { avg })}
                      </span>
                    </div>
                    <div className="divide-y">
                      {m.notes.map((n) => (
                        <div key={n.id} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/30">
                          <div>
                            <span className="font-medium">{n.intitule ?? n.type}</span>
                            {n.periode && (
                              <span className="ml-2 text-xs text-muted-foreground">{n.periode.nom}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{formatDate(n.date)}</span>
                            <span
                              className={cn(
                                "font-bold text-sm",
                                (n.valeur / n.noteMax) * 20 >= 14
                                  ? "text-green-600"
                                  : (n.valeur / n.noteMax) * 20 >= 10
                                  ? "text-blue-600"
                                  : "text-red-600"
                              )}
                            >
                              {n.valeur}/{n.noteMax}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─ Absences ─ */}
        <TabsContent value="absences" className="mt-4">
          {eleve.absences.length === 0 ? (
            <EmptyState message={t("noAbsences")} />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("date")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("schedule")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("type")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("motif")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("status")}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t("note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {eleve.absences.map((a, i) => (
                    <tr key={a.id} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                      <td className="px-4 py-3">{formatDate(a.date)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {a.heureDebut && a.heureFin ? `${a.heureDebut} – ${a.heureFin}` : t("allDay")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", a.isRetard ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-700")}>
                          {a.isRetard ? t("lateBadge") : t("absenceBadge")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.motif}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {absenceStatutIcon[a.statut]}
                          <span className="text-xs">{a.statut.replace("_", " ")}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{a.commentaire ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ─ Discipline ─ */}
        <TabsContent value="discipline" className="mt-4">
          {eleve.incidents.length === 0 ? (
            <EmptyState message={t("noIncidents")} good />
          ) : (
            <div className="space-y-3">
              {eleve.incidents.map((inc) => (
                <Card key={inc.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle
                        className={cn(
                          "h-4 w-4",
                          inc.gravite === 3 ? "text-red-500" : inc.gravite === 2 ? "text-orange-500" : "text-yellow-500"
                        )}
                      />
                      <span className="font-semibold text-sm">{inc.type}</span>
                      {inc.lieu && <span className="text-xs text-muted-foreground">· {inc.lieu}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDate(inc.date)}</span>
                      <span
                        className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full",
                          inc.statut === "RESOLU" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                        )}
                      >
                        {inc.statut}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{inc.description}</p>
                  {inc.sanctions.length > 0 && (
                    <div className="pt-2 border-t flex flex-wrap gap-2">
                      {inc.sanctions.map((s) => (
                        <span key={s.id} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5">
                          {s.type}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─ Facturation ─ */}
        <TabsContent value="facturation" className="mt-4">
          {/* Actions rapides */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button asChild size="sm" variant="default" className="gap-2">
              <Link href={`/facturation/nouvelle?eleveId=${eleve.id}`}>
                <Plus className="h-4 w-4" />
                {t("createInvoice")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link href="/facturation">
                <FileText className="h-4 w-4" />
                {t("viewAllInvoices")}
              </Link>
            </Button>
          </div>

          {/* Situation financière résumé */}
          {situationFinanciere && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">{t("totalBilled")}</p>
                <p className="text-lg font-bold">{situationFinanciere.totalFacture.toLocaleString()} DJF</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">{t("totalPaid")}</p>
                <p className="text-lg font-bold text-green-600">{situationFinanciere.totalPaye.toLocaleString()} DJF</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">{t("remainingToPay")}</p>
                <p className={cn("text-lg font-bold", situationFinanciere.totalRestant > 0 ? "text-red-600" : "text-green-600")}>
                  {situationFinanciere.totalRestant.toLocaleString()} DJF
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">{t("overdue")}</p>
                <p className={cn("text-lg font-bold", situationFinanciere.nbFacturesEnRetard > 0 ? "text-red-600" : "text-green-600")}>
                  {t("invoiceCount", { count: situationFinanciere.nbFacturesEnRetard })}
                </p>
              </Card>
            </div>
          )}

          {/* Alerte exclusion */}
          {situationFinanciere?.estExclu && (
            <Card className="p-4 mb-4 border-red-300 bg-red-50">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-800">{t("studentExcluded")}</p>
                  <p className="text-sm text-red-700">
                    {t("exclusionReason", { motif: situationFinanciere.exclusionMotif ?? "—", date: situationFinanciere.exclusionDateDebut
                      ? new Date(situationFinanciere.exclusionDateDebut).toLocaleDateString("fr-FR")
                      : "N/A" })}
                  </p>
                  <p className="text-xs text-red-600 mt-1">{t("exclusionAccessBlocked")}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Alerte retard + relances */}
          {situationFinanciere && situationFinanciere.nbRelances > 0 && !situationFinanciere.estExclu && (
            <Card className="p-3 mb-4 border-amber-300 bg-amber-50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  {t("relancesSent", { relances: situationFinanciere.nbRelances, retards: situationFinanciere.nbFacturesEnRetard })}
                </p>
              </div>
            </Card>
          )}

          {eleve.factures.length === 0 ? (
            <EmptyState message={t("noInvoices")} />
          ) : (
            <div className="space-y-3">
              {eleve.factures.map((f) => {
                const paye = f.paiements.reduce((s, p) => s + p.montant, 0);
                const restant = f.montant - paye;
                const isPayable = f.statut !== "PAYEE" && f.statut !== "ANNULEE" && restant > 0;
                return (
                  <Card key={f.id} className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <Link href={`/facturation/${f.id}`} className="font-semibold text-sm hover:underline">
                          {f.libelle}
                        </Link>
                        <p className="text-xs text-muted-foreground font-mono">{f.numero}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {f.echeance && (
                          <span className="text-xs text-muted-foreground">{t("dueShort")} {formatDate(f.echeance)}</span>
                        )}
                        <span
                          className={cn(
                            "text-xs font-semibold px-2.5 py-0.5 rounded-full",
                            factureStatutColors[f.statut] ?? "bg-gray-100 text-gray-600"
                          )}
                        >
                          {f.statut.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-6 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">{t("amount")}</p>
                        <p className="font-semibold">{f.montant.toLocaleString()} {f.devise}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("paid")}</p>
                        <p className="font-semibold text-green-600">{paye.toLocaleString()} {f.devise}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("remaining")}</p>
                        <p className={cn("font-semibold", restant > 0 ? "text-red-600" : "text-green-600")}>
                          {restant.toLocaleString()} {f.devise}
                        </p>
                      </div>
                      {isPayable && (
                        <Button asChild size="sm" variant="outline" className="gap-1 ml-auto">
                          <Link href={`/facturation/${f.id}?action=paiement`}>
                            <Banknote className="h-3.5 w-3.5" />
                            {t("collect")}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─ Parcours ─ */}
        <TabsContent value="parcours" className="mt-4">
          {eleve.parcours.length === 0 ? (
            <EmptyState message={t("noParcours")} />
          ) : (
            <div className="space-y-3">
              {eleve.parcours.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-semibold">{p.annee}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.classe} · {libelleNiveau(p.niveau)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {p.moyenneAnnuelle !== null && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{t("average")}</p>
                          <p
                            className={cn(
                              "font-bold",
                              p.moyenneAnnuelle >= 14
                                ? "text-green-600"
                                : p.moyenneAnnuelle >= 10
                                ? "text-blue-600"
                                : "text-red-600"
                            )}
                          >
                            {p.moyenneAnnuelle.toFixed(2)}/20
                          </p>
                        </div>
                      )}
                      {p.rang && p.effectif && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{t("rank")}</p>
                          <p className="font-bold">{p.rang}/{p.effectif}</p>
                        </div>
                      )}
                      {p.decision && (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                          {p.decision}
                        </span>
                      )}
                    </div>
                  </div>
                  {(p.mention || p.recommandation) && (
                    <p className="text-xs text-muted-foreground mt-2">{p.mention}</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─ Dispenses de matière ─ */}
        <TabsContent value="dispenses" className="mt-4">
          <DispenseMatiereManager
            eleve={{ id: eleve.id, nom: eleve.nom, prenom: eleve.prenom, matricule: eleve.matricule }}
            matieres={matieres}
            dispenses={dispenses}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ message, good }: { message: string; good?: boolean }) {
  return (
    <Card className="p-12 text-center">
      <p className={cn("text-muted-foreground", good && "text-green-600")}>{message}</p>
    </Card>
  );
}
