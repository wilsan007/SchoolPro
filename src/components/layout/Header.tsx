"use client";

import { Bell, Search, Moon, Sun, LogOut, User, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { useState } from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  userName?: string;
  userAvatar?: string;
  notifCount?: number;
}

export function Header({ title, subtitle, userName = "Admin", userAvatar, notifCount = 3 }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-6 bg-background/95 backdrop-blur border-b border-border">
      {/* Titre de la page */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {/* Actions droite */}
      <div className="flex items-center gap-2">
        {/* Recherche globale */}
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher élève, classe..."
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

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {notifCount > 9 ? "9+" : notifCount}
            </span>
          )}
        </Button>

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
            <div className="absolute right-0 mt-1 w-48 bg-popover border rounded-lg shadow-lg py-1 z-50">
              <button className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors">
                <User className="h-4 w-4" />
                Mon profil
              </button>
              <div className="border-t my-1" />
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
