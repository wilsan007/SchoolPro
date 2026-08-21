"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard, Users, BookOpen, CalendarDays, Bell,
  Wallet, GraduationCap, Home, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barre de navigation inférieure — visible uniquement sur mobile (lg:hidden).
 *
 * Affiche 5 raccourcis contextuels selon le rôle de l'utilisateur :
 *  - PARENT : Accueil, Enfants, Messages, Factures, Notifications
 *  - STUDENT : Accueil, Cours, Notes, Emploi du temps, Messages
 *  - TEACHER/CLASS_TEACHER : Accueil, Ma classe, Notes, Emploi du temps, Messages
 *  - Autres (direction, secrétariat, etc.) : Dashboard, Élèves, Absences, Messages, Paramètres
 *
 * Pas de JS lourd : on lit le pathname pour le tab actif, et le rôle est
 * passé en prop depuis le layout serveur.
 */

interface NavItem {
  href: string;
  icon: LucideIcon;
  labelKey: string;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  PARENT: [
    { href: "/parent", icon: Home, labelKey: "home" },
    { href: "/eleves", icon: Users, labelKey: "children" },
    { href: "/messages", icon: Bell, labelKey: "messages" },
    { href: "/facturation", icon: Wallet, labelKey: "billing" },
    { href: "/profil", icon: LayoutDashboard, labelKey: "profile" },
  ],
  STUDENT: [
    { href: "/eleve", icon: Home, labelKey: "home" },
    { href: "/cours", icon: BookOpen, labelKey: "courses" },
    { href: "/notes", icon: GraduationCap, labelKey: "grades" },
    { href: "/emploi-du-temps", icon: CalendarDays, labelKey: "schedule" },
    { href: "/messages", icon: Bell, labelKey: "messages" },
  ],
  TEACHER: [
    { href: "/mon-espace", icon: Home, labelKey: "home" },
    { href: "/ma-classe", icon: Users, labelKey: "myClass" },
    { href: "/notes", icon: GraduationCap, labelKey: "grades" },
    { href: "/emploi-du-temps", icon: CalendarDays, labelKey: "schedule" },
    { href: "/messages", icon: Bell, labelKey: "messages" },
  ],
  CLASS_TEACHER: [
    { href: "/ma-classe", icon: Home, labelKey: "home" },
    { href: "/eleves", icon: Users, labelKey: "students" },
    { href: "/notes", icon: GraduationCap, labelKey: "grades" },
    { href: "/absences", icon: CalendarDays, labelKey: "attendance" },
    { href: "/messages", icon: Bell, labelKey: "messages" },
  ],
  PRINCIPAL: [
    { href: "/direction", icon: Home, labelKey: "home" },
    { href: "/eleves", icon: Users, labelKey: "students" },
    { href: "/absences", icon: CalendarDays, labelKey: "attendance" },
    { href: "/messages", icon: Bell, labelKey: "messages" },
    { href: "/parametres", icon: LayoutDashboard, labelKey: "settings" },
  ],
};

const DEFAULT_NAV: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
  { href: "/eleves", icon: Users, labelKey: "students" },
  { href: "/absences", icon: CalendarDays, labelKey: "attendance" },
  { href: "/messages", icon: Bell, labelKey: "messages" },
  { href: "/parametres", icon: LayoutDashboard, labelKey: "settings" },
];

export function MobileBottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const t = useTranslations("mobileNav");

  const items = NAV_BY_ROLE[role] ?? DEFAULT_NAV;

  function isActive(href: string): boolean {
    if (href === "/dashboard" || href === "/parent" || href === "/eleve" || href === "/mon-espace" || href === "/ma-classe" || href === "/direction") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("ariaLabel")}
    >
      <div className="flex items-stretch justify-around h-14 max-w-md mx-auto">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 transition-colors",
                active
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-[10px] leading-none truncate w-full text-center">
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
