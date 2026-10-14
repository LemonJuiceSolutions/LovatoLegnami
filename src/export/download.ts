/**
 * Download di un file nel browser tramite `Blob` + link temporaneo. Da usare
 * solo in client component (gli oggetti del DOM sono iniettabili per i test).
 */

export type DownloadData = Blob | string | Uint8Array;

export interface DownloadEnv {
  readonly document: Pick<Document, "createElement" | "body">;
  readonly URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  /** Rinvia la revoca dell'URL (default `setTimeout`, il download deve partire prima). */
  readonly defer?: (fn: () => void) => void;
}

/** Blob del contenuto con il tipo MIME dato (un Blob in ingresso è riusato se ha già un tipo). */
export function toBlob(data: DownloadData, mimeType: string): Blob {
  if (data instanceof Blob) return data.type ? data : new Blob([data], { type: mimeType });
  // Copia in un ArrayBuffer proprio: le viste su SharedArrayBuffer non sono BlobPart.
  const part = typeof data === "string" ? data : new Uint8Array(data).buffer;
  return new Blob([part], { type: mimeType });
}

/** Avvia il download di `data` con nome `fileName`. */
export function downloadFile(data: DownloadData, fileName: string, mimeType: string, env?: DownloadEnv): void {
  const e: DownloadEnv = env ?? { document, URL };
  const url = e.URL.createObjectURL(toBlob(data, mimeType));
  const a = e.document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  e.document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    (e.defer ?? ((fn) => setTimeout(fn, 0)))(() => e.URL.revokeObjectURL(url));
  }
}
