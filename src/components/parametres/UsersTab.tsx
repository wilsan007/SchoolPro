"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Power, Phone, Edit3, Check, X, Building2 } from "lucide-react";
import { createUser, toggleUserActive, deleteUser, updateUserPhone, type UserFormData } from "@/lib/actions/parametres";
import { addUserToTenant } from "@/lib/actions/user-tenant";
import { useTranslations } from "next-intl";
import type { AvailableTenant } from "@/auth.config";
import type { Role } from "@prisma/client";

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

export function UsersTab({ users, canManage, availableTenants = [] }: { users: UserItem[]; canManage: boolean; availableTenants?: AvailableTenant[] }) {
  const t = useTranslations("parametres");
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState("");

  // Multi-tenant: modal d'invitation
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [tenantForm, setTenantForm] = useState({
    email: "",
    tenantId: "",
    role: "TEACHER" as Role,
  });
  const [tenantResult, setTenantResult] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormData>({
    name: "",
    email: "",
    role: "TEACHER",
    phone: "",
    password: "",
    isActive: true,
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      await createUser(form);
      toast.success(t("userCreated"));
      setShowForm(false);
      setForm({ name: "", email: "", role: "TEACHER", phone: "", password: "", isActive: true });
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

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDeleteUser"))) return;
    try {
      await deleteUser(id);
      toast.success(t("userDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
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
                  placeholder="prof@ecole.com"
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
                  {Object.entries(roleKeys).filter(([k]) => k !== "STUDENT").map(([key, labelKey]) => (
                    <option key={key} value={key}>{t(labelKey)}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                💡 Si l'email existe déjà, l'utilisateur sera lié au nouvel établissement avec le rôle choisi.
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
                  {Object.entries(roleKeys).filter(([k]) => k !== "STUDENT").map(([key, labelKey]) => (
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
                  <th className="text-left px-4 py-3 font-medium">{t("colName")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colEmail")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colPhone")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colRole")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colStatus")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colLastLogin")}</th>
                  {canManage && <th className="text-right px-4 py-3 font-medium">{t("colActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{t("noUsers")}</td></tr>
                ) : (
                  users.map((u) => (
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
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(u.id)} title={t("deleteTitle")}>
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
    </div>
  );
}
