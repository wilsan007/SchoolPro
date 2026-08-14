"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TenantSwitcher } from "./TenantSwitcher";
import { SiteSwitcher } from "./SiteSwitcher";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  BookOpen,
  Target,
  Sparkles,
  Gauge,
  HandHeart,
  Calendar,
  GraduationCap,
  MessageSquare,
  Receipt,
  Settings,
  School,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserCheck,
  BarChart3,
  Shield,
  UserPlus,
  Briefcase,
  Bell,
  FileText,
  Compass,
  Archive,
  Package,
  Crown,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { canAccessRoute } from "@/lib/permissions";
import { accueilPourRole } from "@/lib/accueil-par-role";

/**
 * Un élément de menu ne porte plus de liste de rôles. Sa visibilité est
 * déduite de `canAccessRoute`, la même fonction qui décide dans le middleware
 * et dans `guardPage`. Les listes codées en dur ici divergeaient de la matrice
 * de permissions : un parent voyait « Élèves », « Notes » et « Absences » —
 * les entrées sans `roles` étaient affichées à tout le monde.
 */
type NavItem = {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  color: string;
};

type NavGroup = {
  groupKey: string | null;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    groupKey: null,
    items: [
      { labelKey: "dashboard", icon: LayoutDashboard, href: "/dashboard", color: "text-blue-500" },
      { labelKey: "direction", icon: Gauge, href: "/direction", color: "text-sky-600" },
      { labelKey: "monEspace", icon: Briefcase, href: "/mon-espace", color: "text-emerald-600" },
      { labelKey: "maClasse", icon: Users, href: "/ma-classe", color: "text-teal-600" },
      // Espaces personnels : ces écrans se résolvent par le périmètre
      // relationnel de celui qui est connecté. Ils n'ont rien à montrer à un
      // adulte de l'établissement qui les visiterait — d'où le rôle unique.
      { labelKey: "monParcours", icon: HandHeart, href: "/parent", color: "text-pink-500" },
      { labelKey: "monParcoursEleve", icon: Target, href: "/eleve", color: "text-violet-500" },
      { labelKey: "monEmploi", icon: Calendar, href: "/mon-emploi", color: "text-cyan-500" },
      { labelKey: "entrainement", icon: Sparkles, href: "/entrainement", color: "text-amber-500" },
      // Espaces dédiés par métier — chacun est l'accueil d'un rôle qui n'avait
      // pas d'espace à lui. La visibilité est déduite de `canAccessRoute`,
      // comme pour tout le reste du menu.
      { labelKey: "secretariat", icon: FileText, href: "/secretariat", color: "text-teal-600" },
      { labelKey: "conseiller", icon: Compass, href: "/conseiller", color: "text-indigo-600" },
      { labelKey: "infirmerie", icon: HandHeart, href: "/infirmerie", color: "text-rose-500" },
      { labelKey: "comptabilite", icon: Receipt, href: "/comptabilite", color: "text-emerald-600" },
    ],
  },
  {
    groupKey: "groupPedagogie",
    items: [
      { labelKey: "eleves", icon: Users, href: "/eleves", color: "text-violet-500" },
      { labelKey: "notes", icon: BookOpen, href: "/notes", color: "text-green-500" },
      { labelKey: "curriculum", icon: Target, href: "/curriculum", color: "text-fuchsia-500" },
      { labelKey: "recommandations", icon: Sparkles, href: "/recommandations", color: "text-rose-500" },
      { labelKey: "examens", icon: GraduationCap, href: "/evaluations", color: "text-yellow-500" },
      { labelKey: "cours", icon: PlayCircle, href: "/cours", color: "text-indigo-500" },
      { labelKey: "emploi", icon: Calendar, href: "/emploi-du-temps", color: "text-cyan-500" },
    ],
  },
  {
    groupKey: "groupVieScolaire",
    items: [
      { labelKey: "absences", icon: ClipboardList, href: "/absences", color: "text-orange-500" },
      { labelKey: "vieScolaire", icon: Shield, href: "/vie-scolaire", color: "text-red-500" },
      { labelKey: "parents", icon: UserCheck, href: "/parents", color: "text-pink-500" },
    ],
  },
  {
    groupKey: "groupGestion",
    items: [
      { labelKey: "admissions", icon: UserPlus, href: "/admissions", color: "text-teal-500" },
      { labelKey: "facturation", icon: Receipt, href: "/facturation", color: "text-emerald-500" },
      { labelKey: "rh", icon: Briefcase, href: "/rh", color: "text-amber-500" },
      { labelKey: "inventaire", icon: Package, href: "/inventaire", color: "text-stone-500" },
    ],
  },
  {
    groupKey: "groupCommunication",
    items: [
      { labelKey: "messages", icon: MessageSquare, href: "/messages", color: "text-indigo-500" },
      { labelKey: "communication", icon: Bell, href: "/communication", color: "text-sky-500" },
    ],
  },
  {
    groupKey: "groupRapports",
    items: [
      { labelKey: "rapports", icon: FileText, href: "/rapports", color: "text-slate-500" },
      { labelKey: "analytics", icon: BarChart3, href: "/analytics", color: "text-red-500" },
      { labelKey: "orientation", icon: Compass, href: "/orientation", color: "text-lime-600" },
      { labelKey: "alumni", icon: Archive, href: "/alumni", color: "text-purple-500" },
    ],
  },
  {
    groupKey: null,
    items: [
      { labelKey: "superAdmin", icon: Crown, href: "/super-admin", color: "text-yellow-500" },
    ],
  },
];

