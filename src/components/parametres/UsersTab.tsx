"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Power, Phone, Edit3, Check, X } from "lucide-react";
import { createUser, toggleUserActive, deleteUser, updateUserPhone, type UserFormData } from "@/lib/actions/parametres";

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

const roleLabels: Record<string, string> = {
  TENANT_ADMIN: "Administrateur",
  PRINCIPAL: "Chef d&apos;établissement",
  SECRETARY: "Secrétariat",
  TEACHER: "Enseignant",
  CLASS_TEACHER: "Prof. principal",
  COUNSELOR: "Conseiller",
  NURSE: "Infirmier(e)",
  ACCOUNTANT: "Gestionnaire",
  PARENT: "Parent",
  STUDENT: "Élève",
};

export function UsersTab({ users, canManage }: { users: UserItem[]; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
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
      toast.success("Utilisateur créé");
      setShowForm(false);
      setForm({ name: "", email: "", role: "TEACHER", phone: "", password: "", isActive: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsPending(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      await toggleUserActive(id);
      toast.success("Statut modifié");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      await deleteUser(id);
      toast.success("Utilisateur supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function handleSavePhone(id: string) {
    setIsPending(true);
    try {
      await updateUserPhone(id, phoneValue);
      toast.success("Téléphone mis à jour");
      setEditingPhoneId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            Ajouter un utilisateur
          </Button>
        </div>
      )}

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Nouvel utilisateur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nom complet *</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Rôle *</Label>
                <select id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserFormData["role"] })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {Object.entries(roleLabels).filter(([k]) => k !== "STUDENT").map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="password">Mot de passe (laisser vide pour générer)</Label>
                <Input id="password" type="password" placeholder="Min. 8 caractères" value={form.password ?? ""}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Créer
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Annuler</Button>
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
                  <th className="text-left px-4 py-3 font-medium">Nom</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Téléphone</th>
                  <th className="text-left px-4 py-3 font-medium">Rôle</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-left px-4 py-3 font-medium">Dernière connexion</th>
                  {canManage && <th className="text-right px-4 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Aucun utilisateur</td></tr>
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
                              placeholder="ex: 253779876543"
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
                        <Badge variant="info">{roleLabels[u.role] ?? u.role}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.isActive ? "success" : "secondary"}>
                          {u.isActive ? "Actif" : "Désactivé"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("fr-FR") : "Jamais"}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(u.id)} title="Activer/Désactiver">
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(u.id)} title="Supprimer">
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
