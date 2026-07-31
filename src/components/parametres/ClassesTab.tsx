"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createClasse, deleteClasse, type ClasseFormData } from "@/lib/actions/parametres";
import { useTranslations } from "next-intl";
import { StructureManager } from "./StructureManager";

interface ClasseItem {
  id: string;
  nom: string;
  niveau: string;
  filiere: string | null;
  effectifMax: number;
  annee: string;
  _count: { eleves: number };
  profPrincipal: { user: { name: string } } | null;
  structure: { id: string; nom: string; type: string } | null;
}

interface StructureOption {
  id: string;
  type: string;
  nom: string;
}

export function ClassesTab({ classes, canManage }: { classes: ClasseItem[]; canManage: boolean }) {
  const t = useTranslations("parametres");
  const tStruct = useTranslations("structures");
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [structures, setStructures] = useState<StructureOption[]>([]);
  const [form, setForm] = useState<ClasseFormData>({
    nom: "",
    niveau: "",
    filiere: "",
    effectifMax: 40,
    annee: "2025-2026",
    structureId: undefined,
  });

  useEffect(() => {
    fetch("/api/structures")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setStructures(data);
      })
      .catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      await createClasse(form);
      toast.success(t("classCreated"));
      setShowForm(false);
      setForm({ nom: "", niveau: "", filiere: "", effectifMax: 40, annee: "2025-2026", structureId: undefined });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDeleteClass"))) return;
    try {
      await deleteClasse(id);
      toast.success(t("classDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-4">
      <StructureManager canManage={canManage} />

      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            {t("addClass")}
          </Button>
        </div>
      )}

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("newClass")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {structures.length > 0 && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="structure">{tStruct("title")}</Label>
                  <select
                    id="structure"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.structureId ?? ""}
                    onChange={(e) => setForm({ ...form, structureId: e.target.value || undefined })}
                  >
                    <option value="">{tStruct("noStructure")}</option>
                    {structures.map((s) => (
                      <option key={s.id} value={s.id}>{s.nom}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="nom">{t("className")}</Label>
                <Input id="nom" placeholder={t("classNamePlaceholder")} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="niveau">{t("level")}</Label>
                <Input id="niveau" placeholder={t("levelPlaceholder")} value={form.niveau} onChange={(e) => setForm({ ...form, niveau: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filiere">{t("filiere")}</Label>
                <Input id="filiere" placeholder={t("filierePlaceholder")} value={form.filiere ?? ""} onChange={(e) => setForm({ ...form, filiere: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="effectifMax">{t("maxStudents")}</Label>
                <Input id="effectifMax" type="number" min="1" value={form.effectifMax}
                  onChange={(e) => setForm({ ...form, effectifMax: parseInt(e.target.value) || 40 })} />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {t("create")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                        <Badge variant="info">{c._count.eleves}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{c.effectifMax}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.profPrincipal?.user.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{c.annee}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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
    </div>
  );
}