interface SidebarProps {
  userName?: string;
  userRole?: string;
  userAvatar?: string;
  tenantName?: string;
  tenantId?: string | null;
  isSuperAdmin?: boolean;
  roleKey?: string;
  availableTenants?: import("@/auth.config").AvailableTenant[];
  sites?: { id: string; nom: string; code?: string | null }[];
  currentSiteId?: string | null;
  isSiteAdmin?: boolean;
}

export function Sidebar({ userName = "Admin", userRole = "Directeur", userAvatar, tenantName = "Mon École", tenantId, isSuperAdmin = false, roleKey = "TENANT_ADMIN", availableTenants = [], sites = [], currentSiteId = null, isSiteAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    function handleCollapse(e: Event) {
      const detail = (e as CustomEvent<{ collapse: boolean }>).detail;
      setCollapsed(detail.collapse);
    }
    window.addEventListener("sidebar-collapse", handleCollapse as EventListener);
    return () => window.removeEventListener("sidebar-collapse", handleCollapse as EventListener);
  }, []);

  const filteredGroups = useMemo(() =>
    navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          // `/dashboard` est un aiguillage : les rôles qui ont un accueil
          // dédié (`accueilPourRole` non null) y sont redirigés automatiquement.
          // Afficher l'entrée ne mènerait qu'à un rebond — on la masque.
          if (item.href === "/dashboard" && accueilPourRole(roleKey)) return false;
          return canAccessRoute(roleKey, item.href);
        }),
      }))
      .filter((group) => group.items.length > 0),
    [roleKey]
  );

  const isItemActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const isGroupActive = (items: NavItem[]) =>
    items.some((item) => isItemActive(item.href));

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const wasOpen = prev[key] ?? false;
      if (wasOpen) {
        return { ...prev, [key]: false };
      }
      return { [key]: true };
    });
  }

  return (
    <aside
      className={cn(
        "relative flex flex-col h-screen bg-slate-950 text-slate-100 transition-all duration-300 ease-in-out border-r border-slate-800/60 shadow-xl shadow-indigo-950/10 print:hidden",
        collapsed ? "w-20" : "w-72"
      )}
    >
      {/* Logo & École */}
      <div className="flex items-center gap-3 px-5 py-7 border-b border-slate-800/40 bg-slate-950/40">
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 transform hover:scale-105 transition-transform duration-300">
          <School className="w-6 h-6 text-white animate-pulse" />
        </div>
        {!collapsed && (
          <div className="overflow-visible animate-fade-in">
            <p className="text-base font-extrabold bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200 bg-clip-text text-transparent tracking-wide leading-none">
              EcolPro
            </p>
            <TenantSwitcher currentTenantName={tenantName} currentTenantId={tenantId} availableTenants={availableTenants} />
            <SiteSwitcher currentSiteId={currentSiteId} sites={sites} isAdmin={isSiteAdmin} />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {filteredGroups.map((group, gi) => {
          if (!group.groupKey) {
            return group.items.map((item) => {
              const isActive = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all duration-300 ease-out group relative overflow-hidden",
                    isActive
                      ? "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-lg shadow-indigo-600/15"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60"
                  )}
                >
                  <span className={cn(
                    "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-400 to-pink-500 transition-transform duration-300 scale-y-0 origin-center rounded-r-md",
                    isActive ? "scale-y-100" : "group-hover:scale-y-50"
                  )} />
                  <item.icon
                    className={cn(
                      "flex-shrink-0 w-5 h-5 transition-all duration-300 transform group-hover:scale-110",
                      isActive ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" : item.color
                    )}
                  />
                  {!collapsed && (
                    <span className={cn(
                      "truncate transition-transform duration-300 group-hover:translate-x-0.5",
                      isActive ? "font-semibold tracking-wide" : ""
                    )}>
                      {t(item.labelKey)}
                    </span>
                  )}
                </Link>
              );
            });
          }

          const groupKey = group.groupKey!;
          const groupActive = isGroupActive(group.items);
          const isOpen = openGroups[groupKey] ?? groupActive;

          return (
            <div key={groupKey} className={cn("space-y-1", gi > 0 && "mt-3")}>
              <button
                onClick={() => toggleGroup(groupKey)}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-200 group",
                  groupActive
                    ? "text-indigo-300"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-900/40"
                )}
              >
                {!collapsed ? (
                  <>
                    <span className="flex-1 text-left">{t(groupKey)}</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform duration-200",
                        isOpen ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </>
                ) : (
                  <span className="flex-1" />
                )}
              </button>
              {!collapsed && isOpen && (
                <div className="space-y-1 pl-1 mt-1">
                  {group.items.map((item) => {
                    const isActive = isItemActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-300 ease-out group relative overflow-hidden",
                          isActive
                            ? "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-lg shadow-indigo-600/15"
                            : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60"
                        )}
                      >
                        <span className={cn(
                          "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-400 to-pink-500 transition-transform duration-300 scale-y-0 origin-center rounded-r-md",
                          isActive ? "scale-y-100" : "group-hover:scale-y-50"
                        )} />
                        <item.icon
                          className={cn(
                            "flex-shrink-0 w-[18px] h-[18px] transition-all duration-300 transform group-hover:scale-110",
                            isActive ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" : item.color
                          )}
                        />
                        <span className={cn(
                          "truncate transition-transform duration-300 group-hover:translate-x-0.5",
                          isActive ? "font-semibold tracking-wide" : ""
                        )}>
                          {t(item.labelKey)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
              {/* Collapsed mode: show icons only */}
              {collapsed && group.items.map((item) => {
                const isActive = isItemActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-center px-2 py-3 rounded-xl text-sm font-medium transition-all duration-300 group relative",
                      isActive
                        ? "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-lg shadow-indigo-600/15"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "flex-shrink-0 w-5 h-5 transition-all duration-300 transform group-hover:scale-110",
                        isActive ? "text-white" : item.color
                      )}
                    />
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Paramètres — même règle que le reste du menu : le lien n'apparaît
          que pour les rôles qui peuvent réellement ouvrir la page. */}
      {canAccessRoute(roleKey, "/parametres") && (
      <div className="px-3 pb-4 border-t border-slate-800/40 pt-4">
        <Link
          href="/parametres"
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all duration-300 text-slate-400 hover:bg-slate-900/60 hover:text-slate-100 group relative",
            pathname.startsWith("/parametres") && "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-lg shadow-indigo-600/15"
          )}
        >
          <Settings className="flex-shrink-0 w-5 h-5 transition-transform duration-300 group-hover:rotate-45" />
          {!collapsed && <span>{t("parametres")}</span>}
        </Link>
      </div>
      )}

      {/* Profil utilisateur */}
      {!collapsed && (
        <div className="p-5 border-t border-slate-800/40 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-500" />
              <Avatar className="relative h-9 w-9 flex-shrink-0 border border-slate-800">
                {userAvatar && <AvatarImage src={userAvatar} alt={userName} />}
                <AvatarFallback className="bg-gradient-to-tr from-indigo-600 to-purple-600 text-white text-xs font-bold">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold text-slate-100 truncate">{userName}</p>
              <p className="text-xs text-indigo-300/50 truncate mt-0.5 font-medium">{userRole}</p>
            </div>
          </div>
        </div>
      )}

      {/* Bouton collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center hover:bg-slate-800 transition-all duration-200 z-10 hover:scale-110 active:scale-95 shadow-md shadow-black/20"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
        )}
      </button>
    </aside>
  );
}
