import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
// Next 16 : `eslint-config-next` ne publie plus de configuration « eslintrc »
// que `FlatCompat` saurait charger — ses fichiers `dist/` sont désormais des
// flat configs (tableaux d'objets). Les passer par `compat.extends()`, c'est-à-
// dire les traiter comme de l'eslintrc, fait échouer ESLint sur
// « Converting circular structure to JSON » (le plugin React est vu comme un
// objet à référence circulaire). On importe donc le flat config directement.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Plugin ecolpro (CommonJS local)
const ecolproPlugin = require("./eslint-rules");

// Le plugin `react-hooks` est enregistré par le flat config Next, dans un objet
// limité aux fichiers de code. En flat config, REDÉFINIR la sévérité d'une
// règle exige que le même objet enregistre lui-même le plugin : on réutilise
// donc l'instance exacte du config Next — et non une nouvelle dépendance, qui
// ne serait pas résoluble depuis la racine avec pnpm.
const reactHooksPlugin = nextCoreWebVitals
  .flatMap((entree) => Object.entries(entree.plugins ?? {}))
  .find(([nom]) => nom === "react-hooks")?.[1];

if (!reactHooksPlugin) {
  throw new Error(
    "eslint.config.mjs : plugin `react-hooks` introuvable dans " +
      "`eslint-config-next/core-web-vitals`. La dérogation de sévérité des " +
      "règles React Compiler (juste en dessous) ne peut plus s'appliquer. " +
      "Vérifier la forme du config livré par Next 16, puis adapter."
  );
}

const eslintConfig = [
  // --- next/core-web-vitals (flat config natif de Next 16) ---
  ...nextCoreWebVitals,

  // --- Règles React Compiler : « warn », dette mesurée le 29/09/2026 --------
  // `eslint-config-next@16` embarque la nouvelle génération de règles
  // `react-hooks` (React Compiler) et les active en « error ». Elles
  // n'existaient pas en 15 : elles signalent 81 motifs PRÉEXISTANTS au passage
  // en 16 — aucun n'a été introduit par la montée. Mesure du 29/09/2026 :
  //
  //     react-hooks/set-state-in-effect ........... 64
  //     react-hooks/static-components ............. 11
  //     react-hooks/immutability ................... 2
  //     react-hooks/set-state-in-render ............ 1
  //     react-hooks/refs ........................... 1
  //     react-hooks/error-boundaries ............... 1
  //     react-hooks/preserve-manual-memoization .... 1
  //
  // Les corriger demande de RESTRUCTURER des effets et des composants : c'est
  // un changement de COMPORTEMENT, qui ne doit pas voyager en passager
  // clandestin d'une montée de version. Ils restent donc en « warn » —
  // visibles, sans bloquer — le temps d'être repris un par un.
  //
  // Chaque règle est nommée explicitement, sans joker : une règle arrivée plus
  // tard DOIT se manifester en « error », et non hériter silencieusement de
  // cette indulgence.
  // Objectif : 0, puis retour en « error » — le chemin déjà suivi par
  // `ecolpro/require-annee-filter` (380 → 0) et suivi par `pnpm audit:annee`.
  {
    // Même périmètre que le config Next : c'est là que son plugin est
    // enregistré, et une redéfinition de règle doit couvrir, au minimum, les
    // fichiers où la règle s'applique.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: { "react-hooks": reactHooksPlugin },
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },

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
