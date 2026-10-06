"use client";

import { useMemo, useState } from "react";
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
import { getSchoolGroup, SCHOOL_GROUP_ORDER, type SchoolGroup } from "@/lib/school-groups";
import { useTranslations } from "next-intl";
import { ListeGroupee } from "@/components/ui/liste-groupee";
import { axeInitiale, type AxeRegroupement } from "@/lib/regroupement";
import { cn } from "@/lib/utils";
import type { SiteColor } from "@/lib/site-colors";

interface EleveLink {
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    classe: {
      id: string;
      nom: string;
      niveau: string;
      annee: string;
      siteId: string | null;
      siteNom: string | null;
      structureType: string | null;
    } | null;
  };
}

/** Une classe du rangement, avec les parents qui y ont un enfant. */
interface ClasseParents {
  id: string;
  nom: string;
  niveau: string;
  siteId: string;
  siteNom: string | null;
  parents: ParentItem[];
}

/** Clé des parents sans enfant dans l'année affichée (ou sans élève lié). */
const SANS_CLASSE = "__sans_classe__";
const SANS_SITE = "__none__";
const COULEUR_REPLI: SiteColor = { base: "#6b7280", light: "#f3f4f6", border: "#e5e7eb", text: "#374151" };

/** Nombre de parents distincts parmi des classes (un parent peut figurer dans plusieurs). */
function compterParents(classes: ClasseParents[]): number {
  const ids = new Set<string>();
  for (const c of classes) for (const p of c.parents) ids.add(p.id);
  return ids.size;
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
  classe: { nom: string; niveau: string; structure?: { type: string } | null } | null;
}

// Regroupement du tableau une fois la sélection faite (catégorie, site, classe) :
// tant qu'elle laisse plus de vingt parents, ils restent rangés par classe,
// par niveau ou par ordre alphabétique.
const AXES_PARENTS: AxeRegroupement<ParentItem>[] = [
  { id: "classe", cle: (p) => p.enfants[0]?.eleve.classe?.nom },
  { id: "niveau", cle: (p) => p.enfants[0]?.eleve.classe?.niveau },
  axeInitiale((p) => p.nom),
];

/** Au-delà, les groupes sont repliés à l'ouverture (plusieurs milliers de fiches). */
const SEUIL_REPLI_PARENTS = 100;

