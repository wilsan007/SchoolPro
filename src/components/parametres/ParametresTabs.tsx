"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings, Users, GraduationCap, BookOpen, UserCog, Settings2, Calendar, Stamp, Building2 } from "lucide-react";
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

import type { AvailableTenant } from "@/auth.config";

type Tab =
  | "etablissement"
  | "utilisateurs"
  | "parents"
  | "classes"
  | "matieres"
  | "appreciations"
  | "periodes"
  | "signature"
  | "sites";

const tabs: { id: Tab; labelKey: string; icon: typeof Settings }[] = [
  { id: "etablissement", labelKey: "etablissement", icon: Settings },
  { id: "utilisateurs", labelKey: "users", icon: Users },
  { id: "parents", labelKey: "parents", icon: UserCog },
  { id: "classes", labelKey: "classes", icon: GraduationCap },
  { id: "matieres", labelKey: "matieres", icon: BookOpen },
  { id: "appreciations", labelKey: "appreciations", icon: Settings2 },
  { id: "periodes", labelKey: "periodes", icon: Calendar },
  { id: "signature", labelKey: "signature", icon: Stamp },
  { id: "sites", labelKey: "sites", icon: Building2 },
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
  canManage,
  availableTenants,
}: ParametresTabsProps) {
  const t = useTranslations("parametres");
  const [activeTab, setActiveTab] = useState<Tab>("etablissement");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "etablissement" && <EtablissementTab etablissement={etablissement} canManage={canManage} />}
      {activeTab === "utilisateurs" && <UsersTab users={users} canManage={canManage} availableTenants={availableTenants} />}
      {activeTab === "parents" && <ParentsTab parents={parents} eleves={eleves} canManage={canManage} />}
      {activeTab === "classes" && <ClassesTab classes={classes} canManage={canManage} />}
      {activeTab === "matieres" && <MatieresTab matieres={matieres} canManage={canManage} />}
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
    </div>
  );
}
