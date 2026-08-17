"use client";

import { Bell, Search, Moon, Sun, LogOut, User, ChevronDown, CheckCircle2, AlertCircle, Info, Globe, Menu } from "lucide-react";
import { TimeMachineButton } from "@/components/time-machine/TimeMachineButton";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials, timeAgo } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

interface NotifItem {
  id: string;
  titre: string;
  contenu: string;
  canal: string;
  statut: string;
  createdAt: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  site?: string;
  siteColor?: { base: string; light: string; border: string; text: string };
  userName?: string;
  userAvatar?: string;
  notifCount?: number;
}

export function Header({ title, subtitle, site, siteColor, userName = "Admin", userAvatar }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  function switchLocale(newLocale: string) {
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365}`;
    setShowLangMenu(false);
    router.refresh();
  }

  useEffect(() => {
    const CACHE_KEY = "ecolpro_notif_cache";
    const CACHE_TTL = 120_000; // 2 minutes

    // Try cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          const notifs = (data ?? []) as NotifItem[];
          setNotifications(notifs);
          setNotifCount(notifs.filter((n) => n.statut === "ENVOYEE" || n.statut === "EN_ENVOI").length);
          return;
        }
      }
    } catch {}

    const controller = new AbortController();
    fetch("/api/communication?limit=5", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const notifs = (data.notifications ?? []) as NotifItem[];
        setNotifications(notifs);
        setNotifCount(notifs.filter((n) => n.statut === "ENVOYEE" || n.statut === "EN_ENVOI").length);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: notifs, ts: Date.now() }));
        } catch {}
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-4 sm:px-6 bg-background border-b border-border print:hidden">
      {/* Titre de la page */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger menu — mobile only */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("sidebar-mobile-toggle"))}
          className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-accent transition-colors flex-shrink-0"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h1>
          {site && (
            siteColor ? (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border"
                style={{
                  backgroundColor: siteColor.light,
                  borderColor: siteColor.border,
                  color: siteColor.text,
                }}
              >
                {site}
              </span>
            ) : (
              <Badge variant="secondary" className="font-normal">
                {site}
              </Badge>
            )
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
        </div>
      </div>

      {/* Actions droite */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {/* Recherche globale */}
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={tCommon("searchPlaceholder")}
            className="pl-8 h-9 w-56 text-sm"
          />
        </div>

        {/* Dark mode */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-9 w-9"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Language selector */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 gap-1 text-sm font-medium"
            onClick={() => setShowLangMenu(!showLangMenu)}
          >
            <Globe className="h-4 w-4" />
            {locale.toUpperCase()}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {showLangMenu && (
            <div className="absolute right-0 mt-1 w-32 bg-popover border rounded-lg shadow-lg py-1 z-50">
              <button
                onClick={() => switchLocale("fr")}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors ${locale === "fr" ? "font-bold text-primary" : ""}`}
              >
                🇫🇷 {tCommon("french")}
              </button>
              <button
                onClick={() => switchLocale("en")}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors ${locale === "en" ? "font-bold text-primary" : ""}`}
              >
                🇬🇧 {tCommon("english")}
              </button>
              <button
                onClick={() => switchLocale("so")}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors ${locale === "so" ? "font-bold text-primary" : ""}`}
              >
                🇸🇴 {tCommon("somali")}
              </button>
            </div>
          )}
        </div>

        {/* Time Machine — date de démo */}
        <TimeMachineButton />

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            onClick={() => setShowNotifMenu(!showNotifMenu)}
          >
            <Bell className="h-4 w-4" />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </Button>
          {showNotifMenu && (
            <div className="absolute right-0 mt-1 w-[calc(100vw-2rem)] max-w-80 bg-popover border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="text-sm font-semibold">{tCommon("notifications")}</span>
                <button
                  onClick={() => { setShowNotifMenu(false); router.push("/communication"); }}
                  className="text-xs text-primary hover:underline"
                >
                  {tCommon("viewAll")}
                </button>
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {tCommon("noNotifications")}
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="px-4 py-3 border-b last:border-0 hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => { setShowNotifMenu(false); router.push("/communication"); }}
                  >
                    <div className="flex items-start gap-2">
                      {n.statut === "ENVOYEE" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      ) : n.statut === "ECHEC" ? (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{n.titre}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.contenu}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{n.canal}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Menu utilisateur */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <Avatar className="h-7 w-7">
              {userAvatar && <AvatarImage src={userAvatar} />}
              <AvatarFallback className="bg-primary text-white text-xs">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden md:block">{userName.split(" ")[0]}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-1 w-44 sm:w-48 bg-popover border rounded-lg shadow-lg py-1 z-50">
              <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors">
                <User className="h-4 w-4" />
                {tCommon("myProfile")}
              </button>
              <div className="border-t my-1" />
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {tCommon("logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
