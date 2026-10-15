/**
 * Validazione delle foto del cliente (P7, spec `richieste-preventivo`): il tipo è dedotto
 * dai **byte iniziali** (magic bytes), mai dal nome del file o dal `Content-Type` dichiarato
 * dal browser; ammessi JPEG, PNG, WebP, HEIC/HEIF; ≤ 8 MB ciascuna; al massimo 5.
 * Nessuna decodifica dell'immagine sul server (niente librerie di immagini esposte a file
 * ostili): il file è conservato così com'è e servito con il tipo dedotto e `nosniff`.
 */

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/** Immagine della scena catturata dal viewer (PNG/JPEG), allegata alla richiesta per il PDF. */
export const MAX_SCENE_BYTES = 4 * 1024 * 1024;

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";

export const IMAGE_EXTENSIONS: Readonly<Record<ImageType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const ONLY_IMAGES_MESSAGE = "sono ammesse solo immagini";

export class UploadError extends Error {
  constructor(
    message: string,
    readonly field: string = "photos",
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const HEIF_BRANDS = new Set(["mif1", "msf1"]);

/** Tipo dell'immagine dai byte iniziali; `null` se non è un formato ammesso. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (HEIC_BRANDS.has(brand)) return "image/heic";
    if (HEIF_BRANDS.has(brand)) return "image/heif";
  }
  return null;
}

export interface UploadedFile {
  readonly name?: string;
  readonly bytes: Uint8Array;
}

export interface ValidImage {
  readonly bytes: Uint8Array;
  readonly contentType: ImageType;
  readonly size: number;
}

/** Valida un'immagine (tipo reale e dimensione). Lancia `UploadError`. */
export function validateImage(file: UploadedFile, options: { maxBytes?: number; field?: string; allowed?: readonly ImageType[] } = {}): ValidImage {
  const field = options.field ?? "photos";
  const maxBytes = options.maxBytes ?? MAX_PHOTO_BYTES;
  if (file.bytes.byteLength === 0) throw new UploadError("file vuoto", field);
  if (file.bytes.byteLength > maxBytes) throw new UploadError(`ogni immagine può pesare al massimo ${Math.round(maxBytes / (1024 * 1024))} MB`, field);
  const contentType = sniffImageType(file.bytes);
  if (!contentType || (options.allowed && !options.allowed.includes(contentType))) throw new UploadError(ONLY_IMAGES_MESSAGE, field);
  return { bytes: file.bytes, contentType, size: file.bytes.byteLength };
}

/** Valida le foto della richiesta: al massimo 5, ognuna immagine ≤ 8 MB. */
export function validatePhotos(files: readonly UploadedFile[]): ValidImage[] {
  if (files.length > MAX_PHOTOS) throw new UploadError(`puoi allegare al massimo ${MAX_PHOTOS} foto`);
  return files.map((f) => validateImage(f));
}
