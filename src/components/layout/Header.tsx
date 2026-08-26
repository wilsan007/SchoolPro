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
import { useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();
  const isEmbedded = searchParams.get("embedded") === "1";
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
    const CACHE_KEY = "schoolpro_notif_cache";
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

  // En mode embedded (iframe du workspace), on ne rend pas le header
  // — la WindowFrame a déjà sa propre title bar. (Placé APRÈS tous les hooks
  // pour respecter les rules of hooks.)
  if (isEmbedded) return null;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-[60px] px-4 sm:px-6 bg-card/70 backdrop-blur-[20px] border-b border-border print:hidden">
      {/* Liseré dégradé turquoise→violet en bas du header */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, hsl(198 65% 46% / 0.5) 0%, hsl(258 58% 58% / 0.4) 50%, hsl(188 60% 42% / 0.4) 100%)",
        }}
      />
      {/* Titre de la page */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger menu — mobile only */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("sidebar-mobile-toggle"))}
          className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors flex-shrink-0"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-semibold font-display text-foreground truncate">{title}</h1>
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
          <Search className="absolute left-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={tCommon("searchPlaceholder")}
            className="pl-9 h-9 w-60 text-sm rounded-full bg-input/80 border-transparent focus:bg-background focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all duration-200"
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
            <div className="absolute right-0 mt-1 w-32 bg-popover border rounded-2xl shadow-lg py-1 z-50">
              <button
                onClick={() => switchLocale("fr")}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${locale === "fr" ? "font-bold text-primary" : ""}`}
              >
                🇫🇷 {tCommon("french")}
              </button>
              <button
                onClick={() => switchLocale("en")}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${locale === "en" ? "font-bold text-primary" : ""}`}
              >
                🇬🇧 {tCommon("english")}
              </button>
              <button
                onClick={() => switchLocale("so")}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${locale === "so" ? "font-bold text-primary" : ""}`}
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
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-gradient-to-br from-rose-500 to-red-600 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_2px_8px_rgba(225,29,72,0.4)]">
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </Button>
          {showNotifMenu && (
            <div className="absolute right-0 mt-1 w-[calc(100vw-2rem)] max-w-80 bg-popover border rounded-2xl shadow-lg z-50 max-h-96 overflow-y-auto">
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
                    className="px-4 py-3 border-b last:border-0 hover:bg-muted cursor-pointer transition-colors"
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
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <Avatar className="h-7 w-7">
              {userAvatar && <AvatarImage src={userAvatar} />}
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white text-xs font-semibold shadow-[0_2px_8px_rgba(14,165,233,0.3)]">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden md:block">{userName.split(" ")[0]}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-1 w-44 sm:w-48 bg-popover border rounded-2xl shadow-lg py-1 z-50">
              <a
                href="/profil"
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <User className="h-4 w-4" />
                {tCommon("myProfile")}
              </a>
              <div className="border-t my-1" />
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
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
