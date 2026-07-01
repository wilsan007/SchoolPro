"use client";

import { useState } from "react";
import { Settings, Users, GraduationCap, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { EtablissementTab } from "./EtablissementTab";
import { UsersTab } from "./UsersTab";
import { ClassesTab } from "./ClassesTab";
import { MatieresTab } from "./MatieresTab";

type Tab = "etablissement" | "utilisateurs" | "classes" | "matieres";

const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
  { id: "etablissement", label: "Établissement", icon: Settings },
  { id: "utilisateurs", label: "Utilisateurs", icon: Users },
  { id: "classes", label: "Classes", icon: GraduationCap },
  { id: "matieres", label: "Matières", icon: BookOpen },
];

interface ParametresTabsProps {
  etablissement: NonNullable<Awaited<ReturnType<typeof import("@/lib/actions/parametres").getEtablissementData>>>;
  users: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getUsersForTenant>>;
  classes: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getClassesForSettings>>;
  matieres: Awaited<ReturnType<typeof import("@/lib/actions/parametres").getMatieresForSettings>>;
  canManage: boolean;
}

export function ParametresTabs({ etablissement, users, classes, matieres, canManage }: ParametresTabsProps) {
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
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "etablissement" && <EtablissementTab etablissement={etablissement} canManage={canManage} />}
      {activeTab === "utilisateurs" && <UsersTab users={users} canManage={canManage} />}
      {activeTab === "classes" && <ClassesTab classes={classes} canManage={canManage} />}
      {activeTab === "matieres" && <MatieresTab matieres={matieres} canManage={canManage} />}
    </div>
  );
}
