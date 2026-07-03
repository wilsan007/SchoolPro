"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Link2, Unlink, Phone, MessageCircle, Edit3, X, Check, Users } from "lucide-react";
import {
  createParent,
  linkParentToEleves,
  unlinkParentFromEleve,
  updateParentPhone,
  deleteParent,
  type ParentFormData,
} from "@/lib/actions/parametres";

interface EleveLink {
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    classe: { nom: string } | null;
  };
}

interface ParentItem {
  id: string;
  nom: string;
  prenom: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  telegramChatId: string | null;
  profession: string | null;
  enfants: EleveLink[];
  user: { id: string; email: string; isActive: boolean } | null;
}

interface EleveItem {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe: { nom: string } | null;
}

export function ParentsTab({
  parents,
  eleves,
  canManage,
}: {
  parents: ParentItem[];
  eleves: EleveItem[];
  canManage: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [linkingParent, setLinkingParent] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [selectedEleves, setSelectedEleves] = useState<string[]>([]);
  const [phoneForm, setPhoneForm] = useState({ phone: "", telegramChatId: "" });

  const [form, setForm] = useState<ParentFormData & { eleveIds: string[] }>({
    nom: "",
    prenom: "",
    phone: "",
    phone2: "",
    email: "",
    telegramChatId: "",
    profession: "",
    adresse: "",
    eleveIds: [],
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      await createParent(form);
      toast.success("Parent créé et lié aux élèves");
      setShowForm(false);
      setForm({
        nom: "", prenom: "", phone: "", phone2: "", email: "",
        telegramChatId: "", profession: "", adresse: "", eleveIds: [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsPending(false);
    }
  }

  async function handleLink(parentId: string) {
    if (selectedEleves.length === 0) {
      toast.error("Sélectionnez au moins un élève");
      return;
    }
    setIsPending(true);
    try {
      await linkParentToEleves(parentId, selectedEleves);
      toast.success(`${selectedEleves.length} élève(s) lié(s)`);
      setLinkingParent(null);
      setSelectedEleves([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsPending(false);
    }
  }

  async function handleUnlink(parentId: string, eleveId: string, eleveNom: string) {
    if (!confirm(`Délier ${eleveNom} de ce parent ?`)) return;
    try {
      await unlinkParentFromEleve(parentId, eleveId);
      toast.success("Lien supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function handleUpdatePhone(parentId: string) {
    setIsPending(true);
    try {
      await updateParentPhone(parentId, phoneForm.phone, phoneForm.telegramChatId);
      toast.success("Contact mis à jour");
      setEditingPhone(null);
      setPhoneForm({ phone: "", telegramChatId: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(parentId: string, parentNom: string) {
    if (!confirm(`Supprimer ${parentNom} ?`)) return;
    try {
      await deleteParent(parentId);
      toast.success("Parent supprimé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  function toggleEleveSelection(eleveId: string) {
    setSelectedEleves((prev) =>
      prev.includes(eleveId) ? prev.filter((id) => id !== eleveId) : [...prev, eleveId]
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            Ajouter un parent
          </Button>
        </div>
      )}

      {/* Formulaire de création */}
      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Nouveau parent / tuteur</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="p-nom">Nom *</Label>
                  <Input id="p-nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-prenom">Prénom *</Label>
                  <Input id="p-prenom" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-phone">Téléphone * (WhatsApp/SMS)</Label>
                  <Input id="p-phone" placeholder="ex: 253779876543" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-phone2">Téléphone 2 (optionnel)</Label>
                  <Input id="p-phone2" value={form.phone2 ?? ""} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-email">Email</Label>
                  <Input id="p-email" type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-telegram">Telegram Chat ID (optionnel)</Label>
                  <Input id="p-telegram" placeholder="ex: 123456789" value={form.telegramChatId ?? ""} onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-profession">Profession</Label>
                  <Input id="p-profession" value={form.profession ?? ""} onChange={(e) => setForm({ ...form, profession: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-adresse">Adresse</Label>
                  <Input id="p-adresse" value={form.adresse ?? ""} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
                </div>
              </div>

              {/* Sélection des élèves à lier */}
              <div className="space-y-2">
                <Label>Lier à des élèves (optionnel)</Label>
                <div className="max-h-48 overflow-y-auto border rounded-md p-3 space-y-1">
                  {eleves.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun élève actif</p>
                  ) : (
                    eleves.map((el) => (
                      <label
                        key={el.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.eleveIds.includes(el.id)}
                          onChange={() => {
                            setForm((prev) => ({
                              ...prev,
                              eleveIds: prev.eleveIds.includes(el.id)
                                ? prev.eleveIds.filter((id) => id !== el.id)
                                : [...prev.eleveIds, el.id],
                            }));
                          }}
                          className="rounded"
                        />
                        <span className="flex-1">
                          {el.prenom} {el.nom}
                          {el.classe && <span className="text-muted-foreground ml-2">({el.classe.nom})</span>}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{el.matricule}</span>
                      </label>
                    ))
                  )}
                </div>
                {form.eleveIds.length > 0 && (
                  <p className="text-xs text-primary">{form.eleveIds.length} élève(s) sélectionné(s)</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Créer le parent
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Liste des parents */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Parent / Tuteur</th>
                  <th className="text-left px-4 py-3 font-medium">Téléphone</th>
                  <th className="text-left px-4 py-3 font-medium">Telegram</th>
                  <th className="text-left px-4 py-3 font-medium">Élèves liés</th>
                  {canManage && <th className="text-right px-4 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {parents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucun parent enregistré. Cliquez sur "Ajouter un parent" pour commencer.
                    </td>
                  </tr>
                ) : (
                  parents.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.prenom} {p.nom}</div>
                        {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                        {p.profession && <div className="text-xs text-muted-foreground">{p.profession}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {editingPhone === p.id ? (
                          <div className="flex flex-col gap-1">
                            <Input
                              placeholder="Téléphone"
                              value={phoneForm.phone}
                              onChange={(e) => setPhoneForm({ ...phoneForm, phone: e.target.value })}
                              className="h-8 text-xs w-32"
                            />
                            <Input
                              placeholder="Telegram Chat ID"
                              value={phoneForm.telegramChatId}
                              onChange={(e) => setPhoneForm({ ...phoneForm, telegramChatId: e.target.value })}
                              className="h-8 text-xs w-32"
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleUpdatePhone(p.id)}
                                disabled={isPending}
                              >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => setEditingPhone(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono text-xs">{p.phone || "—"}</span>
                            {canManage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 ml-1"
                                onClick={() => {
                                  setEditingPhone(p.id);
                                  setPhoneForm({ phone: p.phone, telegramChatId: p.telegramChatId ?? "" });
                                }}
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.telegramChatId ? (
                          <Badge variant="info" className="gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {p.telegramChatId}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.enfants.length === 0 ? (
                            <span className="text-muted-foreground text-xs">Aucun élève lié</span>
                          ) : (
                            p.enfants.map((ep) => (
                              <Badge key={ep.eleve.id} variant="secondary" className="gap-1">
                                {ep.eleve.prenom} {ep.eleve.nom}
                                {canManage && (
                                  <button
                                    onClick={() => handleUnlink(p.id, ep.eleve.id, `${ep.eleve.prenom} ${ep.eleve.nom}`)}
                                    className="ml-1 hover:text-destructive"
                                  >
                                    <Unlink className="w-3 h-3" />
                                  </button>
                                )}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setLinkingParent(linkingParent === p.id ? null : p.id);
                                setSelectedEleves([]);
                              }}
                              title="Lier à des élèves"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(p.id, `${p.prenom} ${p.nom}`)}
                              title="Supprimer"
                            >
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

      {/* Panneau de liaison d'élèves */}
      {linkingParent && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Lier des élèves au parent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-64 overflow-y-auto border rounded-md p-3 space-y-1">
              {eleves.map((el) => {
                const parent = parents.find((p) => p.id === linkingParent);
                const alreadyLinked = parent?.enfants.some((ep) => ep.eleve.id === el.id);
                return (
                  <label
                    key={el.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                      alreadyLinked ? "opacity-50" : "hover:bg-accent cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEleves.includes(el.id) || alreadyLinked}
                      disabled={alreadyLinked}
                      onChange={() => toggleEleveSelection(el.id)}
                      className="rounded"
                    />
                    <span className="flex-1">
                      {el.prenom} {el.nom}
                      {el.classe && <span className="text-muted-foreground ml-2">({el.classe.nom})</span>}
                    </span>
                    {alreadyLinked && <Badge variant="secondary" className="text-xs">Déjà lié</Badge>}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-2"
                onClick={() => handleLink(linkingParent)}
                disabled={isPending || selectedEleves.length === 0}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Lier {selectedEleves.length} élève(s)
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setLinkingParent(null); setSelectedEleves([]); }}>
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
