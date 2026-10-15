import type { Shape3D, Solid } from "replicad";
import { measureVolume } from "replicad";
import { exportStep } from "@/export/step";
import { LruCache, pieceCacheKey } from "./cache";
import type { NeutralBrep } from "./neutral-brep";
import { PieceBuildError, buildPieceSolid, errorMessage } from "./occt/build-piece";
import { extractBrep } from "./occt/extract-brep";
import { initOcct, type OcctFactory } from "./occt/init";
import { DEFAULT_ANGULAR_TOLERANCE, DEFAULT_MESH_TOLERANCE, meshShape } from "./occt/mesh";
import { placeShape } from "./occt/pose";
import {
  transferablesOf,
  type BuildRequest,
  type ClientMessage,
  type ExportStepRequest,
  type PieceExportError,
  type PieceGeometryInput,
  type PieceMesh,
  type PieceResult,
  type WorkerMessage,
} from "./protocol";

/**
 * Logica del worker del kernel, indipendente dal contesto (`kernel.worker.ts`
 * la collega a `self`; i test geometry la usano direttamente in Node).
 *
 * - Una `build` nuova invalida le precedenti: tra un pezzo e l'altro il ciclo
 *   cede il controllo (così `cancel`/nuove richieste vengono ricevute) e si
 *   interrompe se l'id non è più quello corrente; nessun messaggio viene
 *   emesso per richieste superate.
 * - Cache LRU per chiave di pezzo (+ tolleranze di mesh): pezzi identici sono
 *   costruiti una volta; ogni risultato porta la propria posa.
 */

export interface KernelOptions {
  /** Invio dei messaggi al client (con i buffer trasferibili). */
  readonly post: (msg: WorkerMessage, transfer: ArrayBuffer[]) => void;
  /** Factory OCCT (default: browser, da `/occt/<versione>/`). */
  readonly factory?: OcctFactory;
  /** Capacità della cache (numero di solidi distinti). */
  readonly cacheSize?: number;
  /** Cede il controllo all'event loop tra un pezzo e l'altro. */
  readonly yieldControl?: () => Promise<void>;
}

