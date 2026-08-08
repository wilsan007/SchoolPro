"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Building2, MapPin, Phone, Mail, Edit3, Check, RotateCcw, Clock, AlertTriangle } from "lucide-react";
import { createSite, updateSite, restoreSite, getDeletedSites, type SiteFormData } from "@/lib/actions/parametres";
import { DeleteSiteDialog } from "./DeleteSiteDialog";
import { useTranslations } from "next-intl";

interface SiteItem {
  id: string;
  nom: string;
  code: string | null;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  actif: boolean;
  _count: {
    classes: number;
    eleves: number;
    salles: number;
    userSites: number;
    factures: number;
  };
}

const EMPTY_FORM: SiteFormData = {
  nom: "",
  code: "",
  adresse: "",
  ville: "",
  telephone: "",
  email: "",
  actif: true,
};

interface DeletedSite {
  id: string;
  nom: string;
  code: string | null;
  deletedAt: Date | string;
  deletedReason: string | null;
  scheduledPurgeAt: Date | string;
  _count: {
    classes: number;
    eleves: number;
    salles: number;
  };
}

export function SitesTab({ sites, canManage }: { sites: SiteItem[]; canManage: boolean }) {
  const t = useTranslations("parametres");
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SiteFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<SiteItem | null>(null);
  const [deletedSites, setDeletedSites] = useState<DeletedSite[]>([]);
  const [showDeletedSection, setShowDeletedSection] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const refreshDeletedSites = useCallback(async () => {
    try {
      const result = await getDeletedSites();
      setDeletedSites(result as DeletedSite[]);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (canManage) {
      refreshDeletedSites();
    }
  }, [canManage, refreshDeletedSites]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      if (editingId) {
        await updateSite(editingId, form);
        toast.success("Site modifié avec succès");
      } else {
        await createSite(form);
        toast.success("Site créé avec succès");
      }
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'opération");
    } finally {
      setIsPending(false);
    }
  }

  function handleEdit(site: SiteItem) {
    setEditingId(site.id);
    setForm({
      nom: site.nom,
      code: site.code ?? "",
      adresse: site.adresse ?? "",
      ville: site.ville ?? "",
      telephone: site.telephone ?? "",
      email: site.email ?? "",
      actif: site.actif,
    });
    setShowForm(true);
  }

  async function handleRestore(siteId: string, siteNom: string) {
    if (!confirm(`Restaurer le site « ${siteNom} » ?`)) return;
    setRestoringId(siteId);
    try {
      await restoreSite(siteId);
      toast.success(`Site « ${siteNom} » restauré avec succès`);
      await refreshDeletedSites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la restauration");
    } finally {
      setRestoringId(null);
    }
  }

  function formatDate(d: Date | string): string {
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  }

  function getDaysUntilPurge(d: Date | string): number {
    const purge = new Date(d);
    const now = new Date();
    return Math.ceil((purge.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  const f = (k: keyof SiteFormData, v: string | boolean) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Sites & Campus
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gérez les sites annexes et isolez les données par site
          </p>
        </div>
        {canManage && (
          <Button size="sm" className="gap-2" onClick={() => { resetForm(); setShowForm(!showForm); }}>
            <Plus className="h-4 w-4" />
            Nouveau site
          </Button>
        )}
      </div>

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {editingId ? "Modifier le site" : "Créer un nouveau site"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nom">Nom du site *</Label>
                <Input id="nom" placeholder="Campus Central, Annexe PK12…" value={form.nom}
                  onChange={(e) => f("nom", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">Code</Label>
                <Input id="code" placeholder="SITE-01" value={form.code ?? ""}
                  onChange={(e) => f("code", e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="adresse">Adresse</Label>
                <Input id="adresse" placeholder="Rue, quartier…" value={form.adresse ?? ""}
                  onChange={(e) => f("adresse", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ville">Ville</Label>
                <Input id="ville" value={form.ville ?? ""}
                  onChange={(e) => f("ville", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telephone">Téléphone</Label>
                <Input id="telephone" value={form.telephone ?? ""}
                  onChange={(e) => f("telephone", e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email ?? ""}
                  onChange={(e) => f("email", e.target.value)} />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="actif"
                  checked={form.actif}
                  onChange={(e) => f("actif", e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="actif" className="text-sm font-normal cursor-pointer">
                  Site actif
                </Label>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending || !form.nom}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingId ? "Enregistrer" : "Créer le site"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.length === 0 ? (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Aucun site configuré. Créez votre premier site pour commencer.</p>
            </CardContent>
          </Card>
        ) : (
          sites.map((site) => (
            <Card key={site.id} className={!site.actif ? "opacity-60" : ""}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{site.nom}</p>
                      {site.code && (
                        <p className="text-xs text-muted-foreground">{site.code}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {site.actif ? (
                      <Badge variant="success" className="text-[10px]">Actif</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Inactif</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {site.adresse && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      {site.adresse}{site.ville ? `, ${site.ville}` : ""}
                    </p>
                  )}
                  {site.telephone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 flex-shrink-0" />
                      {site.telephone}
                    </p>
                  )}
                  {site.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      {site.email}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Badge variant="info" className="text-[10px]">{site._count.classes} classes</Badge>
                  <Badge variant="info" className="text-[10px]">{site._count.eleves} élèves</Badge>
                  <Badge variant="info" className="text-[10px]">{site._count.salles} salles</Badge>
                  <Badge variant="info" className="text-[10px]">{site._count.userSites} users</Badge>
                </div>

                {canManage && (
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => handleEdit(site)}>
                      <Edit3 className="h-3 w-3" /> Modifier
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(site)}>
                      <Trash2 className="h-3 w-3" /> Supprimer
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Section: sites supprimés (soft-delete) */}
      {canManage && deletedSites.length > 0 && (
        <div className="pt-4 border-t">
          <button
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowDeletedSection(!showDeletedSection)}
          >
            <Clock className="h-3.5 w-3.5" />
            {deletedSites.length} site{deletedSites.length > 1 ? "s" : ""} supprimé{deletedSites.length > 1 ? "s" : ""} en attente de purge
            <span className="text-[10px]">({showDeletedSection ? "masquer" : "afficher"})</span>
          </button>

          {showDeletedSection && (
            <div className="mt-3 space-y-2">
              {deletedSites.map((site) => {
                const daysLeft = getDaysUntilPurge(site.scheduledPurgeAt);
                const isUrgent = daysLeft <= 7;
                return (
                  <Card key={site.id} className="border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10">
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={`h-3.5 w-3.5 ${isUrgent ? "text-red-500" : "text-amber-500"}`} />
                          <p className="font-semibold text-sm">{site.nom}</p>
                          {site.code && <Badge variant="secondary" className="text-[10px]">{site.code}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>Supprimé le {formatDate(site.deletedAt)} — Raison : {site.deletedReason ?? "Non précisée"}</p>
                          <p className={isUrgent ? "text-red-500 font-medium" : ""}>
                            Purge définitive dans {daysLeft} jour{daysLeft > 1 ? "s" : ""} ({formatDate(site.scheduledPurgeAt)})
                          </p>
                          <p>{site._count.classes} classes, {site._count.eleves} élèves, {site._count.salles} salles seront détruits</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-7 shrink-0"
                        disabled={restoringId === site.id}
                        onClick={() => handleRestore(site.id, site.nom)}
                      >
                        {restoringId === site.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Restaurer
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de suppression */}
      {deleteTarget && (
        <DeleteSiteDialog
          siteId={deleteTarget.id}
          siteNom={deleteTarget.nom}
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
          onDeleted={refreshDeletedSites}
        />
      )}
    </div>
  );
}
