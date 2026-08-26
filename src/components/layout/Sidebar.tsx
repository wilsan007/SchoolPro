"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TenantSwitcher } from "./TenantSwitcher";
import { SiteSwitcher } from "./SiteSwitcher";
import { RoleSwitcher } from "./RoleSwitcher";
import { useWindowManager } from "@/components/workspace/WindowManager";
import type { Role } from "@prisma/client";
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
  ShieldCheck,
  UserPlus,
  Briefcase,
  Bell,
  FileText,
  Compass,
  Archive,
  Package,
  Crown,
  PlayCircle,
  ListTodo,
  NotebookPen,
  Sun,
  Wrench,
  ClipboardCheck,
  BookOpenCheck,
  Grid3x3,
  GitCompare,
  Wallet,
  Gavel,
  HeartHandshake,
  CheckSquare,
  Activity,
  Brain,
  RefreshCw,
  IdCard,
  Award,
  UserCog,
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
  /** Couleur d'accent du groupe (HSL) — teinte l'en-tête et le liseré gauche. */
  groupAccent?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    groupKey: null,
    items: [
      { labelKey: "dashboard", icon: LayoutDashboard, href: "/dashboard", color: "text-primary" },
      { labelKey: "direction", icon: Gauge, href: "/direction", color: "text-primary" },
      // Chatbot direction temporairement invisible (CHATBOT_DIRECTION_ACTIF = false).
      // La route et la règle de permissions sont conservées pour une réactivation
      // propre après enrichissement du catalogue de questions fermées.
      // { labelKey: "chatbotDirection", icon: BarChart3, href: "/chatbot-direction", color: "text-primary" },
      { labelKey: "monEspace", icon: Briefcase, href: "/mon-espace", color: "text-info" },
      { labelKey: "maClasse", icon: Users, href: "/ma-classe", color: "text-info" },
      { labelKey: "maMatiere", icon: Target, href: "/ma-matiere", color: "text-accent" },
      { labelKey: "couverture", icon: ShieldCheck, href: "/couverture", color: "text-primary" },
      { labelKey: "devoirs", icon: NotebookPen, href: "/devoirs", color: "text-accent" },
      // Espaces personnels : ces écrans se résolvent par le périmètre
      // relationnel de celui qui est connecté. Ils n'ont rien à montrer à un
      // adulte de l'établissement qui les visiterait — d'où le rôle unique.
      { labelKey: "monParcours", icon: HandHeart, href: "/parent", color: "text-accent" },
      { labelKey: "monParcoursEleve", icon: Target, href: "/eleve", color: "text-accent" },
      { labelKey: "monEmploi", icon: Calendar, href: "/mon-emploi", color: "text-info" },
      { labelKey: "travail", icon: ListTodo, href: "/travail", color: "text-accent" },
      { labelKey: "maJournee", icon: Sun, href: "/ma-journee", color: "text-primary" },
      { labelKey: "entrainement", icon: Sparkles, href: "/entrainement", color: "text-primary" },
      { labelKey: "revisionSemaine", icon: BookOpenCheck, href: "/revision-semaine", color: "text-info" },
      // Espaces dédiés par métier — chacun est l'accueil d'un rôle qui n'avait
      // pas d'espace à lui. La visibilité est déduite de `canAccessRoute`,
      // comme pour tout le reste du menu.
      { labelKey: "secretariat", icon: FileText, href: "/secretariat", color: "text-info" },
      { labelKey: "conseiller", icon: Compass, href: "/conseiller", color: "text-accent" },
      { labelKey: "infirmerie", icon: HandHeart, href: "/infirmerie", color: "text-accent" },
      { labelKey: "comptabilite", icon: Receipt, href: "/comptabilite", color: "text-info" },
      { labelKey: "exploitation", icon: Wrench, href: "/exploitation", color: "text-sidebar-foreground/60" },
      { labelKey: "inspection", icon: ClipboardCheck, href: "/inspection", color: "text-primary" },
    ],
  },
  {
    groupKey: "groupPedagogie",
    groupAccent: "258 58% 58%",
    items: [
      { labelKey: "eleves", icon: Users, href: "/eleves", color: "text-accent" },
      { labelKey: "transfertClasses", icon: RefreshCw, href: "/eleves/transfert", color: "text-accent" },
      { labelKey: "cartesScolaires", icon: IdCard, href: "/eleves/cartes", color: "text-accent" },
      { labelKey: "attestations", icon: Award, href: "/eleves/attestations", color: "text-accent" },
      { labelKey: "comptesEleves", icon: UserCog, href: "/eleves/comptes", color: "text-accent" },
      { labelKey: "notes", icon: BookOpen, href: "/notes", color: "text-info" },
      { labelKey: "cahierJournal", icon: NotebookPen, href: "/cahier-journal", color: "text-accent" },
      { labelKey: "curriculum", icon: Target, href: "/curriculum", color: "text-accent" },
      { labelKey: "recommandations", icon: Sparkles, href: "/recommandations", color: "text-accent" },
      // LEARNOS — IA générative (proposé par l'IA, validé par l'enseignant puis la direction)
      { labelKey: "plansLecon", icon: BookOpenCheck, href: "/plans-lecon", color: "text-accent" },
      { labelKey: "rubriquesEvaluation", icon: Grid3x3, href: "/rubriques-evaluation", color: "text-accent" },
      { labelKey: "propositionsIa", icon: ClipboardCheck, href: "/propositions-ia", color: "text-info" },
      { labelKey: "examens", icon: GraduationCap, href: "/evaluations", color: "text-primary" },
      { labelKey: "sessionsExamens", icon: ClipboardCheck, href: "/examens", color: "text-primary" },
      { labelKey: "conseilAugmente", icon: Brain, href: "/conseil-augmente", color: "text-accent" },
      { labelKey: "mentorat", icon: HeartHandshake, href: "/mentorat", color: "text-accent" },
      { labelKey: "cours", icon: PlayCircle, href: "/cours", color: "text-accent" },
      { labelKey: "emploi", icon: Calendar, href: "/emploi-du-temps", color: "text-info" },
      { labelKey: "fournitures", icon: Package, href: "/fournitures", color: "text-primary" },
    ],
  },
  {
    groupKey: "groupVieScolaire",
    groupAccent: "346 78% 57%",
    items: [
      { labelKey: "absences", icon: ClipboardList, href: "/absences", color: "text-primary" },
      { labelKey: "veilleAssiduite", icon: Activity, href: "/veille-assiduite", color: "text-primary" },
      { labelKey: "vieScolaire", icon: Shield, href: "/vie-scolaire", color: "text-destructive" },
      { labelKey: "parents", icon: UserCheck, href: "/parents", color: "text-accent" },
    ],
  },
  {
    groupKey: "groupGestion",
    groupAccent: "243 75% 59%",
    items: [
      { labelKey: "admissions", icon: UserPlus, href: "/admissions", color: "text-info" },
      { labelKey: "reinscription", icon: RefreshCw, href: "/parametres/reinscription", color: "text-primary" },
      { labelKey: "facturation", icon: Receipt, href: "/facturation", color: "text-info" },
      { labelKey: "caisse", icon: Wallet, href: "/caisse", color: "text-info" },
      { labelKey: "rh", icon: Briefcase, href: "/rh", color: "text-primary" },
      { labelKey: "inventaire", icon: Package, href: "/inventaire", color: "text-muted-foreground" },
      { labelKey: "gouvernance", icon: Gavel, href: "/gouvernance", color: "text-sidebar-foreground/70" },
    ],
  },
  {
    groupKey: "groupCommunication",
    groupAccent: "199 89% 48%",
    items: [
      { labelKey: "messages", icon: MessageSquare, href: "/messages", color: "text-accent" },
      { labelKey: "communication", icon: Bell, href: "/communication", color: "text-primary" },
    ],
  },
  {
    groupKey: "groupRapports",
    groupAccent: "188 60% 42%",
    items: [
      { labelKey: "rapports", icon: FileText, href: "/rapports", color: "text-sidebar-foreground/60" },
      { labelKey: "analytics", icon: BarChart3, href: "/analytics", color: "text-destructive" },
      { labelKey: "intelligence", icon: Brain, href: "/intelligence", color: "text-accent" },
      { labelKey: "comparateur", icon: GitCompare, href: "/comparateur", color: "text-info" },
      { labelKey: "orientation", icon: Compass, href: "/orientation", color: "text-info" },
      { labelKey: "alumni", icon: Archive, href: "/alumni", color: "text-accent" },
    ],
  },
  {
    groupKey: null,
    items: [
      { labelKey: "taches", icon: CheckSquare, href: "/taches", color: "text-sidebar-foreground/60" },
      { labelKey: "superAdmin", icon: Crown, href: "/super-admin", color: "text-primary" },
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
  /** Rôles possédés par l'utilisateur dans le tenant actif. */
  availableRoles?: Role[];
  /** Rôle actuellement actif. */
  currentRole?: Role;
}

export function Sidebar({ userName = "Admin", userRole = "Directeur", userAvatar, tenantName = "Mon École", tenantId, isSuperAdmin = false, roleKey = "TENANT_ADMIN", availableTenants = [], sites = [], currentSiteId = null, isSiteAdmin = false, availableRoles = [], currentRole }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { openWindow, windows, activeWindowId } = useWindowManager();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function handleCollapse(e: Event) {
      const detail = (e as CustomEvent<{ collapse: boolean }>).detail;
      setCollapsed(detail.collapse);
    }
    function handleMobileToggle() {
      setMobileOpen((prev) => !prev);
    }
    function handleMobileClose() {
      setMobileOpen(false);
    }
    window.addEventListener("sidebar-collapse", handleCollapse as EventListener);
    window.addEventListener("sidebar-mobile-toggle", handleMobileToggle);
    window.addEventListener("sidebar-mobile-close", handleMobileClose);
    return () => {
      window.removeEventListener("sidebar-collapse", handleCollapse as EventListener);
      window.removeEventListener("sidebar-mobile-toggle", handleMobileToggle);
      window.removeEventListener("sidebar-mobile-close", handleMobileClose);
    };
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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

  // Active state : une fenêtre est-elle ouverte pour cette route ?
  const isItemActive = (href: string) =>
    windows.some((w) => w.route === href || w.route.startsWith(href + "/"));

  const isGroupActive = (items: NavItem[]) =>
    items.some((item) => isItemActive(item.href));

  // Ouvrir une fenêtre pour un item de navigation
  function handleOpenWindow(item: NavItem) {
    openWindow(item.href, t(item.labelKey), item.icon, item.color);
    setMobileOpen(false);
  }

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
    <>
    {/* Mobile backdrop */}
    {mobileOpen && (
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden print:hidden"
        onClick={() => setMobileOpen(false)}
      />
    )}
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out border-r border-sidebar-border/60 shadow-xl shadow-primary/5 print:hidden",
        // Mobile: fixed drawer, slide in/out
        "fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        // Desktop: inline sidebar with collapse
        collapsed ? "lg:w-[68px]" : "lg:w-[240px]",
        "w-[240px]"
      )}
    >
      {/* Logo & École */}
      <div className="flex items-center gap-3 px-5 py-7 border-b border-sidebar-border/40 bg-sidebar/40">
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-[0_4px_16px_rgba(0,140,200,0.3),0_0_20px_rgba(140,90,220,0.15)] transform hover:scale-105 transition-transform duration-300">
          <School className="w-6 h-6 text-white animate-pulse" />
        </div>
        {!collapsed && (
          <div className="overflow-visible animate-fade-in">
            <p className="text-base font-extrabold text-sidebar-foreground tracking-wide leading-none">
              SchoolPro
            </p>
            <TenantSwitcher currentTenantName={tenantName} currentTenantId={tenantId} availableTenants={availableTenants} />
            <SiteSwitcher currentSiteId={currentSiteId} sites={sites} isAdmin={isSiteAdmin} />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-sidebar-border scrollbar-track-transparent">
        {filteredGroups.map((group, gi) => {
          if (!group.groupKey) {
            return group.items.map((item) => {
              const isActive = isItemActive(item.href);
              return (
                <button
                  key={item.href}
                  onClick={() => handleOpenWindow(item)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl text-[15px] font-medium transition-all duration-300 ease-out group relative overflow-hidden w-full text-left",
                    isActive
                      ? "bg-gradient-to-r from-primary to-[hsl(200,55%,42%)] text-white shadow-[0_4px_16px_rgba(0,140,200,0.25)]"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/70"
                  )}
                >
                  <span className={cn(
                    "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-info transition-transform duration-300 scale-y-0 origin-center rounded-r-md",
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
                </button>
              );
            });
          }

          const groupKey = group.groupKey!;
          const groupActive = isGroupActive(group.items);
          const isOpen = openGroups[groupKey] ?? groupActive;
          const groupAccent = group.groupAccent;

          return (
            <div key={groupKey} className={cn("space-y-1", gi > 0 && "mt-3")}>
              <button
                onClick={() => toggleGroup(groupKey)}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-200 group relative",
                  groupActive
                    ? "text-sidebar-foreground"
                    : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
                style={
                  groupActive && groupAccent
                    ? { color: `hsl(${groupAccent})` }
                    : undefined
                }
              >
                {groupAccent && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-200"
                    style={{
                      backgroundColor: `hsl(${groupAccent})`,
                      boxShadow: groupActive ? `0 0 8px hsl(${groupAccent} / 0.6)` : "none",
                    }}
                  />
                )}
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
                      <button
                        key={item.href}
                        onClick={() => handleOpenWindow(item)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[14px] font-medium transition-all duration-300 ease-out group relative overflow-hidden w-full text-left",
                          isActive
                            ? "bg-gradient-to-r from-primary to-[hsl(200,55%,42%)] text-white shadow-[0_4px_16px_rgba(0,140,200,0.25)]"
                            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/70"
                        )}
                      >
                        <span className={cn(
                          "absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-info transition-transform duration-300 scale-y-0 origin-center rounded-r-md",
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
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Collapsed mode: show icons only */}
              {collapsed && group.items.map((item) => {
                const isActive = isItemActive(item.href);
                return (
                  <button
                    key={item.href}
                    onClick={() => handleOpenWindow(item)}
                    className={cn(
                      "flex items-center justify-center px-2 py-3 rounded-2xl text-sm font-medium transition-all duration-300 group relative w-full",
                      isActive
                        ? "bg-gradient-to-r from-primary to-[hsl(200,55%,42%)] text-white shadow-[0_4px_16px_rgba(0,140,200,0.25)]"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/70"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "flex-shrink-0 w-5 h-5 transition-all duration-300 transform group-hover:scale-110",
                        isActive ? "text-white" : item.color
                      )}
                    />
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Paramètres — même règle que le reste du menu : le lien n'apparaît
          que pour les rôles qui peuvent réellement ouvrir la page. */}
      {canAccessRoute(roleKey, "/parametres") && (
      <div className="px-3 pb-4 border-t border-sidebar-border/40 pt-4">
        <button
          onClick={() => openWindow("/parametres", t("parametres"), Settings, "text-sidebar-foreground/60")}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all duration-300 text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground group relative w-full text-left",
            isItemActive("/parametres") && "bg-gradient-to-r from-primary to-[hsl(200,55%,42%)] text-white shadow-[0_4px_16px_rgba(0,140,200,0.25)]"
          )}
        >
          <Settings className="flex-shrink-0 w-5 h-5 transition-transform duration-300 group-hover:rotate-45" />
          {!collapsed && <span>{t("parametres")}</span>}
        </button>
      </div>
      )}

      {/* Bascule de rôle — affichée uniquement si l'utilisateur possède
          plusieurs rôles dans le même établissement. */}
      {availableRoles.length >= 2 && !collapsed && (
        <div className="px-3 pb-2 border-t border-sidebar-border/40 pt-3">
          <RoleSwitcher
            availableRoles={availableRoles}
            currentRole={currentRole ?? (roleKey as Role)}
          />
        </div>
      )}

      {/* Profil utilisateur */}
      {!collapsed && (
        <div className="p-5 border-t border-sidebar-border/40 bg-sidebar">
          <a href="/profil" className="flex items-center gap-3 group hover:opacity-90 transition-opacity">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-tr from-primary to-accent rounded-full blur opacity-25 group-hover:opacity-75 transition duration-500" />
              <Avatar className="relative h-9 w-9 flex-shrink-0 border border-sidebar-border">
                {userAvatar && <AvatarImage src={userAvatar} alt={userName} />}
                <AvatarFallback className="bg-gradient-to-tr from-primary to-accent text-white text-xs font-bold">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-semibold text-sidebar-foreground truncate group-hover:text-primary/80 transition-colors">{userName}</p>
              <p className="text-xs text-primary/50 truncate mt-0.5 font-medium">{userRole}</p>
            </div>
          </a>
        </div>
      )}

      {/* Bouton collapse — desktop only */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-sidebar-accent border border-sidebar-border items-center justify-center hover:bg-sidebar-accent/80 transition-all duration-200 z-10 hover:scale-110 active:scale-95 shadow-md shadow-primary/10 hidden lg:flex"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-sidebar-foreground/60 hover:text-sidebar-foreground" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5 text-sidebar-foreground/60 hover:text-sidebar-foreground" />
        )}
      </button>
    </aside>
    </>
  );
}
