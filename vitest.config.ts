import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      include: [
        "src/lib/actions/facture.ts",
        "src/app/api/rh/absences/route.ts",
        "src/app/api/rh/absences/[id]/route.ts",
        "src/app/api/rh/conges/route.ts",
        "src/app/api/rh/conges/[id]/route.ts",
        "src/components/rh/PersonnelAbsencesConges.tsx",
        "src/components/facturation/FactureDetail.tsx",
        "src/components/facturation/FacturesTable.tsx",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
