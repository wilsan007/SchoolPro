import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formate une date en français */
export function formatDate(date: Date | string, fmt = "dd MMMM yyyy") {
  return format(new Date(date), fmt, { locale: fr });
}

/** Temps relatif en français : "il y a 3 minutes" */
export function timeAgo(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
}

/** Génère un matricule unique */
export function generateMatricule(annee: string, sequence: number): string {
  const year = annee.split("-")[0].slice(-2); // "25" pour 2025
  return `${year}-${String(sequence).padStart(4, "0")}`;
}

/** Formate un montant en XOF (FCFA) */
export function formatCurrency(
  amount: number,
  currency = "XOF",
  locale = "fr-SN"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Calcule la moyenne pondérée */
export function calculerMoyenne(
  notes: { valeur: number; noteMax: number; coefficient: number }[]
): number | null {
  if (notes.length === 0) return null;

  const totalPondere = notes.reduce((sum, n) => {
    const sur20 = (n.valeur / n.noteMax) * 20;
    return sum + sur20 * n.coefficient;
  }, 0);

  const totalCoeff = notes.reduce((sum, n) => sum + n.coefficient, 0);

  if (totalCoeff === 0) return null;
  return Math.round((totalPondere / totalCoeff) * 100) / 100;
}

/** Couleur de note selon la valeur */
export function getNoteColor(note: number, max = 20): string {
  const pct = (note / max) * 100;
  if (pct >= 80) return "text-green-600 dark:text-green-400";
  if (pct >= 60) return "text-blue-600 dark:text-blue-400";
  if (pct >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

/** Badge couleur de note */
export function getNoteBadgeVariant(note: number, max = 20) {
  const pct = (note / max) * 100;
  if (pct >= 80) return "success";
  if (pct >= 60) return "info";
  if (pct >= 50) return "warning";
  return "destructive";
}

/** Initiales d'un nom */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Slug depuis un nom */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/** Tronque un texte */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}
