"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Plus, Trash2, Pencil, Archive, ArchiveRestore,
  ArrowRightLeft, GitMerge, Split, Copy, Download, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  createClasse, deleteClasse, updateClasse, archiveClasse, restoreClasse,
  transferClasse, mergeClasses, splitClasse, duplicateClasse,
  getEnseignantsForClasse, getArchivedClasses,
  type ClasseFormData, type UpdateClasseFormData,
} from "@/lib/actions/parametres";
import { niveauRequiresProfPrincipal } from "@/lib/utils-classe";
import { useTranslations } from "next-intl";
import { StructureManager } from "./StructureManager";

interface ClasseItem {
  id: string;
  nom: string;
  niveau: string;
  filiere: string | null;
  effectifMax: number;
  annee: string;
  siteId?: string | null;
  _count: { eleves: number };
  profPrincipal: { user: { name: string } } | null;
  structure: { id: string; nom: string; type: string } | null;
}

interface StructureOption {
  id: string;
  type: string;
  nom: string;
}

interface SiteItem {
  id: string;
  nom: string;
  code: string | null;
}

interface EnseignantOption {
  id: string;
  user: { name: string };
}

type DeleteStrategy = "archive" | "reassign" | "remove";

export function ClassesTab({ classes, canManage, sites = [] }: { classes: ClasseItem[]; canManage: boolean; sites?: SiteItem[] }) {
  const t = useTranslations("parametres");
  const tStruct = useTranslations("structures");
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [structures, setStructures] = useState<StructureOption[]>([]);
  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);
  const [form, setForm] = useState<ClasseFormData>({
    nom: "", niveau: "", filiere: "", effectifMax: 40, annee: "2025-2026",
    structureId: undefined, profPrincipalId: undefined,
  });
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");

  // États pour les dialogues
  const [editingClasse, setEditingClasse] = useState<ClasseItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClasseItem | null>(null);
  const [deleteStrategy, setDeleteStrategy] = useState<DeleteStrategy>("archive");
  const [reassignTargetId, setReassignTargetId] = useState<string>("");
  const [transferTarget, setTransferTarget] = useState<ClasseItem | null>(null);
  const [transferSiteId, setTransferSiteId] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [archivedClasses, setArchivedClasses] = useState<ClasseItem[]>([]);
  const [mergeTarget, setMergeTarget] = useState<ClasseItem | null>(null);
  const [mergeSelected, setMergeSelected] = useState<string[]>([]);
  const [splitTarget, setSplitTarget] = useState<ClasseItem | null>(null);
  const [splitClasses, setSplitClasses] = useState<{ nom: string; eleveIds: string[] }[]>([]);
  const [splitEleves, setSplitEleves] = useState<{ id: string; nom: string; prenom: string; matricule: string }[]>([]);
  const [duplicateTarget, setDuplicateTarget] = useState<ClasseItem | null>(null);
  const [duplicateAnnee, setDuplicateAnnee] = useState<string>("");
  const [duplicateCopyStudents, setDuplicateCopyStudents] = useState(false);

  const loadStructures = useCallback(() => {
    fetch("/api/structures")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setStructures(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStructures();
    getEnseignantsForClasse().then(setEnseignants).catch(() => {});
  }, [loadStructures]);

  const reloadArchived = useCallback(() => {
    getArchivedClasses().then(setArchivedClasses).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      await createClasse({ ...form, siteId: selectedSiteId || undefined });
      toast.success(t("classCreated"));
      setShowForm(false);
      setForm({ nom: "", niveau: "", filiere: "", effectifMax: 40, annee: "2025-2026", structureId: undefined, profPrincipalId: undefined });
      setSelectedSiteId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingClasse) return;
    setIsPending(true);
    try {
      const data: UpdateClasseFormData = {
        nom: form.nom, niveau: form.niveau, filiere: form.filiere || "",
        effectifMax: form.effectifMax, annee: form.annee,
        structureId: form.structureId, profPrincipalId: form.profPrincipalId,
        siteId: selectedSiteId || undefined,
      };
      await updateClasse(editingClasse.id, data);
      toast.success(t("classUpdated"));
      setEditingClasse(null);
      setForm({ nom: "", niveau: "", filiere: "", effectifMax: 40, annee: "2025-2026", structureId: undefined, profPrincipalId: undefined });
      setSelectedSiteId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsPending(true);
    try {
      await deleteClasse(deleteTarget.id, {
        strategy: deleteStrategy,
        reassignToClasseId: deleteStrategy === "reassign" ? reassignTargetId : undefined,
      });
      toast.success(t("classDeleted"));
      setDeleteTarget(null);
      setDeleteStrategy("archive");
      setReassignTargetId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleArchive(classe: ClasseItem) {
    if (!confirm(t("confirmArchiveClass"))) return;
    try {
      await archiveClasse(classe.id);
      toast.success(t("classArchived"));
      reloadArchived();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  }

  async function handleRestore(classe: ClasseItem) {
    try {
      await restoreClasse(classe.id);
      toast.success(t("classRestored"));
      reloadArchived();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  }

  async function handleTransfer() {
    if (!transferTarget || !transferSiteId) return;
    setIsPending(true);
    try {
      await transferClasse(transferTarget.id, transferSiteId);
      toast.success(t("classTransferred"));
      setTransferTarget(null);
      setTransferSiteId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleMerge() {
    if (!mergeTarget || mergeSelected.length === 0) return;
    setIsPending(true);
    try {
      await mergeClasses(mergeSelected, mergeTarget.id);
      toast.success(t("classesMerged"));
      setMergeTarget(null);
      setMergeSelected([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleSplit() {
    if (!splitTarget || splitClasses.length === 0) return;
    setIsPending(true);
    try {
      await splitClasse(splitTarget.id, splitClasses);
      toast.success(t("classSplit"));
      setSplitTarget(null);
      setSplitClasses([]);
      setSplitEleves([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleDuplicate() {
    if (!duplicateTarget || !duplicateAnnee) return;
    setIsPending(true);
    try {
      await duplicateClasse(duplicateTarget.id, duplicateAnnee, duplicateCopyStudents);
      toast.success(t("classDuplicated"));
      setDuplicateTarget(null);
      setDuplicateAnnee("");
      setDuplicateCopyStudents(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  function handleExport() {
    window.open("/api/parametres/classes/export", "_blank");
  }

  function startEdit(classe: ClasseItem) {
    setEditingClasse(classe);
    setForm({
      nom: classe.nom,
      niveau: classe.niveau,
      filiere: classe.filiere ?? "",
      effectifMax: classe.effectifMax,
      annee: classe.annee,
      structureId: classe.structure?.id,
      profPrincipalId: undefined,
    });
    setSelectedSiteId(classe.siteId ?? "");
  }

  function startSplit(classe: ClasseItem) {
    setSplitTarget(classe);
    setSplitClasses([{ nom: `${classe.nom}-A`, eleveIds: [] }, { nom: `${classe.nom}-B`, eleveIds: [] }]);
    // Charger les élèves de la classe
    fetch(`/api/eleves?classeId=${classe.id}&limit=200`)
      .then((r) => r.json())
      .then((data) => {
        const eleves = (data.eleves ?? data ?? []).map((e: { id: string; nom: string; prenom: string; matricule: string }) => ({
          id: e.id, nom: e.nom, prenom: e.prenom, matricule: e.matricule,
        }));
        setSplitEleves(eleves);
      })
      .catch(() => setSplitEleves([]));
  }

  function toggleSplitEleve(eleveId: string, groupIndex: number) {
    setSplitClasses((prev) => {
      const next = [...prev];
      // Retirer l'élève des autres groupes
      for (let i = 0; i < next.length; i++) {
        next[i] = { ...next[i], eleveIds: next[i].eleveIds.filter((id) => id !== eleveId) };
      }
      // Ajouter au groupe sélectionné
      next[groupIndex] = { ...next[groupIndex], eleveIds: [...next[groupIndex].eleveIds, eleveId] };
      return next;
    });
  }

  const isAdmin = canManage;
  const hasMultipleSites = sites.length > 1;
  const selectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  // Formulaire partagé création/édition
  const renderForm = (isEdit: boolean) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{isEdit ? t("editClass") : t("newClass")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={isEdit ? handleUpdate : handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {hasMultipleSites && (
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="site">{t("site")}<span className="text-destructive ml-1">*</span></Label>
              <select id="site" className={selectClass} value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)} required={!isEdit}>
                <option value="">— {t("selectSite")} —</option>
                {sites.map((s) => (<option key={s.id} value={s.id}>{s.nom}</option>))}
              </select>
            </div>
          )}
          {structures.length > 0 && (
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="structure">{tStruct("title")}</Label>
              <select id="structure" className={selectClass} value={form.structureId ?? ""}
                onChange={(e) => setForm({ ...form, structureId: e.target.value || undefined })}>
                <option value="">{tStruct("noStructure")}</option>
                {structures.map((s) => (<option key={s.id} value={s.id}>{s.nom}</option>))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="nom">{t("className")}</Label>
            <Input id="nom" placeholder={t("classNamePlaceholder")} value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="niveau">{t("level")}</Label>
            <Input id="niveau" placeholder={t("levelPlaceholder")} value={form.niveau}
              onChange={(e) => setForm({ ...form, niveau: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filiere">{t("filiere")}</Label>
            <Input id="filiere" placeholder={t("filierePlaceholder")} value={form.filiere ?? ""}
              onChange={(e) => setForm({ ...form, filiere: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="effectifMax">{t("maxStudents")}</Label>
            <Input id="effectifMax" type="number" min="1" value={form.effectifMax}
              onChange={(e) => setForm({ ...form, effectifMax: parseInt(e.target.value) || 40 })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="profPrincipal">
              {t("colProfPrincipal")}
              {form.niveau && niveauRequiresProfPrincipal(form.niveau) && (<span className="text-destructive ml-1">*</span>)}
            </Label>
            <select id="profPrincipal" className={selectClass} value={form.profPrincipalId ?? ""}
              onChange={(e) => setForm({ ...form, profPrincipalId: e.target.value || undefined })}
              required={!!form.niveau && niveauRequiresProfPrincipal(form.niveau)}>
              <option value="">— {t("selectTeacher")} —</option>
              {enseignants.map((ens) => (<option key={ens.id} value={ens.id}>{ens.user.name}</option>))}
            </select>
            {form.niveau && niveauRequiresProfPrincipal(form.niveau) && (
              <p className="text-xs text-muted-foreground">{t("profPrincipalRequired")}</p>
            )}
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isEdit ? t("save") : t("create")}
            </Button>
            <Button type="button" variant="outline" size="sm"
              onClick={() => { isEdit ? setEditingClasse(null) : setShowForm(false); }}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <StructureManager canManage={canManage} sites={sites} />

      {canManage && (
        <div className="flex justify-end gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {t("exportClasses")}
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            {t("addClass")}
          </Button>
        </div>
      )}

      {showForm && canManage && renderForm(false)}
      {editingClasse && renderForm(true)}

      {/* Dialogue de suppression intelligente */}
      {deleteTarget && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              {t("deleteClassTitle")}: {deleteTarget.nom}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deleteTarget._count.eleves > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("classHasStudents", { count: deleteTarget._count.eleves })}
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-md border hover:bg-muted/30">
                    <input type="radio" name="strategy" value="archive" checked={deleteStrategy === "archive"}
                      onChange={() => setDeleteStrategy("archive")} />
                    <div>
                      <div className="font-medium text-sm">{t("strategyArchive")}</div>
                      <div className="text-xs text-muted-foreground">{t("strategyArchiveDesc")}</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-md border hover:bg-muted/30">
                    <input type="radio" name="strategy" value="reassign" checked={deleteStrategy === "reassign"}
                      onChange={() => setDeleteStrategy("reassign")} />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{t("strategyReassign")}</div>
                      <div className="text-xs text-muted-foreground">{t("strategyReassignDesc")}</div>
                      {deleteStrategy === "reassign" && (
                        <select className={`${selectClass} mt-2`} value={reassignTargetId}
                          onChange={(e) => setReassignTargetId(e.target.value)}>
                          <option value="">— {t("selectTargetClass")} —</option>
                          {classes.filter((c) => c.id !== deleteTarget.id).map((c) => (
                            <option key={c.id} value={c.id}>{c.nom} ({c._count.eleves}/{c.effectifMax})</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-md border hover:bg-muted/30">
                    <input type="radio" name="strategy" value="remove" checked={deleteStrategy === "remove"}
                      onChange={() => setDeleteStrategy("remove")} />
                    <div>
                      <div className="font-medium text-sm">{t("strategyRemove")}</div>
                      <div className="text-xs text-muted-foreground">{t("strategyRemoveDesc")}</div>
                    </div>
                  </label>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("classEmptyConfirm")}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="gap-2" disabled={isPending || (deleteStrategy === "reassign" && !reassignTargetId)}
                onClick={handleDeleteConfirm}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("confirm")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setDeleteTarget(null); setDeleteStrategy("archive"); setReassignTargetId(""); }}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogue de transfert entre sites */}
      {transferTarget && (
        <Card className="border-blue-500/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              {t("transferClassTitle")}: {transferTarget.nom}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {transferTarget._count.eleves > 0 && (
              <p className="text-sm text-amber-600">{t("transferWarning", { count: transferTarget._count.eleves })}</p>
            )}
            <div className="space-y-1.5">
              <Label>{t("transferToSite")}</Label>
              <select className={selectClass} value={transferSiteId} onChange={(e) => setTransferSiteId(e.target.value)}>
                <option value="">— {t("selectSite")} —</option>
                {sites.filter((s) => s.id !== transferTarget.siteId).map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="gap-2" disabled={isPending || !transferSiteId} onClick={handleTransfer}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                {t("transfer")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setTransferTarget(null); setTransferSiteId(""); }}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogue de fusion de classes */}
      {mergeTarget && (
        <Card className="border-purple-500/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <GitMerge className="h-4 w-4" />
              {t("mergeClassesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("targetClass")}</Label>
              <p className="text-sm font-medium">{mergeTarget.nom} ({mergeTarget._count.eleves}/{mergeTarget.effectifMax})</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("sourceClasses")}</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {classes.filter((c) => c.id !== mergeTarget.id && c.niveau === mergeTarget.niveau).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/30 cursor-pointer">
                    <input type="checkbox" checked={mergeSelected.includes(c.id)}
                      onChange={(e) => {
                        if (e.target.checked) setMergeSelected([...mergeSelected, c.id]);
                        else setMergeSelected(mergeSelected.filter((id) => id !== c.id));
                      }} />
                    <span className="text-sm">{c.nom} ({c._count.eleves} {t("colStudents")})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="gap-2" disabled={isPending || mergeSelected.length === 0} onClick={handleMerge}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                {t("merge")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setMergeTarget(null); setMergeSelected([]); }}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogue de scission de classe */}
      {splitTarget && (
        <Card className="border-orange-500/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Split className="h-4 w-4" />
              {t("splitClassTitle")}: {splitTarget.nom}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {splitEleves.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noStudentsToSplit")}</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {splitClasses.map((sc, idx) => (
                    <div key={idx} className="space-y-2 border rounded-md p-3">
                      <div className="flex items-center gap-2">
                        <Input value={sc.nom} onChange={(e) => {
                          const next = [...splitClasses];
                          next[idx] = { ...next[idx], nom: e.target.value };
                          setSplitClasses(next);
                        }} className="text-sm" placeholder={t("newClassName")} />
                        <Badge variant="info">{sc.eleveIds.length}</Badge>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {splitEleves.map((e) => (
                          <label key={e.id} className="flex items-center gap-2 text-xs cursor-pointer p-1 rounded hover:bg-muted/30">
                            <input type="checkbox" checked={sc.eleveIds.includes(e.id)}
                              onChange={() => toggleSplitEleve(e.id, idx)} />
                            <span>{e.prenom} {e.nom}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={() => setSplitClasses([...splitClasses, { nom: `${splitTarget.nom}-${String.fromCharCode(65 + splitClasses.length)}`, eleveIds: [] }])}>
                  <Plus className="h-3 w-3 mr-1" /> {t("addGroup")}
                </Button>
              </>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="gap-2" disabled={isPending || splitClasses.length === 0} onClick={handleSplit}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />}
                {t("split")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setSplitTarget(null); setSplitClasses([]); setSplitEleves([]); }}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogue de duplication de classe */}
      {duplicateTarget && (
        <Card className="border-green-500/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Copy className="h-4 w-4" />
              {t("duplicateClassTitle")}: {duplicateTarget.nom}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dupAnnee">{t("targetYear")}</Label>
              <Input id="dupAnnee" placeholder="2026-2027" value={duplicateAnnee}
                onChange={(e) => setDuplicateAnnee(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={duplicateCopyStudents}
                onChange={(e) => setDuplicateCopyStudents(e.target.checked)} />
              <span className="text-sm">{t("copyStudents")}</span>
            </label>
            <div className="flex gap-2">
              <Button size="sm" className="gap-2" disabled={isPending || !duplicateAnnee} onClick={handleDuplicate}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                {t("duplicate")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setDuplicateTarget(null); setDuplicateAnnee(""); setDuplicateCopyStudents(false); }}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table des classes actives */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">{t("colClass")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colLevel")}</th>
                  <th className="text-left px-4 py-3 font-medium">{tStruct("title")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colFiliere")}</th>
                  <th className="text-right px-4 py-3 font-medium">{t("colStudents")}</th>
                  <th className="text-right px-4 py-3 font-medium">{t("colMax")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colProfPrincipal")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colYear")}</th>
                  {canManage && <th className="text-right px-4 py-3 font-medium">{t("colActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">{t("noClasses")}</td></tr>
                ) : (
                  classes.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.nom}</td>
                      <td className="px-4 py-3">{c.niveau}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.structure?.nom ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.filiere ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={c._count.eleves >= c.effectifMax ? "destructive" : "info"}>{c._count.eleves}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{c.effectifMax}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.profPrincipal?.user.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{c.annee}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("edit")} onClick={() => startEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("archive")} onClick={() => handleArchive(c)}>
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                            {hasMultipleSites && isAdmin && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" title={t("transfer")} onClick={() => setTransferTarget(c)}>
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title={t("merge")} onClick={() => { setMergeTarget(c); setMergeSelected([]); }}>
                                  <GitMerge className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title={t("split")} onClick={() => startSplit(c)}>
                                  <Split className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title={t("duplicate")} onClick={() => setDuplicateTarget(c)}>
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title={t("delete")} onClick={() => setDeleteTarget(c)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Section classes archivées */}
      {canManage && (
        <div className="space-y-2">
          <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => { setShowArchived(!showArchived); if (!showArchived) reloadArchived(); }}>
            {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {t("archivedClasses")} ({archivedClasses.length})
          </button>
          {showArchived && archivedClasses.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">{t("colClass")}</th>
                        <th className="text-left px-4 py-2 font-medium">{t("colLevel")}</th>
                        <th className="text-right px-4 py-2 font-medium">{t("colStudents")}</th>
                        <th className="text-left px-4 py-2 font-medium">{t("colYear")}</th>
                        <th className="text-right px-4 py-2 font-medium">{t("colActions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedClasses.map((c) => (
                        <tr key={c.id} className="border-b opacity-60">
                          <td className="px-4 py-2 font-medium">{c.nom}</td>
                          <td className="px-4 py-2">{c.niveau}</td>
                          <td className="px-4 py-2 text-right">{c._count.eleves}</td>
                          <td className="px-4 py-2 text-xs">{c.annee}</td>
                          <td className="px-4 py-2 text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("restore")} onClick={() => handleRestore(c)}>
                              <ArchiveRestore className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
