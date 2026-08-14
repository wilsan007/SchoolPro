"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Power, Phone, Edit3, Check, X, Building2, MapPin, AlertTriangle, Search, Shield, GraduationCap, Briefcase, Users as UsersIcon } from "lucide-react";
import { createUser, toggleUserActive, deleteUser, updateUserPhone, assignUserSites, getUserSites, type UserFormData } from "@/lib/actions/parametres";
import { addUserToTenant } from "@/lib/actions/user-tenant";
import { useTranslations } from "next-intl";
import type { AvailableTenant } from "@/auth.config";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const roleKeys: Record<string, string> = {
  TENANT_ADMIN: "roleTenantAdmin",
  PRINCIPAL: "rolePrincipal",
  SECRETARY: "roleSecretary",
  TEACHER: "roleTeacher",
  CLASS_TEACHER: "roleClassTeacher",
  COUNSELOR: "roleCounselor",
  NURSE: "roleNurse",
  ACCOUNTANT: "roleAccountant",
  PARENT: "roleParent",
  STUDENT: "roleStudent",
};

type UserCategory = "all" | "admin" | "teachers" | "staff";

const categoryConfig: Record<UserCategory, { labelKey: string; icon: typeof Shield; roles: string[] }> = {
  all: { labelKey: "allUsers", icon: UsersIcon, roles: [] },
  admin: { labelKey: "adminCategory", icon: Shield, roles: ["TENANT_ADMIN", "PRINCIPAL", "SUPER_ADMIN"] },
  teachers: { labelKey: "teachersCategory", icon: GraduationCap, roles: ["TEACHER", "CLASS_TEACHER", "COUNSELOR"] },
  staff: { labelKey: "staffCategory", icon: Briefcase, roles: ["SECRETARY", "NURSE", "ACCOUNTANT"] },
};

// Rôles masqués du sélecteur (le prof principal est défini au niveau de la classe, pas au niveau utilisateur)
const hiddenRoles = ["CLASS_TEACHER"];

interface SiteItem {
  id: string;
  nom: string;
  code: string | null;
}

