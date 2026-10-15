import { setOC } from "replicad";
import type { OpenCascadeInstance } from "replicad-opencascadejs";
import { version as OCCT_PACKAGE_VERSION } from "replicad-opencascadejs/package.json";

/**
 * Inizializzazione del kernel OpenCascade (WASM) come singleton (D6, D13).
 *
 * Nel browser (worker) la glue `replicad_single.js` e il `.wasm` sono serviti
 * da `public/occt/<versione>/` (copiati da `scripts/copy-occt-wasm.mjs`, P12: la
 * versione del pacchetto nel percorso permette la cache immutabile) e caricati a
 * runtime con un `import()` ignorato da webpack + `locateFile`: il bundle non
 * contiene il WASM né la glue (che importa moduli `node:`). In Node (test
 * geometry) si passa `nodeOcctFactory` da `init-node.ts`, che carica il WASM
 * dal pacchetto in `node_modules`.
 */

export type OcctFactory = (moduleArg: {
  locateFile?: (path: string, prefix: string) => string;
}) => Promise<OpenCascadeInstance>;

export interface InitOptions {
  /** Base URL degli asset OCCT nel browser (default `/occt/<versione>/`). */
  readonly assetBase?: string;
  /** Factory del modulo (default: import a runtime da `assetBase`). */
  readonly factory?: OcctFactory;
}

export class OcctInitError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OcctInitError";
  }
}

/** Versione di `replicad-opencascadejs`: è anche la cartella degli asset in `public/occt/`. */
export const OCCT_VERSION: string = OCCT_PACKAGE_VERSION;
/** Percorso versionato degli asset OCCT (vedi `scripts/copy-occt-wasm.mjs`). */
export const DEFAULT_ASSET_BASE = `/occt/${OCCT_VERSION}/`;
const GLUE_FILE = "replicad_single.js";

/** Factory per il browser: importa la glue da `assetBase` senza passare da webpack. */
export function browserOcctFactory(assetBase: string = DEFAULT_ASSET_BASE): OcctFactory {
  const base = assetBase.endsWith("/") ? assetBase : `${assetBase}/`;
  return async (moduleArg) => {
    const mod = (await import(/* webpackIgnore: true */ `${base}${GLUE_FILE}`)) as {
      default: (arg: unknown) => Promise<OpenCascadeInstance>;
    };
    return mod.default({ locateFile: (path: string) => `${base}${path}`, ...moduleArg });
  };
}

let instance: OpenCascadeInstance | null = null;
let pending: Promise<OpenCascadeInstance> | null = null;

/**
 * Inizializza OCCT una sola volta (chiamate concorrenti condividono la stessa
 * promessa) e registra l'istanza in replicad. In caso di errore lancia
 * `OcctInitError` e consente un nuovo tentativo.
 */
export function initOcct(options: InitOptions = {}): Promise<OpenCascadeInstance> {
  if (instance) return Promise.resolve(instance);
  if (pending) return pending;
  const factory = options.factory ?? browserOcctFactory(options.assetBase);
  pending = factory({})
    .then((oc) => {
      setOC(oc);
      instance = oc;
      return oc;
    })
    .catch((e: unknown) => {
      pending = null;
      const reason = e instanceof Error ? e.message : String(e);
      throw new OcctInitError(`Impossibile inizializzare il kernel geometrico (WASM OCCT): ${reason}`, { cause: e });
    });
  return pending;
}

/** Istanza OCCT già inizializzata; lancia se `initOcct` non è stato completato. */
export function occt(): OpenCascadeInstance {
  if (!instance) throw new OcctInitError("Kernel geometrico non inizializzato: chiamare initOcct()");
  return instance;
}

export const isOcctReady = (): boolean => instance !== null;
