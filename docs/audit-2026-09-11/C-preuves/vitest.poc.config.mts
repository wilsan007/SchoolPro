import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  test: { environment: "node", include: ["tests/unit/*.test.ts"], server: { deps: { inline: ["next-auth", "@auth/core"] } } },
  resolve: { alias: { "@": path.resolve(__dirname, "./src"), "next/server": "next/server.js" } },
});
