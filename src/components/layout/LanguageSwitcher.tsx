"use client";

import { useState, useEffect, useRef } from "react";
import { Globe, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Sélecteur de langue (fr / en / so) pour la barre d'outils.
 *
 * Fonctionne par cookie `NEXT_LOCALE` + `router.refresh()` — même mécanisme
 * que l'ancien Header. Composant client isolé pour pouvoir être réinjecté
 * dans le Workspace sans dupliquer la logique.
 */
export function LanguageSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function switchLocale(newLocale: string) {
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365}`;
    setOpen(false);
    router.refresh();
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options: { code: string; flag: string; label: string }[] = [
    { code: "fr", flag: "🇫🇷", label: tCommon("french") },
    { code: "en", flag: "🇬🇧", label: tCommon("english") },
    { code: "so", flag: "🇸🇴", label: tCommon("somali") },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-navy hover:bg-secondary/60 transition-all duration-200"
        title={tCommon("language")}
        aria-label={tCommon("language")}
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{locale.toUpperCase()}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-popover border border-border rounded-2xl shadow-lg py-1 z-50">
          {options.map((opt) => (
            <button
              key={opt.code}
              onClick={() => switchLocale(opt.code)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors",
                locale === opt.code ? "font-bold text-primary" : "text-foreground"
              )}
            >
              <span>{opt.flag}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
