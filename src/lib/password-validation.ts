import { z } from "zod";

/**
 * Règles de complexité du mot de passe.
 *
 * Un mot de passe valide doit contenir au minimum :
 *   — 8 caractères
 *   — une lettre minuscule
 *   — une lettre majuscule
 *   — un chiffre
 *   — un caractère spécial (!@#$%^&*…)
 *
 * Les messages d'erreur sont externalisés dans la section
 * `common.password` des fichiers i18n (fr / en / so) afin que les
 * formulaires client et les réponses API renvoient toujours un
 * message traduit.
 */

export interface PasswordMessages {
  tooShort: string;
  missingUppercase: string;
  missingLowercase: string;
  missingNumber: string;
  missingSpecial: string;
  dontMatch: string;
}

/**
 * Construit un schéma Zod pour un champ « nouveau mot de passe ».
 *
 * On préfère une fonction à un schéma statique parce que les messages
 * dépendent de la locale courante (récupérée via `useTranslations`
 * côté client) — Zod ne sait pas introspecter next-intl.
 *
 * @param messages Messages traduits pour chaque règle violée.
 */
export function buildPasswordSchema(messages: PasswordMessages) {
  return z
    .string()
    .min(8, messages.tooShort)
    .refine((v) => /[a-z]/.test(v), messages.missingLowercase)
    .refine((v) => /[A-Z]/.test(v), messages.missingUppercase)
    .refine((v) => /[0-9]/.test(v), messages.missingNumber)
    .refine((v) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(v), messages.missingSpecial);
}

/**
 * Schéma complet « nouveau + confirmation » avec vérification d'égalité.
 *
 * @param messages Messages traduits (inclut `dontMatch`).
 */
export function buildPasswordWithConfirmSchema(messages: PasswordMessages) {
  return z
    .object({
      password: buildPasswordSchema(messages),
      confirmPassword: z.string().min(1, messages.dontMatch),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: messages.dontMatch,
      path: ["confirmPassword"],
    });
}

/**
 * Valide un mot de passe seul et renvoie la liste des codes d'erreur
 * (stables, indépendants de la locale) à destination des actions
 * serveur et des routes API.
 *
 * Codes retournés :
 *   — PASSWORD_TOO_SHORT
 *   — PASSWORD_MISSING_UPPERCASE
 *   — PASSWORD_MISSING_LOWERCASE
 *   — PASSWORD_MISSING_NUMBER
 *   — PASSWORD_MISSING_SPECIAL
 *
 * @returns `null` si le mot de passe est valide, sinon un tableau de codes.
 */
export function validerMotDePasse(password: string): string[] | null {
  const erreurs: string[] = [];
  if (password.length < 8) erreurs.push("PASSWORD_TOO_SHORT");
  if (!/[a-z]/.test(password)) erreurs.push("PASSWORD_MISSING_LOWERCASE");
  if (!/[A-Z]/.test(password)) erreurs.push("PASSWORD_MISSING_UPPERCASE");
  if (!/[0-9]/.test(password)) erreurs.push("PASSWORD_MISSING_NUMBER");
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password))
    erreurs.push("PASSWORD_MISSING_SPECIAL");
  return erreurs.length > 0 ? erreurs : null;
}
