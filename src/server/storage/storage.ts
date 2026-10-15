import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/server/env";

/**
 * Archivio dei file caricati (P7): `vercelBlobStorage` in produzione (store **privato**:
 * nessun URL pubblico, lettura solo con il token del server), `localDiskStorage` in
 * sviluppo (`.data/uploads/`), `createMemoryStorage` nei test. I file sono serviti solo da
 * `GET /api/uploads/[id]` dopo il controllo di accesso, mai con un collegamento diretto.
 *
 * Le chiavi sono generate dal server (`newUploadKey`: prefisso + 24 byte casuali in
 * base64url, non indovinabili) e verificate da `assertKey` in ogni implementazione: niente
 * percorsi scelti dal cliente, niente `..`.
 */

export interface StoredFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface FileStorage {
  readonly kind: "blob" | "disk" | "memory";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

export const UPLOAD_PREFIXES = ["foto", "scena"] as const;
export type UploadPrefix = (typeof UPLOAD_PREFIXES)[number];

const KEY_RE = /^(foto|scena)\/[A-Za-z0-9_-]{32}$/;
const ID_RE = /^[A-Za-z0-9_-]{32}$/;

export class StorageKeyError extends Error {
  constructor() {
    super("chiave di archivio non valida");
    this.name = "StorageKeyError";
  }
}

export const isUploadId = (id: string): boolean => ID_RE.test(id);

export function assertKey(key: string): string {
  if (!KEY_RE.test(key)) throw new StorageKeyError();
  return key;
}

/** Nuovo identificativo (24 byte casuali ⇒ 32 caratteri base64url) e chiave d'archivio. */
export function newUploadKey(prefix: UploadPrefix): { id: string; key: string } {
  const id = randomBytes(24).toString("base64url");
  return { id, key: `${prefix}/${id}` };
}

export const uploadKey = (prefix: UploadPrefix, id: string): string => assertKey(`${prefix}/${id}`);

// ---------------------------------------------------------------------------

export function createMemoryStorage(): FileStorage & { readonly files: Map<string, StoredFile> } {
  const files = new Map<string, StoredFile>();
  return {
    kind: "memory",
    files,
    async put(key, bytes, contentType) {
      files.set(assertKey(key), { bytes: new Uint8Array(bytes), contentType });
    },
    async get(key) {
      return files.get(assertKey(key)) ?? null;
    },
    async delete(key) {
      files.delete(assertKey(key));
    },
  };
}

/** Disco locale: `<root>/<prefisso>/<id>` più `<id>.type` con il tipo MIME. */
export function createLocalDiskStorage(root: string = path.join(process.cwd(), ".data", "uploads")): FileStorage {
  const resolve = (key: string) => {
    const file = path.resolve(root, assertKey(key));
    if (!file.startsWith(path.resolve(root) + path.sep)) throw new StorageKeyError();
    return file;
  };
  return {
    kind: "disk",
    async put(key, bytes, contentType) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      await writeFile(`${file}.type`, contentType, "utf8");
    },
    async get(key) {
      const file = resolve(key);
      try {
        const [bytes, contentType] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
        return { bytes: new Uint8Array(bytes), contentType: contentType.trim() };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      const file = resolve(key);
      await rm(file, { force: true });
      await rm(`${file}.type`, { force: true });
    },
  };
}

/** Vercel Blob, store privato (`@vercel/blob` importato solo quando serve). */
export function createVercelBlobStorage(token: string): FileStorage {
  return {
    kind: "blob",
    async put(key, bytes, contentType) {
      const { put } = await import("@vercel/blob");
      await put(assertKey(key), Buffer.from(bytes), { access: "private", token, contentType, addRandomSuffix: false, allowOverwrite: false });
    },
    async get(key) {
      const { get } = await import("@vercel/blob");
      const result = await get(assertKey(key), { access: "private", token, useCache: false });
      if (!result || result.statusCode !== 200) return null;
      const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
      return { bytes, contentType: result.blob.contentType };
    },
    async delete(key) {
      const { del } = await import("@vercel/blob");
      await del(assertKey(key), { token });
    },
  };
}

let override: FileStorage | undefined;
let cached: FileStorage | undefined;

/** Archivio del processo, scelto da `getEnv().services.storage`. */
export function getFileStorage(): FileStorage {
  if (override) return override;
  if (!cached) {
    const env = getEnv();
    cached = env.services.storage === "blob" && env.blobToken ? createVercelBlobStorage(env.blobToken) : createLocalDiskStorage();
  }
  return cached;
}

/** Solo test: sostituisce l'archivio (`undefined` ripristina la scelta da env). */
export function setFileStorage(storage: FileStorage | undefined): void {
  override = storage;
  cached = undefined;
}
