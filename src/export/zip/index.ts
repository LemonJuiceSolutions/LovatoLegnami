import { strToU8, zipSync, type Zippable } from "fflate";

/** Voce di un archivio ZIP: nome (percorso interno) e contenuto (testo UTF-8 o byte). */
export interface ZipEntry {
  readonly name: string;
  readonly content: string | Uint8Array;
}

export interface ZipOptions {
  /** Data di modifica delle voci (default: adesso); fissarla rende l'archivio deterministico. */
  readonly date?: Date;
  /** Livello di compressione DEFLATE 0–9 (default 6). */
  readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

/** Crea un archivio ZIP in memoria (fflate, sincrono). Nomi duplicati → errore. */
export function zipFiles(entries: readonly ZipEntry[], options: ZipOptions = {}): Uint8Array {
  const files: Zippable = {};
  const mtime = options.date ?? new Date();
  for (const e of entries) {
    if (e.name in files) throw new Error(`ZIP: voce duplicata "${e.name}"`);
    const data = typeof e.content === "string" ? strToU8(e.content) : e.content;
    files[e.name] = [data, { mtime, level: options.level ?? 6 }];
  }
  return zipSync(files);
}
