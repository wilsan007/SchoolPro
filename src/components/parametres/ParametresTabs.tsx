"use client";

import { useState } from "react";
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

type TabDef = { id: Tab; labelKey: string; icon: typeof Settings };

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
      { id: "etablissement", labelKey: "etablissement", icon: Settings },
      { id: "annees", labelKey: "anneesScolaires", icon: Calendar },
      { id: "calendrier", labelKey: "calendrierScolaire", icon: CalendarDays },
      { id: "sites", labelKey: "sites", icon: Building2 },
      { id: "import", labelKey: "importModeles", icon: Upload },
      { id: "signature", labelKey: "signature", icon: Stamp },
      { id: "sync", labelKey: "syncBackup", icon: HardDrive },
    ],
  },
  {
    groupKey: "groupUsers",
    icon: UsersRound,
    tabs: [
      { id: "utilisateurs", labelKey: "users", icon: Users },
      { id: "parents", labelKey: "parents", icon: UserCog },
      { id: "userPermissions", labelKey: "userPermissions", icon: ShieldCheck },
      { id: "doublons", labelKey: "doublons", icon: CopyCheck },
    ],
  },
  {
    groupKey: "groupPedagogie",
    icon: BookOpenCheck,
    tabs: [
      { id: "classes", labelKey: "classes", icon: GraduationCap },
      { id: "matieres", labelKey: "matieres", icon: BookOpen },
      { id: "enseignants", labelKey: "enseignantsAffectation", icon: ClipboardList },
      { id: "salles", labelKey: "salles", icon: DoorOpen },
      { id: "disponibilites", labelKey: "disponibilites", icon: CalendarClock },
      { id: "appreciations", labelKey: "appreciations", icon: Settings2 },
      { id: "periodes", labelKey: "periodes", icon: Calendar },
    ],
  },
  {
    groupKey: "groupFinance",
    icon: DollarSign,
    tabs: [
      { id: "tarifs", labelKey: "tarifs", icon: DollarSign },
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
  availableTenants,
}: ParametresTabsProps) {
  const t = useTranslations("parametres");
  const [activeTab, setActiveTab] = useState<Tab>("etablissement");

  // Trouver le groupe actif
  const activeGroup = tabGroups.find((g) => g.tabs.some((tab) => tab.id === activeTab)) ?? tabGroups[0];
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
        {tabGroups.map((group) => (
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
          {tabGroups
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
