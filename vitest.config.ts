import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };
/**
 * `next-auth` importa `next/server` senza estensione (Next 14 non ha `exports`): lo si fa
 * passare da Vite, che risolve il modulo come il bundler di Next.
 */
const server = { deps: { inline: ["next-auth"] } };

/**
 * Quattro progetti (D11, P13): `unit` (rapido, dominio ed export puri), `dom`
 * (componenti React in jsdom, file `*.test.tsx`), `geometry`
 * (kernel OCCT in WASM caricato da node_modules, lento: `npm run test:geometry`) e
 * `db` (repository e seed su PGlite in memoria, file `*.db.test.ts`: `npm run test:db`).
 * `npm test` esegue solo `unit` e `dom`.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        // JSX automatico anche qui: il PDF (`server/pdf/*.tsx`) è testato in Node.
        esbuild: { jsx: "automatic" },
        test: {
          name: "unit",
          environment: "node",
          server,
          include: ["src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.geometry.test.ts", "**/*.db.test.ts"],
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
      {
        // Persistenza (P5/P13): PGlite in-process, nessun servizio esterno.
        resolve: { alias },
        test: {
          name: "db",
          environment: "node",
          server,
          include: ["src/**/*.db.test.ts"],
          exclude: ["**/node_modules/**"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
