// Modulo export/sat – API pubblica: export SAT dell'assieme (D7, spec `export-cnc`).
import type { Pose } from "@/domain/components/types";
import type { PieceResult } from "@/geometry/protocol";
import { zipFiles } from "../zip";
import { SatExportOptionsSchema, type SatExportOptions, type SatExportOptionsInput, type SatFileMode } from "./options";
import { SatBodyError, writeSat, type SatBodyInput } from "./writer";

export * from "./number";
export * from "./versions";
export * from "./writer";
export * from "./options";
export * from "./validate";
export * from "./compare";

/** Il minimo del pezzo che serve all'export (compatibile con `Piece`). */
export interface SatPieceRef {
  readonly id: string;
  readonly pose: Pose;
}

export interface SatExportFile {
  /** `<id>.sat` per pezzo, `assieme.sat` per il file unico. */
  readonly name: string;
  readonly text: string;
  /** Id dei pezzi contenuti. */
  readonly pieceIds: readonly string[];
}

export interface SatExportResult {
  readonly mode: SatFileMode;
  readonly extension: "sat" | "zip";
  readonly mimeType: string;
  /** Contenuto da scaricare: testo SAT (assieme unico) o archivio ZIP (un file per pezzo). */
  readonly data: string | Uint8Array;
  /** File SAT prodotti (uno per l'assieme, uno per pezzo nello ZIP). */
  readonly files: readonly SatExportFile[];
  /** Id dei pezzi esportati, nell'ordine dell'assieme. */
  readonly written: readonly string[];
  /** Pezzi esclusi con il motivo; gli altri sono comunque esportati. */
  readonly errors: readonly SatBodyError[];
  readonly options: SatExportOptions;
}

export interface SatExportExtra {
  /** Data dell'header e delle voci ZIP (default: adesso). */
  readonly date?: Date;
}

/** Nome di file sicuro per l'id del pezzo. */
export const satFileName = (pieceId: string): string => `${pieceId.replace(/[^A-Za-z0-9._-]/g, "_")}.sat`;

/**
 * Export SAT dell'assieme: un body nominato per pezzo, in mm nel sistema
 * dell'assieme (posa del pezzo applicata alla B-rep locale del kernel).
 * `assieme-unico` → un `.sat` con tutti i body; `un-file-per-pezzo` → ZIP con
 * un `<id>.sat` (un solo body) per pezzo. I pezzi senza B-rep (errore del
 * kernel, risultato mancante) o con superfici non supportate finiscono in
 * `errors` senza bloccare gli altri.
 */
export function exportSat(
  pieces: readonly SatPieceRef[],
  results: readonly PieceResult[],
  options: SatExportOptionsInput & SatExportExtra = {},
): SatExportResult {
  const opts = SatExportOptionsSchema.parse(options);
  const date = options.date ?? new Date();
  const byId = new Map(results.map((r) => [r.pieceId, r]));
  const errors: SatBodyError[] = [];
  const bodies: SatBodyInput[] = [];
  for (const piece of pieces) {
    const r = byId.get(piece.id);
    if (!r?.brep) {
      const why = r?.error ? `solido non costruito (${r.error.message})` : "solido non disponibile";
      errors.push(new SatBodyError(piece.id, "solido", r?.error ? "errore-kernel" : "mancante", why));
      continue;
    }
    bodies.push({ id: piece.id, brep: r.brep, pose: piece.pose });
  }
  const writeOptions = {
    version: opts.version,
    producer: opts.producer,
    includeName: opts.includeName,
    nameAttribute: opts.nameAttribute,
    date,
  };

  if (opts.fileMode === "assieme-unico") {
    const { text, written, errors: bodyErrors } = writeSat(bodies, writeOptions);
    return {
      mode: opts.fileMode,
      extension: "sat",
      mimeType: "application/octet-stream",
      data: text,
      files: [{ name: "assieme.sat", text, pieceIds: written }],
      written,
      errors: sortByPieces(pieces, [...errors, ...bodyErrors]),
      options: opts,
    };
  }

  const files: SatExportFile[] = [];
  for (const body of bodies) {
    const { text, written, errors: bodyErrors } = writeSat([body], writeOptions);
    errors.push(...bodyErrors);
    if (written.length > 0) files.push({ name: satFileName(body.id), text, pieceIds: written });
  }
  return {
    mode: opts.fileMode,
    extension: "zip",
    mimeType: "application/zip",
    data: zipFiles(
      files.map((f) => ({ name: f.name, content: f.text })),
      { date },
    ),
    files,
    written: files.flatMap((f) => f.pieceIds),
    errors: sortByPieces(pieces, errors),
    options: opts,
  };
}

function sortByPieces(pieces: readonly SatPieceRef[], errors: SatBodyError[]): SatBodyError[] {
  const order = new Map(pieces.map((p, i) => [p.id, i]));
  return errors.sort((a, b) => (order.get(a.pieceId) ?? 0) - (order.get(b.pieceId) ?? 0));
}
