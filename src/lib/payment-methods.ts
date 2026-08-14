/**
 * EcolPro — Moyens de paiement acceptés
 * ======================================
 * Source unique de vérité pour les modes de règlement (cash, mobile money,
 * virement, carte). Utilisée par les formulaires, les badges et la validation Zod.
 */

export type PaymentMethodType = "CASH" | "MOBILE_MONEY" | "BANK" | "CARD";

export interface PaymentMethod {
  id: string;
  /** Clé de traduction (ex: facturation.waffi) */
  labelKey: string;
  /** Catégorie du moyen de paiement */
  type: PaymentMethodType;
  /** Couleur Tailwind pour les badges et icônes */
  color: string;
  /** Icône optionnelle / nom d'icône côté UI */
  icon?: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "espèces", labelKey: "cash", type: "CASH", color: "green" },
  { id: "waffi", labelKey: "waffi", type: "MOBILE_MONEY", color: "blue" },
  { id: "cac_pay", labelKey: "cacPay", type: "MOBILE_MONEY", color: "indigo" },
  { id: "dahab_plus", labelKey: "dahabPlus", type: "MOBILE_MONEY", color: "amber" },
  { id: "saba_pay", labelKey: "sabaPay", type: "MOBILE_MONEY", color: "cyan" },
  { id: "faida", labelKey: "faida", type: "MOBILE_MONEY", color: "emerald" },
  { id: "virement", labelKey: "transfer", type: "BANK", color: "slate" },
  { id: "carte", labelKey: "card", type: "CARD", color: "violet" },
];

export const PAYMENT_METHOD_IDS = PAYMENT_METHODS.map((m) => m.id);

export function getPaymentMethod(id: string | null | undefined): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id);
}

export function getPaymentMethodLabelKey(id: string | null | undefined): string {
  return getPaymentMethod(id)?.labelKey ?? "method";
}

export function getPaymentMethodType(id: string | null | undefined): PaymentMethodType | undefined {
  return getPaymentMethod(id)?.type;
}

export function getPaymentMethodColor(id: string | null | undefined): string {
  return getPaymentMethod(id)?.color ?? "gray";
}

/** Ordre d'affichage suggéré dans les dropdowns (cash en premier, carte en dernier). */
export function getPaymentMethodsForSelect(): PaymentMethod[] {
  return [...PAYMENT_METHODS];
}

/** Libellé technique court pour les exports / rapports. */
export function getPaymentMethodDisplay(
  id: string | null | undefined,
  t: (key: string) => string
): string {
  if (!id) return t("method");
  return t(getPaymentMethodLabelKey(id));
}
