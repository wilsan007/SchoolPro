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