export function ParentsTab({
  parents,
  eleves,
  canManage,
  anneeCourante,
  siteColors = {},
}: {
  parents: ParentItem[];
  eleves: EleveItem[];
  canManage: boolean;
  /** Année active : seules ses classes structurent le rangement. */
  anneeCourante?: string;
  siteColors?: Record<string, SiteColor>;
}) {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const tEleves = useTranslations("eleves");
  const tGroupe = useTranslations("regroupement");
  const [listeGroupe, setListeGroupe] = useState<SchoolGroup | null>(null);
  const [listeSite, setListeSite] = useState<string>("all");
  const [listeClasse, setListeClasse] = useState<string | null>(null);

  // Rangement des parents : catégorie scolaire → site → niveau → classe, comme
  // l'écran Élèves. Un parent figure dans la classe de CHACUN de ses enfants de
  // l'année active — on le retrouve donc par n'importe lequel d'entre eux. Ceux
  // qui n'y ont aucun enfant (élève d'une année passée, aucun élève lié) sont
  // réunis dans la catégorie « Autre ».
  const categories = useMemo(() => {
    const parGroupe = new Map<SchoolGroup, Map<string, ClasseParents>>();
    const ranger = (groupe: SchoolGroup, classe: Omit<ClasseParents, "parents">, parent: ParentItem) => {
      let classes = parGroupe.get(groupe);
      if (!classes) parGroupe.set(groupe, (classes = new Map()));
      let entree = classes.get(classe.id);
      if (!entree) classes.set(classe.id, (entree = { ...classe, parents: [] }));
      entree.parents.push(parent);
    };

    for (const parent of parents) {
      const vues = new Set<string>();
      for (const { eleve } of parent.enfants) {
        const c = eleve.classe;
        if (!c || (anneeCourante && c.annee !== anneeCourante) || vues.has(c.id)) continue;
        vues.add(c.id);
        ranger(
          getSchoolGroup(c.niveau, c.nom, c.structureType),
          { id: c.id, nom: c.nom, niveau: c.niveau, siteId: c.siteId ?? SANS_SITE, siteNom: c.siteNom },
          parent,
        );
      }
      if (vues.size === 0) {
        ranger(
          "Autre",
          { id: SANS_CLASSE, nom: tGroupe("nonRenseigne"), niveau: "—", siteId: SANS_SITE, siteNom: null },
          parent,
        );
      }
    }

    return SCHOOL_GROUP_ORDER.flatMap((groupe) => {
      const classes = parGroupe.get(groupe);
      if (!classes) return [];
      return [{ groupe, classes: [...classes.values()].sort((a, b) => a.nom.localeCompare(b.nom)) }];
    });
  }, [parents, anneeCourante, tGroupe]);

  const categorieActive = listeGroupe ? categories.find((c) => c.groupe === listeGroupe) : undefined;

  // Sites de la catégorie active, chacun avec ses classes rangées par niveau.
  const sitesDeLaCategorie = useMemo(() => {
    if (!categorieActive) return [];
    const parSite = new Map<string, { siteId: string; siteNom: string | null; classes: ClasseParents[] }>();
    for (const c of categorieActive.classes) {
      let site = parSite.get(c.siteId);
      if (!site) parSite.set(c.siteId, (site = { siteId: c.siteId, siteNom: c.siteNom, classes: [] }));
      site.classes.push(c);
    }
    return [...parSite.values()]
      .sort((a, b) => (a.siteNom ?? "").localeCompare(b.siteNom ?? ""))
      .map((site) => {
        const parNiveau = new Map<string, ClasseParents[]>();
        for (const c of site.classes) {
          const niveau = parNiveau.get(c.niveau);
          if (niveau) niveau.push(c);
          else parNiveau.set(c.niveau, [c]);
        }
        return {
          ...site,
          total: compterParents(site.classes),
          niveaux: [...parNiveau.entries()].sort(([a], [b]) => a.localeCompare(b)),
        };
      });
  }, [categorieActive]);

  const sitesAffiches =
    listeSite === "all" ? sitesDeLaCategorie : sitesDeLaCategorie.filter((s) => s.siteId === listeSite);

  // Parents de la sélection courante (catégorie, puis site, puis classe), sans doublon.
  const parentsAffiches = useMemo(() => {
    const vus = new Set<string>();
    const liste: ParentItem[] = [];
    for (const site of sitesAffiches) {
      for (const c of site.classes) {
        if (listeClasse && c.id !== listeClasse) continue;
        for (const p of c.parents) {
          if (vus.has(p.id)) continue;
          vus.add(p.id);
          liste.push(p);
        }
      }
    }
    return liste;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sitesAffiches` découle de ces trois valeurs
  }, [sitesDeLaCategorie, listeSite, listeClasse]);

  const nomSite = (siteNom: string | null) => siteNom ?? tGroupe("nonRenseigne");
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [linkingParent, setLinkingParent] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [selectedEleves, setSelectedEleves] = useState<string[]>([]);
  const [phoneForm, setPhoneForm] = useState({ phone: "", telegramChatId: "" });
  const [formActiveGroup, setFormActiveGroup] = useState<SchoolGroup | null>(null);
  const [formActiveClass, setFormActiveClass] = useState<string | null>(null);
  const [linkActiveGroup, setLinkActiveGroup] = useState<SchoolGroup | null>(null);
  const [linkActiveClass, setLinkActiveClass] = useState<string | null>(null);

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
      toast.success(t("parentCreated"));
      setShowForm(false);
      setForm({
        nom: "", prenom: "", phone: "", phone2: "", email: "",
        telegramChatId: "", profession: "", adresse: "", eleveIds: [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleLink(parentId: string) {
    if (selectedEleves.length === 0) {
      toast.error(t("selectStudent"));
      return;
    }
    setIsPending(true);
    try {
      await linkParentToEleves(parentId, selectedEleves);
      toast.success(t("studentsLinked", { count: selectedEleves.length }));
      setLinkingParent(null);
      setSelectedEleves([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleUnlink(parentId: string, eleveId: string, eleveNom: string) {
    if (!confirm(t("confirmUnlink", { name: eleveNom }))) return;
    try {
      await unlinkParentFromEleve(parentId, eleveId);
      toast.success(t("linkRemoved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  }

  async function handleUpdatePhone(parentId: string) {
    setIsPending(true);
    try {
      await updateParentPhone(parentId, phoneForm.phone, phoneForm.telegramChatId);
      toast.success(t("contactUpdated"));
      setEditingPhone(null);
      setPhoneForm({ phone: "", telegramChatId: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(parentId: string, parentNom: string) {
    if (!confirm(t("confirmDelete", { name: parentNom }))) return;
    try {
      await deleteParent(parentId);
      toast.success(t("parentDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  }

  function toggleEleveSelection(eleveId: string) {
    setSelectedEleves((prev) =>
      prev.includes(eleveId) ? prev.filter((id) => id !== eleveId) : [...prev, eleveId]
    );
  }

  function groupElevesByLevel(list: EleveItem[]) {
    return SCHOOL_GROUP_ORDER.map((group) => {
      const classesInGroup = new Map<string, EleveItem[]>();
      for (const el of list) {
        const classeNom = el.classe?.nom ?? "Sans classe";
        const niveau = el.classe?.niveau ?? "";
        const elGroup = el.classe ? getSchoolGroup(niveau, classeNom, el.classe.structure?.type) : "Autre";
        if (elGroup !== group) continue;
        if (!classesInGroup.has(classeNom)) classesInGroup.set(classeNom, []);
        classesInGroup.get(classeNom)!.push(el);
      }
      // Regrouper les classes par niveau (ex: toutes les 6ème A/B/C ensemble)
      const classesByNiveau = new Map<string, { classe: string; eleves: EleveItem[] }[]>();
      for (const [classe, eleves] of Array.from(classesInGroup.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const niveauKey = eleves[0]?.classe?.niveau ?? classe;
        if (!classesByNiveau.has(niveauKey)) classesByNiveau.set(niveauKey, []);
        classesByNiveau.get(niveauKey)!.push({ classe, eleves });
      }
      return {
        group,
        classesByNiveau: Array.from(classesByNiveau.entries()).map(([niveau, classes]) => ({ niveau, classes })),
      };
    }).filter((g) => g.classesByNiveau.length > 0);
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            {t("add")}
          </Button>
        </div>
      )}

      {/* Formulaire de création */}
      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("newParent")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="p-nom">{t("lastName")}</Label>
                  <Input id="p-nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-prenom">{t("firstName")}</Label>
                  <Input id="p-prenom" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-phone">{t("phoneRequired")}</Label>
                  <Input id="p-phone" placeholder="ex: 253779876543" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-phone2">{t("phone2")}</Label>
                  <Input id="p-phone2" value={form.phone2 ?? ""} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-email">{t("email")}</Label>
                  <Input id="p-email" type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-telegram">{t("telegramChatId")}</Label>
                  <Input id="p-telegram" placeholder="ex: 123456789" value={form.telegramChatId ?? ""} onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-profession">{t("profession")}</Label>
                  <Input id="p-profession" value={form.profession ?? ""} onChange={(e) => setForm({ ...form, profession: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-adresse">{t("adresse")}</Label>
                  <Input id="p-adresse" value={form.adresse ?? ""} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
                </div>
              </div>

              {/* Sélection des élèves à lier */}
              <div className="space-y-2">
                <Label>{t("linkStudents")}</Label>
                {eleves.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("noStudents")}</p>
                ) : (
                  <div className="border rounded-md">
                    {/* Onglets horizontaux : Primaire | Collège | Lycée */}
                    <div className="flex items-center gap-1 px-3 pt-2 border-b">
                      {groupElevesByLevel(eleves).map(({ group, classesByNiveau }) => {
                        const totalGroup = classesByNiveau.reduce(
                          (s, n) => s + n.classes.reduce((s2, c) => s2 + c.eleves.length, 0), 0
                        );
                        return (
                          <button
                            key={group}
                            type="button"
                            onClick={() => { setFormActiveGroup(formActiveGroup === group ? null : group); setFormActiveClass(null); }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors border-b-2 ${
                              formActiveGroup === group
                                ? "border-primary text-primary bg-primary/5"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            }`}
                          >
                            {group} <span className="opacity-70">({totalGroup})</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Boutons de classes horizontaux par niveau */}
                    {formActiveGroup && (
                      <div className="px-3 py-2 border-b bg-muted/20">
                        {groupElevesByLevel(eleves)
                          .find((g) => g.group === formActiveGroup)
                          ?.classesByNiveau.map(({ niveau, classes }) => (
                            <div key={niveau} className="flex items-center gap-2 mb-1.5 last:mb-0">
                              <span className="text-[10px] font-semibold text-muted-foreground min-w-[50px] flex-shrink-0">{niveau}</span>
                              <div className="flex flex-wrap gap-1">
                                {classes.map(({ classe, eleves: classeEleves }) => (
                                  <button
                                    key={classe}
                                    type="button"
                                    onClick={() => setFormActiveClass(formActiveClass === classe ? null : classe)}
                                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all border ${
                                      formActiveClass === classe
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background border-border hover:border-primary/40 hover:bg-accent"
                                    }`}
                                  >
                                    {classe} <span className={formActiveClass === classe ? "opacity-80" : "text-muted-foreground"}>({classeEleves.length})</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Liste des élèves de la classe sélectionnée */}
                    {formActiveGroup && formActiveClass && (
                      <div className="max-h-48 overflow-y-auto p-2 space-y-0.5">
                        {groupElevesByLevel(eleves)
                          .find((g) => g.group === formActiveGroup)
                          ?.classesByNiveau.flatMap((n) => n.classes)
                          .find((c) => c.classe === formActiveClass)
                          ?.eleves.map((el) => (
                            <label
                              key={el.id}
                              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm"
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
                              <span className="flex-1">{el.prenom} {el.nom}</span>
                              <span className="text-xs text-muted-foreground font-mono">{el.matricule}</span>
                            </label>
                          ))}
                      </div>
                    )}

                    {(!formActiveGroup || !formActiveClass) && (
                      <div className="text-center py-6 text-muted-foreground text-xs">
                        {!formActiveGroup
                          ? t("selectLevel")
                          : t("selectClass")}
                      </div>
                    )}
                  </div>
                )}
                {form.eleveIds.length > 0 && (
                  <p className="text-xs text-primary">{t("studentsSelected", { count: form.eleveIds.length })}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {t("createParent")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Liste des parents */}
      <Card>
        <CardContent className="p-0">
          {/* Catégories scolaires : Maternelle | Primaire | Collège | Lycée */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1 px-4 pt-3 border-b overflow-x-auto">
              {categories.map(({ groupe, classes }) => (
                <button
                  key={groupe}
                  type="button"
                  onClick={() => {
                    setListeGroupe(listeGroupe === groupe ? null : groupe);
                    setListeSite("all");
                    setListeClasse(null);
                  }}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2",
                    listeGroupe === groupe
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
                  )}
                >
                  {groupe}
                  <span className="ml-1.5 text-xs opacity-70">({compterParents(classes)})</span>
                </button>
              ))}
            </div>
          )}

          {/* Sites de la catégorie */}
          {categorieActive && (
            <div className="flex items-center gap-1 px-4 pt-3 border-b bg-muted/20 overflow-x-auto">
              {[
                { siteId: "all", siteNom: tCommon("all"), total: compterParents(categorieActive.classes) },
                ...sitesDeLaCategorie.map((s) => ({ siteId: s.siteId, siteNom: nomSite(s.siteNom), total: s.total })),
              ].map((site) => {
                const tous = site.siteId === "all";
                const actif = listeSite === site.siteId;
                const couleur = tous ? undefined : (siteColors[site.siteId] ?? COULEUR_REPLI);
                return (
                  <button
                    key={site.siteId}
                    type="button"
                    onClick={() => {
                      setListeSite(site.siteId);
                      setListeClasse(null);
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-b-2",
                      actif ? "bg-background" : "hover:bg-muted/40",
                      tous && actif ? "border-primary text-primary" : "",
                      tous && !actif ? "text-muted-foreground" : "",
                    )}
                    style={couleur ? { color: couleur.text, borderColor: actif ? couleur.base : "transparent" } : undefined}
                  >
                    {site.siteNom}
                    <span className="ml-1.5 text-[10px] opacity-70">({site.total})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Une carte par site : tous ses niveaux, et sur la ligne de chaque
              niveau toutes ses classes. */}
          {categorieActive && (
            <div className="px-4 py-3 border-b bg-muted/20">
              <div className={cn("grid grid-cols-1 gap-3", sitesAffiches.length > 1 && "sm:grid-cols-2 xl:grid-cols-3")}>
                {sitesAffiches.map((site) => {
                  const couleur = siteColors[site.siteId] ?? COULEUR_REPLI;
                  return (
                    <div
                      key={site.siteId}
                      className="rounded-lg border p-3"
                      style={{ borderColor: couleur.border, backgroundColor: couleur.light }}
                    >
                      <div className="mb-2 text-sm font-semibold" style={{ color: couleur.text }}>
                        {nomSite(site.siteNom)}
                        <span className="ml-1.5 text-[10px] opacity-80">({site.total})</span>
                      </div>
                      <div className="space-y-2">
                        {site.niveaux.map(([niveau, classes]) => (
                          <div key={niveau} className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground min-w-[60px] flex-shrink-0">
                              {niveau}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {classes.map((c) => {
                                const active = listeClasse === c.id;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setListeClasse(active ? null : c.id)}
                                    className={cn(
                                      "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
                                      active ? "shadow-sm" : "hover:bg-white/60",
                                    )}
                                    style={
                                      active
                                        ? { backgroundColor: couleur.base, borderColor: couleur.base, color: "#fff" }
                                        : { borderColor: couleur.border, color: couleur.text }
                                    }
                                  >
                                    {c.nom}
                                    <span className="ml-1.5 text-[10px] opacity-80">{c.parents.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Message si aucune catégorie sélectionnée */}
          {parents.length > 0 && !categorieActive && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {tEleves("selectLevelForClasses")}
            </div>
          )}

          {(parents.length === 0 || categorieActive) && (
          <div className="overflow-x-auto">
            {categorieActive && (
              <div className="px-4 py-2 text-sm font-medium text-muted-foreground">
                {t("pvCountDisplayed", { count: parentsAffiches.length })}
                {listeSite !== "all" ? ` — ${nomSite(sitesAffiches[0]?.siteNom ?? null)}` : ""}
                {listeClasse ? ` — ${categorieActive.classes.find((c) => c.id === listeClasse)?.nom ?? ""}` : ""}
              </div>
            )}
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">{t("parentGuardian")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("phone")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("telegram")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("linkedStudents")}</th>
                  {canManage && <th className="text-right px-4 py-3 font-medium">{t("actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {parents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t("noParents")}
                    </td>
                  </tr>
                ) : (
                  <ListeGroupee
                    variante="table"
                    items={parentsAffiches}
                    axes={AXES_PARENTS}
                    replieAuDepart={parentsAffiches.length > SEUIL_REPLI_PARENTS}
                    rendu={(p) => (
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
                              aria-label={t("phone")}
                              placeholder={t("phone")}
                              value={phoneForm.phone}
                              onChange={(e) => setPhoneForm({ ...phoneForm, phone: e.target.value })}
                              className="h-8 text-xs w-32"
                            />
                            <Input
                              aria-label={t("telegram")}
                              placeholder={t("telegram")}
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
                            <span className="text-muted-foreground text-xs">{t("noLinkedStudents")}</span>
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
                              title={t("linkToStudents")}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(p.id, `${p.prenom} ${p.nom}`)}
                              title={t("delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    )}
                  />
                )}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Panneau de liaison d'élèves */}
      {linkingParent && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t("linkStudentsToParent")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {eleves.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun élève actif</p>
            ) : (
              <div className="border rounded-md">
                {/* Onglets horizontaux : Primaire | Collège | Lycée */}
                <div className="flex items-center gap-1 px-3 pt-2 border-b">
                  {groupElevesByLevel(eleves).map(({ group, classesByNiveau }) => {
                    const totalGroup = classesByNiveau.reduce(
                      (s, n) => s + n.classes.reduce((s2, c) => s2 + c.eleves.length, 0), 0
                    );
                    return (
                      <button
                        key={group}
                        type="button"
                        onClick={() => { setLinkActiveGroup(linkActiveGroup === group ? null : group); setLinkActiveClass(null); }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors border-b-2 ${
                          linkActiveGroup === group
                            ? "border-primary text-primary bg-primary/5"
                            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                      >
                        {group} <span className="opacity-70">({totalGroup})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Boutons de classes horizontaux par niveau */}
                {linkActiveGroup && (
                  <div className="px-3 py-2 border-b bg-muted/20">
                    {groupElevesByLevel(eleves)
                      .find((g) => g.group === linkActiveGroup)
                      ?.classesByNiveau.map(({ niveau, classes }) => (
                        <div key={niveau} className="flex items-center gap-2 mb-1.5 last:mb-0">
                          <span className="text-[10px] font-semibold text-muted-foreground min-w-[50px] flex-shrink-0">{niveau}</span>
                          <div className="flex flex-wrap gap-1">
                            {classes.map(({ classe, eleves: classeEleves }) => (
                              <button
                                key={classe}
                                type="button"
                                onClick={() => setLinkActiveClass(linkActiveClass === classe ? null : classe)}
                                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all border ${
                                  linkActiveClass === classe
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:border-primary/40 hover:bg-accent"
                                }`}
                              >
                                {classe} <span className={linkActiveClass === classe ? "opacity-80" : "text-muted-foreground"}>({classeEleves.length})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Liste des élèves de la classe sélectionnée */}
                {linkActiveGroup && linkActiveClass && (
                  <div className="max-h-56 overflow-y-auto p-2 space-y-0.5">
                    {groupElevesByLevel(eleves)
                      .find((g) => g.group === linkActiveGroup)
                      ?.classesByNiveau.flatMap((n) => n.classes)
                      .find((c) => c.classe === linkActiveClass)
                      ?.eleves.map((el) => {
                        const parent = parents.find((p) => p.id === linkingParent);
                        const alreadyLinked = parent?.enfants.some((ep) => ep.eleve.id === el.id);
                        return (
                          <label
                            key={el.id}
                            className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${
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
                            <span className="flex-1">{el.prenom} {el.nom}</span>
                            {alreadyLinked && <Badge variant="secondary" className="text-xs">{t("alreadyLinked")}</Badge>}
                          </label>
                        );
                      })}
                  </div>
                )}

                {(!linkActiveGroup || !linkActiveClass) && (
                  <div className="text-center py-6 text-muted-foreground text-xs">
                    {!linkActiveGroup
                      ? t("selectLevel")
                      : t("selectClass")}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-2"
                onClick={() => handleLink(linkingParent)}
                disabled={isPending || selectedEleves.length === 0}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {t("linkBtn", { count: selectedEleves.length })}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setLinkingParent(null); setSelectedEleves([]); }}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
