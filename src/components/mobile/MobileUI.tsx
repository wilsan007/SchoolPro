"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2, ArrowDown } from "lucide-react";

// ─── MobileCard ─────────────────────────────────────────────────

interface MobileCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Badge coloré à gauche (barre verticale) */
  accentColor?: string;
}

/**
 * Carte tactile mobile — remplace les lignes de table sur mobile.
 * Surface arrondie, ombre légère, zone de touche large (min 56px).
 */
export function MobileCard({ children, className, onClick, accentColor }: MobileCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800",
        "shadow-sm active:shadow-md transition-shadow",
        onClick && "cursor-pointer active:scale-[0.98] transition-transform",
        "p-4 min-h-[56px]",
        className
      )}
    >
      {accentColor && (
        <div
          className="absolute left-0 top-4 bottom-4 w-1 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      )}
      {children}
    </div>
  );
}

// ─── MobileList ─────────────────────────────────────────────────

interface MobileListProps {
  children: ReactNode;
  className?: string;
}

/**
 * Liste de cartes mobile — espacement vertical, pas de separator dur.
 */
export function MobileList({ children, className }: MobileListProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {children}
    </div>
  );
}

// ─── MobileListItem ─────────────────────────────────────────────

interface MobileListItemProps {
  avatar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  accentColor?: string;
}

/**
 * Item de liste mobile — avatar + titre + sous-titre + élément trailing.
 * Pattern standard iOS/Android : ligne avec icône/photo à gauche, contenu au
 * centre, badge/action à droite.
 */
export function MobileListItem({ avatar, title, subtitle, trailing, onClick, accentColor }: MobileListItemProps) {
  return (
    <MobileCard onClick={onClick} accentColor={accentColor} className="flex items-center gap-3">
      {avatar && (
        <div className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          {avatar}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {trailing && (
        <div className="flex-shrink-0 flex items-center gap-2">
          {trailing}
        </div>
      )}
    </MobileCard>
  );
}

// ─── FAB (Floating Action Button) ───────────────────────────────

interface FABProps {
  icon: ReactNode;
  onClick: () => void;
  label?: string;
  className?: string;
}

/**
 * Bouton d'action flottant — pattern Material Design.
 * Visible uniquement sur mobile (lg:hidden).
 * Avec label = FAB étendu, sans label = FAB circulaire.
 */
export function FAB({ icon, onClick, label, className }: FABProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label ?? "Action"}
      className={cn(
        "lg:hidden fixed bottom-20 right-4 z-30",
        "bg-indigo-600 text-white shadow-lg active:shadow-xl",
        "transition-all duration-200 active:scale-95",
        label ? "rounded-2xl px-5 py-3.5 flex items-center gap-2" : "w-14 h-14 rounded-full flex items-center justify-center",
        className
      )}
    >
      {icon}
      {label && <span className="text-sm font-semibold">{label}</span>}
    </button>
  );
}

// ─── BottomSheet ────────────────────────────────────────────────

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Hauteur max en vh. Défaut 85%. */
  maxHeight?: number;
}

/**
 * Bottom sheet — feuille qui glisse depuis le bas de l'écran.
 * Pattern standard mobile pour les formulaires, filtres, détails.
 * Sur desktop (lg), s'affiche comme un dialog centré standard.
 */
export function BottomSheet({ open, onClose, title, children, maxHeight = 85 }: BottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0",
          "bg-white dark:bg-gray-900 rounded-t-3xl",
          "shadow-2xl animate-in slide-in-from-bottom duration-300",
          "flex flex-col"
        )}
        style={{ maxHeight: `${maxHeight}vh` }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-90 transition-all"
              aria-label="Fermer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {/* Content scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── PullToRefresh ──────────────────────────────────────────────

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
}

/**
 * Pull-to-refresh — tirez vers le bas pour rafraîchir.
 * Détecte le geste tactile (touchstart/touchmove/touchend) sur le scroll
 * container. Seuil de 70px avant déclenchement.
 */
