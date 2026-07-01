"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  BookOpen,
  Calendar,
  GraduationCap,
  MessageSquare,
  Receipt,
  Settings,
  School,
  ChevronLeft,
  ChevronRight,
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
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

const navItems = [
  {
    label: "Vue d'ensemble",
    icon: LayoutDashboard,
    href: "/dashboard",
    color: "text-blue-500",
  },
  {
    label: "Élèves",
    icon: Users,
    href: "/eleves",
    color: "text-violet-500",
  },
  {
    label: "Absences",
    icon: ClipboardList,
    href: "/absences",
    color: "text-orange-500",
  },
  {
    label: "Notes",
    icon: BookOpen,
    href: "/notes",
    color: "text-green-500",
  },
  {
    label: "Examens",
    icon: GraduationCap,
    href: "/evaluations",
    color: "text-yellow-500",
  },
  {
    label: "Emploi du temps",
    icon: Calendar,
    href: "/emploi-du-temps",
    color: "text-cyan-500",
  },
  {
    label: "Parents",
    icon: UserCheck,
    href: "/parents",
    color: "text-pink-500",
  },
  {
    label: "Messagerie",
    icon: MessageSquare,
    href: "/messages",
    color: "text-indigo-500",
  },
  {
    label: "Vie scolaire",
    icon: Shield,
    href: "/vie-scolaire",
    color: "text-red-500",
  },
  {
    label: "Facturation",
    icon: Receipt,
    href: "/facturation",
    color: "text-emerald-500",
  },
  {
    label: "Admissions",
    icon: UserPlus,
    href: "/admissions",
    color: "text-teal-500",
  },
  {
    label: "RH & Paie",
    icon: Briefcase,
    href: "/rh",
    color: "text-amber-500",
  },
  {
    label: "Analytics",
    icon: BarChart3,
    href: "/analytics",
    color: "text-red-500",
  },
  {
    label: "Cours en ligne",
    icon: PlayCircle,
    href: "/cours",
    color: "text-indigo-500",
  },
  {
    label: "Communication",
    icon: Bell,
    href: "/communication",
    color: "text-sky-500",
  },
  {
    label: "Rapports PDF",
    icon: FileText,
    href: "/rapports",
    color: "text-slate-500",
  },
  {
    label: "Orientation",
    icon: Compass,
    href: "/orientation",
    color: "text-lime-600",
  },
  {
    label: "Alumni",
    icon: Archive,
    href: "/alumni",
    color: "text-purple-500",
  },
  {
    label: "Inventaire",
    icon: Package,
    href: "/inventaire",
    color: "text-stone-500",
  },
  {
    label: "Super Admin",
    icon: Crown,
    href: "/super-admin",
    color: "text-yellow-500",
  },
];

interface SidebarProps {
  userName?: string;
  userRole?: string;
  userAvatar?: string;
  tenantName?: string;
  isSuperAdmin?: boolean;
}

export function Sidebar({ userName = "Admin", userRole = "Directeur", userAvatar, tenantName = "Mon École", isSuperAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex flex-col h-screen bg-slate-950/95 backdrop-blur-md text-slate-100 transition-all duration-300 ease-in-out border-r border-slate-800/60 shadow-xl shadow-indigo-950/10",
        collapsed ? "w-20" : "w-68"
      )}
    >
      {/* Logo & École */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-slate-800/40 bg-slate-950/40">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 transform hover:scale-105 transition-transform duration-300">
          <School className="w-5 h-5 text-white animate-pulse" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden animate-fade-in">
            <p className="text-sm font-extrabold bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200 bg-clip-text text-transparent tracking-wide leading-none">
              EcolPro
            </p>
            <p className="text-xs text-indigo-300/60 truncate mt-1.5 font-medium tracking-tight">{tenantName}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {navItems
          .filter((item) => item.href !== "/super-admin" || isSuperAdmin)
          .map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-300 ease-out group relative overflow-hidden",
                isActive
                  ? "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-lg shadow-indigo-600/15"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60"
              )}
            >
              {/* Hover highlight line */}
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
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Paramètres */}
      <div className="px-3 pb-3 border-t border-slate-800/40 pt-3">
        <Link
          href="/parametres"
          className={cn(
            "flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-300 text-slate-400 hover:bg-slate-900/60 hover:text-slate-100 group relative",
            pathname.startsWith("/parametres") && "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 text-white shadow-lg shadow-indigo-600/15"
          )}
        >
          <Settings className="flex-shrink-0 w-5 h-5 transition-transform duration-300 group-hover:rotate-45" />
          {!collapsed && <span>Paramètres</span>}
        </Link>
      </div>

      {/* Profil utilisateur */}
      {!collapsed && (
        <div className="p-5 border-t border-slate-800/40 bg-slate-950/20 backdrop-blur-sm">
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
