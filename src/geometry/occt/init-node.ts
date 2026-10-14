import type { OcctFactory } from "./init";

/**
 * Factory OCCT per Node (test `*.geometry.test.ts`): la glue del pacchetto
 * `replicad-opencascadejs` legge il `.wasm` accanto a sé in `node_modules`.
 * Non va importata dal codice del browser.
 */
export const nodeOcctFactory: OcctFactory = async (moduleArg) => {
  const mod = await import("replicad-opencascadejs");
  return mod.default(moduleArg);
};