export function PullToRefresh({ children, onRefresh, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showArrow, setShowArrow] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const THRESHOLD = 70;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setShowArrow(true);
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === 0) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0 && containerRef.current && containerRef.current.scrollTop === 0) {
      // Résistance élastique : plus on tire, plus c'est dur
      const resisted = Math.min(diff * 0.5, 100);
      setPullDistance(resisted);
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (pullDistance >= THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    startY.current = 0;
    setShowArrow(false);
  }, [pullDistance, isRefreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={cn("relative overflow-y-auto", className)}
    >
      {/* Indicateur de pull */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center z-10 transition-opacity"
          style={{ height: `${pullDistance}px`, opacity: pullDistance / THRESHOLD }}
        >
          {isRefreshing ? (
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          ) : (
            <ArrowDown
              className={cn(
                "w-6 h-6 text-indigo-600 transition-transform",
                pullDistance >= THRESHOLD && "rotate-180"
              )}
            />
          )}
        </div>
      )}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 ? "transform 0.3s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Swipeable ──────────────────────────────────────────────────

interface SwipeableProps {
  children: ReactNode;
  /** Contenu révélé en swipant vers la gauche (actions) */
  rightActions?: ReactNode;
  /** Seuil de swipe en px avant déclenchement. Défaut 80. */
  threshold?: number;
  onSwipe?: () => void;
}

/**
 * Carte swipeable — swipe vers la gauche pour révéler des actions.
 * Pattern standard iOS/Android pour les listes (supprimer, éditer, etc.).
 */
export function Swipeable({ children, rightActions, threshold = 80, onSwipe }: SwipeableProps) {
  const [offset, setOffset] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const startX = useRef(0);
  const isSwiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isSwiping.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX.current;
    // Swipe vers la gauche seulement (diff négatif)
    if (diff < 0) {
      setOffset(Math.max(diff, -120));
    } else if (showActions && diff > 0) {
      // Re-swipe vers la droite pour fermer
      setOffset(Math.min(diff - threshold, 0));
    }
  }, [showActions, threshold]);

  const onTouchEnd = useCallback(() => {
    isSwiping.current = false;
    if (offset <= -threshold) {
      setOffset(-threshold);
      setShowActions(true);
    } else {
      setOffset(0);
      setShowActions(false);
    }
  }, [offset, threshold]);

  return (
    <div className="relative overflow-hidden rounded-2xl" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Actions de fond (révélées au swipe) */}
      {rightActions && (
        <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 px-2">
          {rightActions}
        </div>
      )}
      {/* Contenu au-dessus */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: isSwiping.current ? "none" : "transform 0.25s ease-out",
        }}
        className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm"
      >
        {children}
      </div>
    </div>
  );
}

// ─── SwipeAction ────────────────────────────────────────────────

interface SwipeActionProps {
  icon: ReactNode;
  label?: string;
  onClick: () => void;
  color?: "red" | "blue" | "green" | "amber";
}

const ACTION_COLORS = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  amber: "bg-amber-500",
} as const;

/**
 * Bouton d'action révélé par swipe — à utiliser dans `Swipeable.rightActions`.
 */
export function SwipeAction({ icon, label, onClick, color = "blue" }: SwipeActionProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white active:scale-90 transition-transform",
        ACTION_COLORS[color]
      )}
      aria-label={label}
    >
      {icon}
      {label && <span className="text-[9px] mt-0.5">{label}</span>}
    </button>
  );
}

// ─── MobileSearch ───────────────────────────────────────────────

interface MobileSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Barre de recherche mobile — collée en haut, grande zone de touche,
 * icône à gauche, bouton effacer à droite.
 */
export function MobileSearch({ value, onChange, placeholder, className }: MobileSearchProps) {
  return (
    <div className={cn("relative", className)}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-11 pl-10 pr-10 rounded-xl",
          "bg-gray-100 dark:bg-gray-800 border-0",
          "text-sm text-gray-900 dark:text-white placeholder:text-gray-400",
          "focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-gray-900",
          "transition-all outline-none"
        )}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-90 transition-all"
          aria-label="Effacer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── MobileSegmentedControl ─────────────────────────────────────

interface SegmentedControlProps {
  segments: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

/**
 * Contrôle segmenté — sélecteur tactile entre vues/filtres.
 * Pattern iOS standard pour basculer entre onglets ou modes d'affichage.
 */
export function SegmentedControl({ segments, value, onChange, className }: SegmentedControlProps) {
  return (
    <div className={cn("flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1", className)}>
      {segments.map((seg) => (
        <button
          key={seg.value}
          onClick={() => onChange(seg.value)}
          className={cn(
            "flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all",
            value === seg.value
              ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "text-gray-500 dark:text-gray-400"
          )}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}

// ─── MobileStatCard ─────────────────────────────────────────────

interface MobileStatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  color?: string;
  trend?: "up" | "down" | "neutral";
}

/**
 * Carte statistique mobile — grande valeur, icône colorée, label court.
 */
export function MobileStatCard({ icon, label, value, color = "text-indigo-600", trend }: MobileStatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-800", color)}>
          {icon}
        </div>
        {trend === "up" && <span className="text-green-500 text-xs">↑</span>}
        {trend === "down" && <span className="text-red-500 text-xs">↓</span>}
      </div>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

// ─── MobileEmptyState ───────────────────────────────────────────

interface MobileEmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * État vide mobile — illustration + message + action optionnelle.
 */
export function MobileEmptyState({ icon, title, description, action }: MobileEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
        {icon}
      </div>
      <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">{title}</p>
      {description && <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
