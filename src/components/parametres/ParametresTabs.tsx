"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Settings, Users, GraduationCap, BookOpen, UserCog, Settings2, Calendar, CalendarDays, Stamp, Building2,
  School, UsersRound, BookOpenCheck, ChevronDown, DollarSign, CopyCheck, HardDrive, ShieldCheck,
  DoorOpen, ClipboardList, CalendarClock, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EtablissementTab } from "./EtablissementTab";
import { UsersTab } from "./UsersTab";
import { ClassesTab } from "./ClassesTab";
import { MatieresTab } from "./MatieresTab";
import { ParentsTab } from "./ParentsTab";
import { ReglesAppreciationManager } from "./ReglesAppreciationManager";
import { PeriodesClotureManager } from "./PeriodesClotureManager";
import { SignatureCachetManager } from "./SignatureCachetManager";
import { SitesTab } from "./SitesTab";
import { TarifsTab } from "./TarifsTab";
import { DoublonsTab } from "./DoublonsTab";
import { AnneesScolairesTab } from "./AnneesScolairesTab";
import { CalendrierScolaireTab } from "./CalendrierScolaireTab";
import { SyncTab } from "./SyncTab";
import { UserPermissionsTab } from "./UserPermissionsTab";
import { SallesTab } from "./SallesTab";
import { EnseignantsAffectationTab } from "./EnseignantsAffectationTab";
import { DisponibilitesTab } from "./DisponibilitesTab";
import { ImportModelesTab } from "./ImportModelesTab";

import type { AvailableTenant } from "@/auth.config";
import { roleHasPermission, type Permission } from "@/lib/permissions";

type Tab =
  | "etablissement"
  | "annees"
  | "calendrier"
  | "utilisateurs"
  | "parents"
  | "classes"
  | "matieres"
  | "enseignants"
  | "salles"
  | "disponibilites"
  | "appreciations"
  | "periodes"
  | "signature"
  | "sites"
  | "import"
  | "tarifs"
  | "doublons"
  | "sync"
  | "userPermissions";

/**
 * `perm` est la permission exigée par les **écritures** de l'onglet — celle que
 * réclament déjà son API ou sa Server Action. `null` signifie « aucune exigence
 * propre » : l'onglet est consultable dès lors que `/parametres` est ouvert, et
 * `canManage` neutralise ses boutons.
 *
 * Un onglet dont l'écriture est refusée n'est plus affiché du tout : avant,
 * un comptable voyait « Permissions utilisateur », « Synchronisation » ou
 * « Signature » et remplissait des formulaires qui répondaient 403.
 */
type TabDef = { id: Tab; labelKey: string; icon: typeof Settings; perm: Permission | null };

type TabGroup = {
  groupKey: string;
  icon: typeof Settings;
  tabs: TabDef[];
};

const tabGroups: TabGroup[] = [
  {
    groupKey: "groupEtablissement",
    icon: School,
    tabs: [
      { id: "etablissement", labelKey: "etablissement", icon: Settings, perm: null },
      { id: "annees", labelKey: "anneesScolaires", icon: Calendar, perm: null },
      { id: "calendrier", labelKey: "calendrierScolaire", icon: CalendarDays, perm: null },
      { id: "sites", labelKey: "sites", icon: Building2, perm: "parametres:admin" },
      { id: "import", labelKey: "importModeles", icon: Upload, perm: "parametres:admin" },
      { id: "signature", labelKey: "signature", icon: Stamp, perm: "parametres:admin" },
      { id: "sync", labelKey: "syncBackup", icon: HardDrive, perm: "parametres:admin" },
    ],
  },
  {
    groupKey: "groupUsers",
    icon: UsersRound,
    tabs: [
      { id: "utilisateurs", labelKey: "users", icon: Users, perm: null },
      { id: "parents", labelKey: "parents", icon: UserCog, perm: null },
      { id: "userPermissions", labelKey: "userPermissions", icon: ShieldCheck, perm: "parametres:admin" },
      { id: "doublons", labelKey: "doublons", icon: CopyCheck, perm: "parametres:admin" },
    ],
  },
  {
    groupKey: "groupPedagogie",
    icon: BookOpenCheck,
    tabs: [
      { id: "classes", labelKey: "classes", icon: GraduationCap, perm: null },
      { id: "matieres", labelKey: "matieres", icon: BookOpen, perm: null },
      { id: "enseignants", labelKey: "enseignantsAffectation", icon: ClipboardList, perm: null },
      { id: "salles", labelKey: "salles", icon: DoorOpen, perm: null },
      { id: "disponibilites", labelKey: "disponibilites", icon: CalendarClock, perm: null },
      { id: "appreciations", labelKey: "appreciations", icon: Settings2, perm: "parametres:write" },
      { id: "periodes", labelKey: "periodes", icon: Calendar, perm: "parametres:write" },
    ],
  },
  {
    groupKey: "groupFinance",
    icon: DollarSign,
    tabs: [
      { id: "tarifs", labelKey: "tarifs", icon: DollarSign, perm: "tarifs:gerer" },
    ],
  },
];

