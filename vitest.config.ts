import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Tre progetti (D11): `unit` (rapido, dominio ed export puri), `dom`
 * (componenti React in jsdom, file `*.test.tsx`) e `geometry`
 * (kernel OCCT in WASM caricato da node_modules, lento: `npm run test:geometry`).
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.geometry.test.ts"],
        },
      },
      {
        // Test di rendering dei componenti (React Testing Library): solo `*.test.tsx`.
        resolve: { alias },
        esbuild: { jsx: "automatic" },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          exclude: ["**/node_modules/**"],
          setupFiles: ["./src/test/setup-dom.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "geometry",
          environment: "node",
          include: ["src/**/*.geometry.test.ts"],
          exclude: ["**/node_modules/**"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