/** Solido costruito e dati derivati, condivisi tra pezzi identici. */
interface CachedSolid {
  readonly solid?: Solid;
  readonly mesh?: PieceMesh;
  readonly brep?: NeutralBrep;
  readonly volume?: number;
  readonly error?: PieceResult["error"];
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const copyMesh = (m: PieceMesh): PieceMesh => ({
  positions: m.positions.slice(),
  normals: m.normals.slice(),
  indices: m.indices.slice(),
});

export interface Kernel {
  handle(msg: ClientMessage): Promise<void>;
  /** Contatori diagnostici: solidi costruiti, risultati serviti dalla cache. */
  readonly stats: { readonly builds: number; readonly cacheHits: number };
  /** Solido in cache di un pezzo (per l'export STEP), se presente. */
  solidFor(piece: PieceGeometryInput, options?: BuildRequest["options"]): Solid | undefined;
  clearCache(): void;
}

export function createKernel(options: KernelOptions): Kernel {
  const yieldControl = options.yieldControl ?? defaultYield;
  const stats = { builds: 0, cacheHits: 0 };
  const cache = new LruCache<CachedSolid>(options.cacheSize ?? 512, (v) => v.solid?.delete());
  let current = -1;
  let initPromise: Promise<unknown> | null = null;

  const post = (msg: WorkerMessage) => options.post(msg, transferablesOf(msg));

  const ensureInit = (assetBase?: string): Promise<unknown> => {
    if (!initPromise) {
      initPromise = initOcct({ factory: options.factory, assetBase }).catch((e: unknown) => {
        initPromise = null;
        throw e;
      });
    }
    return initPromise;
  };

  const keyFor = (piece: PieceGeometryInput, opts: BuildRequest["options"]) => {
    const pieceKey = pieceCacheKey(piece);
    const tol = opts?.tolerance ?? DEFAULT_MESH_TOLERANCE;
    const ang = opts?.angularTolerance ?? DEFAULT_ANGULAR_TOLERANCE;
    return { pieceKey, entryKey: `${pieceKey}|${tol}|${ang}|${opts?.brep === false ? "m" : "mb"}` };
  };

  const buildOne = (piece: PieceGeometryInput, opts: BuildRequest["options"]): CachedSolid => {
    stats.builds++;
    let solid: Solid | undefined;
    try {
      solid = buildPieceSolid(piece);
      const mesh = meshShape(solid, { tolerance: opts?.tolerance, angularTolerance: opts?.angularTolerance });
      const brep = opts?.brep === false ? undefined : extractBrep(solid);
      return { solid, mesh, brep, volume: measureVolume(solid) };
    } catch (e) {
      solid?.delete();
      if (e instanceof PieceBuildError)
        return { error: { message: e.message, machiningId: e.machiningId, machiningType: e.machiningType } };
      return { error: { message: `Pezzo ${piece.id}: ${errorMessage(e)}` } };
    }
  };

  /** Voce di cache del pezzo, costruita se manca. */
  const entryFor = (piece: PieceGeometryInput, opts: BuildRequest["options"]) => {
    const keys = keyFor(piece, opts);
    let entry = cache.get(keys.entryKey);
    let fresh = false;
    if (entry) stats.cacheHits++;
    else {
      entry = buildOne(piece, opts);
      fresh = true;
      cache.set(keys.entryKey, entry);
    }
    return { ...keys, entry, fresh };
  };

  /** Export STEP (9.1): solidi in cache posizionati con la posa del pezzo. */
  const exportStepFile = async (req: ExportStepRequest): Promise<void> => {
    try {
      await ensureInit();
    } catch (e) {
      post({ kind: "error", id: req.id, phase: "init", message: errorMessage(e) });
      return;
    }
    const placed: Shape3D[] = [];
    const written: string[] = [];
    const errors: PieceExportError[] = [];
    try {
      for (const piece of req.pieces) {
        const { entry } = entryFor(piece, req.options);
        if (!entry.solid) {
          errors.push({ pieceId: piece.id, message: entry.error?.message ?? `Pezzo ${piece.id}: solido non disponibile` });
          continue;
        }
        try {
          placed.push(placeShape(entry.solid, piece.pose));
          written.push(piece.id);
        } catch (e) {
          errors.push({ pieceId: piece.id, message: `Pezzo ${piece.id}: ${errorMessage(e)}` });
        }
      }
      if (placed.length === 0) {
        post({ kind: "error", id: req.id, phase: "export", message: "Export STEP: nessun pezzo esportabile" });
        return;
      }
      const data = await exportStep(placed, written);
      post({ kind: "step-result", id: req.id, data, written, errors });
    } catch (e) {
      post({ kind: "error", id: req.id, phase: "export", message: errorMessage(e) });
    } finally {
      for (const s of placed) s.delete();
    }
  };

  const build = async (req: BuildRequest): Promise<void> => {
    current = req.id;
    try {
      await ensureInit();
    } catch (e) {
      if (current === req.id) post({ kind: "error", id: req.id, phase: "init", message: errorMessage(e) });
      return;
    }
    const total = req.pieces.length;
    let built = 0;
    if (current !== req.id) return;
    post({ kind: "progress", id: req.id, done: 0, total });
    for (let i = 0; i < total; i++) {
      await yieldControl();
      if (current !== req.id) return;
      const piece = req.pieces[i];
      const { pieceKey, entry, fresh } = entryFor(piece, req.options);
      if (fresh) built++;
      const result: PieceResult = {
        pieceId: piece.id,
        cacheKey: pieceKey,
        pose: piece.pose,
        ...(entry.mesh ? { mesh: copyMesh(entry.mesh) } : {}),
        ...(entry.brep ? { brep: entry.brep } : {}),
        ...(entry.volume !== undefined ? { volume: entry.volume } : {}),
        ...(entry.error ? { error: { ...entry.error, message: entry.error.message.replace(/^Pezzo [^\s:(]+/, `Pezzo ${piece.id}`) } } : {}),
      };
      post({ kind: "piece-result", id: req.id, result });
      post({ kind: "progress", id: req.id, done: i + 1, total, pieceId: piece.id });
    }
    if (current === req.id) post({ kind: "done", id: req.id, total, built });
  };

  return {
    stats,
    async handle(msg) {
      switch (msg.kind) {
        case "init":
          try {
            await ensureInit(msg.assetBase);
            post({ kind: "ready" });
          } catch (e) {
            post({ kind: "error", id: null, phase: "init", message: errorMessage(e) });
          }
          return;
        case "cancel":
          if (msg.id >= current) current = msg.id + 0.5; // nessuna richiesta corrente
          return;
        case "build":
          if (msg.id < current) return; // richiesta già superata
          return build(msg);
        case "export-step":
          return exportStepFile(msg);
      }
    },
    solidFor(piece, opts) {
      return cache.get(keyFor(piece, opts).entryKey)?.solid;
    },
    clearCache() {
      cache.clear();
    },
  };
}