export function UsersTab({ users, canManage, availableTenants = [], sites = [] }: { users: UserItem[]; canManage: boolean; availableTenants?: AvailableTenant[]; sites?: SiteItem[] }) {
  const t = useTranslations("parametres");
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
  const [activeCategory, setActiveCategory] = useState<UserCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = users.filter((u) => {
    const matchesCategory =
      activeCategory === "all" || categoryConfig[activeCategory].roles.includes(u.role);
    const matchesSearch =
      !searchQuery ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categoryCounts: Record<UserCategory, number> = {
    all: users.length,
    admin: users.filter((u) => categoryConfig.admin.roles.includes(u.role)).length,
    teachers: users.filter((u) => categoryConfig.teachers.roles.includes(u.role)).length,
    staff: users.filter((u) => categoryConfig.staff.roles.includes(u.role)).length,
  };

  // Multi-tenant: modal d'invitation
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [tenantForm, setTenantForm] = useState({
    email: "",
    tenantId: "",
    role: "TEACHER" as Role,
  });
  const [tenantResult, setTenantResult] = useState<string | null>(null);
  // Multi-site: modal d'affectation des sites
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [siteModalUserId, setSiteModalUserId] = useState<string | null>(null);
  const [siteModalUserName, setSiteModalUserName] = useState<string>("");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [siteLoading, setSiteLoading] = useState(false);

  async function openSiteModal(userId: string, userName: string) {
    setSiteModalUserId(userId);
    setSiteModalUserName(userName);
    setSiteLoading(true);
    setShowSiteModal(true);
    try {
      const existingSiteIds = await getUserSites(userId);
      setSelectedSiteIds(existingSiteIds.map((s) => s.siteId));
    } catch {
      setSelectedSiteIds([]);
    } finally {
      setSiteLoading(false);
    }
  }

  async function handleSaveSites() {
    if (!siteModalUserId) return;
    setSiteLoading(true);
    try {
      await assignUserSites(siteModalUserId, selectedSiteIds.map((sid) => ({ siteId: sid, role: null })));
      toast.success(t("sitesAccessUpdated"));
      setShowSiteModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSiteLoading(false);
    }
  }

  function toggleSiteSelection(siteId: string) {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  }

  function toggleAllSites() {
    setSelectedSiteIds((prev) =>
      prev.length === sites.length ? [] : sites.map((s) => s.id)
    );
  }

  const [form, setForm] = useState<UserFormData>({
    name: "",
    email: "",
    role: "TEACHER",
    phone: "",
    password: "",
    isActive: true,
  });
  const [formSiteIds, setFormSiteIds] = useState<string[]>([]);

  function toggleFormSite(siteId: string) {
    setFormSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  }

  function toggleAllFormSites() {
    setFormSiteIds((prev) =>
      prev.length === sites.length ? [] : sites.map((s) => s.id)
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      const result = await createUser(form);
      // Assigner les sites si des sites sont sélectionnés
      if (formSiteIds.length > 0 && result?.success) {
        // Récupérer l'ID du nouvel utilisateur via la liste rafraîchie
        // Pour l'instant, on assigne après création en cherchant par email
        const newUserId = (result as { userId?: string }).userId;
        if (newUserId) {
          await assignUserSites(newUserId, formSiteIds.map((sid) => ({ siteId: sid, role: null })));
        }
      }
      toast.success(t("userCreated"));
      setShowForm(false);
      setForm({ name: "", email: "", role: "TEACHER", phone: "", password: "", isActive: true });
      setFormSiteIds([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      await toggleUserActive(id);
      toast.success(t("userToggled"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  }

  // Modal de suppression avec confirmation par nom
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserName, setDeleteUserName] = useState<string>("");
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  function openDeleteModal(id: string, name: string) {
    setDeleteUserId(id);
    setDeleteUserName(name);
    setDeleteConfirmText("");
    setShowDeleteModal(true);
  }

  async function handleDelete() {
    if (!deleteUserId) return;
    if (deleteConfirmText.trim() !== deleteUserName.trim()) return;
    setDeleteLoading(true);
    try {
      await deleteUser(deleteUserId);
      toast.success(t("userDeleted"));
      setShowDeleteModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleSavePhone(id: string) {
    setIsPending(true);
    try {
      await updateUserPhone(id, phoneValue);
      toast.success(t("phoneUpdated"));
      setEditingPhoneId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleAddToTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantForm.email || !tenantForm.tenantId) return;
    setIsPending(true);
    setTenantResult(null);
    try {
      const result = await addUserToTenant(tenantForm);
      setTenantResult(result.message);
      toast.success(result.message);
      setTenantForm({ email: "", tenantId: "", role: "TEACHER" });
      setShowTenantModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  function openTenantModal(presetEmail?: string) {
    setTenantForm({ email: presetEmail ?? "", tenantId: "", role: "TEACHER" });
    setTenantResult(null);
    setShowTenantModal(true);
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end gap-2">
          {availableTenants.length > 1 && (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => openTenantModal()}>
              <Building2 className="h-4 w-4" />
              {t("addToTenant")}
            </Button>
          )}
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            {t("addUser")}
          </Button>
        </div>
      )}

      {/* Modal: Ajouter un user à un autre tenant */}
      {showTenantModal && canManage && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              {t("addToTenantTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddToTenant} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tenant-email">{t("colEmail")} *</Label>
                <Input
                  id="tenant-email"
                  type="email"
                  value={tenantForm.email}
                  onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })}
                  placeholder={t("placeholderEmail")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tenant-select">{t("selectTenant")}</Label>
                <select
                  id="tenant-select"
                  value={tenantForm.tenantId}
                  onChange={(e) => setTenantForm({ ...tenantForm, tenantId: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">— Choisir —</option>
                  {availableTenants.map((at) => (
                    <option key={at.tenantId} value={at.tenantId}>
                      {at.tenantName} ({at.tenantSlug})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tenant-role">{t("role")}</Label>
                <select
                  id="tenant-role"
                  value={tenantForm.role}
                  onChange={(e) => setTenantForm({ ...tenantForm, role: e.target.value as Role })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(roleKeys).filter(([k]) => k !== "STUDENT" && !hiddenRoles.includes(k)).map(([key, labelKey]) => (
                    <option key={key} value={key}>{t(labelKey)}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                💡 Si l&apos;email existe déjà, l&apos;utilisateur sera lié au nouvel établissement avec le rôle choisi.
                Si non, un nouveau compte sera créé avec un mot de passe temporaire.
              </div>
              <div className="md:col-span-3 flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                  {t("addToTenant")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowTenantModal(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("newUser")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">{t("fullName")}</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("colEmail")} *</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">{t("role")}</Label>
                <select id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserFormData["role"] })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {Object.entries(roleKeys).filter(([k]) => k !== "STUDENT" && !hiddenRoles.includes(k)).map(([key, labelKey]) => (
                    <option key={key} value={key}>{t(labelKey)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">{t("phone")}</Label>
                <Input id="phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input id="password" type="password" placeholder={t("passwordPlaceholder")} value={form.password ?? ""}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>

              {/* Sélection des sites */}
              {sites.length > 0 && (
                <div className="md:col-span-2 space-y-2">
                  <Label>Accès aux sites</Label>
                  <label
                    className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formSiteIds.length === sites.length}
                      onChange={toggleAllFormSites}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Accès à tous les sites</p>
                    </div>
                  </label>
                  {sites.map((site) => (
                    <label
                      key={site.id}
                      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={formSiteIds.includes(site.id)}
                        onChange={() => toggleFormSite(site.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{site.nom}</p>
                          {site.code && <p className="text-xs text-muted-foreground">{site.code}</p>}
                        </div>
                      </div>
                    </label>
                  ))}
                  {formSiteIds.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      Aucun site sélectionné = accès à tous les sites par défaut.
                    </p>
                  )}
                </div>
              )}
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

      {/* Barre de filtres par catégorie + recherche */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(categoryConfig) as UserCategory[]).map((cat) => {
            const cfg = categoryConfig[cat];
            const count = categoryCounts[cat];
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <cfg.icon className="h-3.5 w-3.5" />
                {t(cfg.labelKey)}
                <span className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  isActive ? "bg-primary-foreground/20" : "bg-muted"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchByNameOrEmail")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">{t("colName")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colEmail")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colPhone")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colRole")}</th>
                  <th className="text-left px-4 py-3 font-medium">Sites</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colStatus")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colLastLogin")}</th>
                  {canManage && <th className="text-right px-4 py-3 font-medium">{t("colActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">
                    {searchQuery ? "Aucun utilisateur trouvé pour cette recherche." : t("noUsers")}
                  </td></tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        {editingPhoneId === u.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={phoneValue}
                              onChange={(e) => setPhoneValue(e.target.value)}
                              placeholder={t("phonePlaceholder")}
                              className="h-8 text-xs w-32"
                            />
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleSavePhone(u.id)} disabled={isPending}>
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingPhoneId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono text-xs">{u.phone ?? "—"}</span>
                            {canManage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 ml-1"
                                onClick={() => { setEditingPhoneId(u.id); setPhoneValue(u.phone ?? ""); }}
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="info">{t(roleKeys[u.role] ?? u.role)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {canManage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => openSiteModal(u.id, u.name)}
                          >
                            <MapPin className="h-3 w-3" />
                            Gérer
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.isActive ? "success" : "secondary"}>
                          {u.isActive ? t("active") : t("disabled")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("fr-FR") : t("never")}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {availableTenants.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openTenantModal(u.email)}
                                title={t("addToTenant")}
                              >
                                <Building2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(u.id)} title={t("toggleTitle")}>
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => openDeleteModal(u.id, u.name)} title={t("deleteTitle")}>
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

      {/* Modal: Gérer les accès sites */}
      {showSiteModal && canManage && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Accès aux sites — {siteModalUserName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {siteLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : sites.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                Aucun site n&apos;a été configuré. Allez dans l&apos;onglet « Sites » pour créer des sites, puis revenez ici pour assigner les utilisateurs.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {/* Option "Tous les sites" */}
                  <label
                    className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSiteIds.length === sites.length}
                      onChange={toggleAllSites}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-semibold">Accès à tous les sites</p>
                        <p className="text-xs text-muted-foreground">Cocher pour donner accès à tous les sites de l&apos;établissement</p>
                      </div>
                    </div>
                  </label>

                  {/* Liste des sites individuels */}
                  {sites.map((site) => (
                    <label
                      key={site.id}
                      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.includes(site.id)}
                        onChange={() => toggleSiteSelection(site.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{site.nom}</p>
                          {site.code && (
                            <p className="text-xs text-muted-foreground">{site.code}</p>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                  {selectedSiteIds.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      Sélectionnez au moins un site.
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={handleSaveSites}
                    disabled={siteLoading || selectedSiteIds.length === 0}
                  >
                    {siteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Enregistrer
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowSiteModal(false)}>
                    Annuler
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal: Confirmation de suppression */}
      {showDeleteModal && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Confirmer la suppression
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vous êtes sur le point de supprimer <strong className="text-foreground">{deleteUserName}</strong>.
              Cette action est irréversible et supprimera toutes les données associées (enseignant, sites, etc.).
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                Pour confirmer, tapez le nom exact de l&apos;utilisateur : <strong className="text-foreground">{deleteUserName}</strong>
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteUserName}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={handleDelete}
                disabled={deleteLoading || deleteConfirmText.trim() !== deleteUserName.trim()}
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Supprimer définitivement
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteModal(false)}
              >
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
