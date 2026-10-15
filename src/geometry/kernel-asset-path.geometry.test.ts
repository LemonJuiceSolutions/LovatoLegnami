import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createKernel } from "./kernel-core";
import { DEFAULT_ASSET_BASE, OCCT_VERSION, browserOcctFactory, isOcctReady } from "./occt/init";
import type { WorkerMessage } from "./protocol";

/**
 * 13.1 (P12): il kernel parte dagli asset copiati in `public/occt/<versione>/`
 * (`pretest:geometry` esegue la copia), con la stessa factory del browser: glue
 * importata da `assetBase` e `.wasm` risolto con `locateFile`. File separato perché
 * `initOcct` è un singleton.
 */
describe("asset OCCT versionati", () => {
  const dir = path.join(process.cwd(), "public", "occt", OCCT_VERSION);

  it("il percorso predefinito contiene la versione del pacchetto", () => {
    expect(OCCT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(DEFAULT_ASSET_BASE).toBe(`/occt/${OCCT_VERSION}/`);
    expect(existsSync(path.join(dir, "replicad_single.wasm"))).toBe(true);
    expect(existsSync(path.join(dir, "replicad_single.js"))).toBe(true);
  });

  it("il kernel si inizializza dalla cartella versionata", async () => {
    const messages: WorkerMessage[] = [];
    const kernel = createKernel({ factory: browserOcctFactory(`${dir}/`), post: (m) => messages.push(m) });
    await kernel.handle({ kind: "init" });
    expect(messages).toEqual([{ kind: "ready" }]);
    expect(isOcctReady()).toBe(true);
  });
});
