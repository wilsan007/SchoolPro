"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

/**
 * next-themes injecte un `<script>` en ligne pour poser le thème avant
 * l'hydratation. Ce script n'a d'utilité que dans le HTML rendu côté serveur :
 * quand React rend le composant côté navigateur, il ne l'exécute pas et
 * signale « Encountered a script tag while rendering React component ».
 * Côté navigateur, on le déclare donc comme donnée inerte (`application/json`).
 */
const scriptProps =
  typeof window === "undefined" ? undefined : ({ type: "application/json" } as const);

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider scriptProps={scriptProps} {...props}>
      {children}
    </NextThemesProvider>
  );
}