interface ParametresTabsProps {
  etablissement: NonNullable<Awaited<ReturnType<typeof import("@/lib/actions/parametres").getEtablissementData>>>;
  users: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getUsersForTenant>>;
  parents: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getParentsForSettings>>;
  eleves: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getElevesForLinking>>;
  classes: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getClassesForSettings>>;
  matieres: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getMatieresForSettings>>;
  regles: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getReglesAppreciation>>;
  periodes: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getPeriodesForCloture>>;
  sites: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getSitesForSettings>>;
  annees: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getAnneesScolaires>>;
  canManage: boolean;
  /** Rôle actif : décide quels onglets sont affichés (cf. `TabDef.perm`). */
  roleKey: string;
  availableTenants?: AvailableTenant[];
}

export function ParametresTabs({
  etablissement,
  users,
  parents,
  eleves,
  classes,
  matieres,
  regles,
  periodes,
  sites,
  annees,
  canManage,
  roleKey,
  availableTenants,
}: ParametresTabsProps) {
  const t = useTranslations("parametres");
  const [activeTab, setActiveTab] = useState<Tab>("etablissement");

  // Un onglet dont les écritures sont refusées au rôle n'est **pas affiché** :
  // c'est la même règle que le menu — on ne montre pas ce qui mènera à un refus.
  const groupes = useMemo(
    () =>
      tabGroups
        .map((g) => ({
          ...g,
          tabs: g.tabs.filter(
            (tab) => tab.perm === null || roleHasPermission(roleKey, tab.perm)
          ),
        }))
        .filter((g) => g.tabs.length > 0),
    [roleKey]
  );

  // Trouver le groupe actif
  const activeGroup = groupes.find((g) => g.tabs.some((tab) => tab.id === activeTab)) ?? groupes[0];
  const [activeGroupId, setActiveGroupId] = useState(activeGroup.groupKey);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(activeGroup.groupKey);

  // Quand on change de groupe, activer le premier sous-onglet
  function handleGroupClick(group: TabGroup) {
    setActiveGroupId(group.groupKey);
    setExpandedGroup(expandedGroup === group.groupKey ? null : group.groupKey);
    if (expandedGroup !== group.groupKey) {
      setActiveTab(group.tabs[0].id);
    }
  }

  return (
    <div className="space-y-4">
      {/* Niveau 1: Onglets de groupe */}
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
        {groupes.map((group) => (
          <button
            key={group.groupKey}
            onClick={() => handleGroupClick(group)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              activeGroupId === group.groupKey
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <group.icon className="h-4 w-4" />
            {t(group.groupKey)}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expandedGroup === group.groupKey && "rotate-180"
              )}
            />
          </button>
        ))}
      </div>

      {/* Niveau 2: Sous-onglets du groupe actif */}
      {expandedGroup && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin border-b pb-px">
          {groupes
            .find((g) => g.groupKey === expandedGroup)
            ?.tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {t(tab.labelKey)}
              </button>
            ))}
        </div>
      )}

      {/* Contenu de l'onglet actif */}
      <div>
        {activeTab === "etablissement" && <EtablissementTab etablissement={etablissement} canManage={canManage} />}
        {activeTab === "annees" && <AnneesScolairesTab annees={annees} canManage={canManage} />}
        {activeTab === "calendrier" && <CalendrierScolaireTab annees={annees} canManage={canManage} />}
        {activeTab === "utilisateurs" && <UsersTab users={users} canManage={canManage} availableTenants={availableTenants} sites={sites} classes={classes} matieres={matieres} />}
        {activeTab === "parents" && <ParentsTab parents={parents} eleves={eleves} canManage={canManage} />}
        {activeTab === "classes" && <ClassesTab classes={classes} canManage={canManage} sites={sites} />}
        {activeTab === "matieres" && <MatieresTab matieres={matieres} canManage={canManage} />}
        {activeTab === "enseignants" && (
          <EnseignantsAffectationTab classes={classes} matieres={matieres} canManage={canManage} />
        )}
        {activeTab === "salles" && <SallesTab sites={sites} canManage={canManage} />}
        {activeTab === "disponibilites" && <DisponibilitesTab canManage={canManage} />}
        {activeTab === "appreciations" && <ReglesAppreciationManager regles={regles} />}
        {activeTab === "periodes" && (
          <PeriodesClotureManager
            periodes={periodes.map((p) => ({
              id: p.id,
              nom: p.nom,
              numero: p.numero,
              dateDebut: p.dateDebut.toISOString(),
              dateFin: p.dateFin.toISOString(),
              isCurrent: p.isCurrent,
              statut: p.statut,
              cloturedAt: p.cloturedAt ? p.cloturedAt.toISOString() : null,
              dateLimiteSaisie: p.dateLimiteSaisie ? p.dateLimiteSaisie.toISOString() : null,
            }))}
          />
        )}
        {activeTab === "signature" && (
          <SignatureCachetManager
            tenant={{
              name: etablissement.name,
              chefEtablissement: etablissement.chefEtablissement,
              signatureUrl: etablissement.signatureUrl,
              cachetUrl: etablissement.cachetUrl,
            }}
          />
        )}
        {activeTab === "sites" && <SitesTab sites={sites} canManage={canManage} />}
        {activeTab === "import" && <ImportModelesTab canManage={canManage} />}
        {activeTab === "sync" && <SyncTab canManage={canManage} />}
        {activeTab === "tarifs" && <TarifsTab />}
        {activeTab === "doublons" && <DoublonsTab />}
        {activeTab === "userPermissions" && (
          <UserPermissionsTab
            users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))}
          />
        )}
      </div>
    </div>
  );
}
