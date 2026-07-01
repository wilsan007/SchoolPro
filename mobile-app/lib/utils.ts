import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatDate(date: string | Date, fmt: string = "dd MMM yyyy"): string {
  const d = new Date(date);
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatCurrency(amount: number, currency = "XOF"): string {
  return `${amount.toLocaleString("fr-SN")} ${currency}`;
}

export function getNoteColor(note: number, max = 20): string {
  const pct = (note / max) * 100;
  if (pct >= 80) return "text-green-600";
  if (pct >= 60) return "text-blue-600";
  if (pct >= 50) return "text-yellow-600";
  return "text-red-600";
}

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
