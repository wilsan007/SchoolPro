import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Plugin ecolpro (CommonJS local)
const ecolproPlugin = require("./eslint-rules");

const eslintConfig = [
  // --- next/core-web-vitals (legacy config wrappé pour ESLint 9 flat) ---
  ...compat.extends("next/core-web-vitals"),

  // --- Plugin ecolpro (règles d'isolation tenant/site) ---
  {
    plugins: {
      ecolpro: ecolproPlugin,
    },
  },

  // --- Règles globales : désactivées par défaut ---
  {
    rules: {
      "ecolpro/require-tenant-id": "off",
      "ecolpro/require-site-filter": "off",
      "ecolpro/require-annee-filter": "off",
    },
  },

  // --- Code applicatif : tenantId + site filter obligatoires ---
  {
    files: [
      "src/lib/**/*.{ts,tsx}",
      "src/app/api/**/*.{ts,tsx}",
      "src/app/(dashboard)/**/*.{ts,tsx}",
    ],
    rules: {
      "ecolpro/require-tenant-id": "error",
      "ecolpro/require-site-filter": "error",
      // « error » : la dette est à ZÉRO (mesure du 29/09/2026) — la règle est
      // désormais un garde-fou, plus un simple thermomètre.
      //
      // Parcours : 380 signalements au premier passage, dont 319 faux positifs
      // de la règle elle-même (variables `filtreAnnee*`, idiome
      // `annee ? { annee } : {}`, filtre par période — cf. l'en-tête de la
      // règle) ; 61 après correction de la règle, puis 54, 37, 22, 0 après
      // quatre lots de relecture un par un.
      //
      // Sur ces 380, la règle a servi : elle a fait sortir SIX bugs réels. Cinq sont
      // le même motif — une année que la requête avait l'intention de porter et
      // qui manquait :
      //   • graphique « élèves par classe » (`api/analytics`) ;
      //   • sélecteur d'audience de la messagerie (`messaging-audience`) ;
      //   • moteur de remplacements (`rh/moteur-remplacements` : la charge
      //     horaire cumulait les années, d'où de faux conflits) ;
      //   • export des bulletins (`sync-export/notes-bulletins`) ;
      //   • aperçu de l'import d'élèves (`import-eleves-server` : l'aperçu
      //     annonçait le contraire de ce que l'import allait faire).
      // Le sixième est d'une autre nature, mais c'est la règle qui l'a fait
      // remonter — un filtre qui se LÈVE au lieu de refuser :
      //   • `(dashboard)/cahier-journal/page.tsx` : liste de classes vide ⇒
      //     aucune restriction, donc les séances de toutes les années.
      //
      // Toute nouvelle violation DOIT être corrigée, ou exemptée avec un motif
      // écrit sur la ligne. Métrique de suivi : `pnpm audit:annee`, plafond 0.
      "ecolpro/require-annee-filter": "error",
    },
  },

  // --- Tests, scripts, config : exemptés ---
  {
    files: [
      "*.test.ts",
      "*.test.tsx",
      "tests/**",
      "scripts/**",
      "vitest.config.ts",
      "vitest.rls.config.ts",
      "playwright.config.ts",
    ],
    rules: {
      "ecolpro/require-tenant-id": "off",
      "ecolpro/require-site-filter": "off",
      "ecolpro/require-annee-filter": "off",
    },
  },

  // --- Ignorer les fichiers non-source ---
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "coverage/**",
      "dist/**",
      "build/**",
      "mobile-app/**",
      "*.config.mjs",
      "*.config.js",
      "*.config.cjs",
    ],
  },
];

export default eslintConfig;
