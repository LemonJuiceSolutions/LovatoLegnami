import { findByUploadId, type UploadRef } from "@/server/repositories/leads";
import { resolveToken } from "@/server/repositories/tokens";
import { IMAGE_EXTENSIONS, type ImageType, type ValidImage } from "./images";
import { getFileStorage, isUploadId, newUploadKey, uploadKey, type FileStorage } from "./storage";

/**
 * File della richiesta: salvataggio delle immagini già validate e lettura con controllo
 * d'accesso per `GET /api/uploads/[id]` (utente interno con `richieste:leggi` oppure token
 * del cliente della **stessa** richiesta).
 */

/** Salva le immagini con chiavi casuali; in caso di errore cancella quelle già scritte. */
export async function storeImages(images: readonly ValidImage[], kind: UploadRef["kind"], storage: FileStorage = getFileStorage()): Promise<UploadRef[]> {
  const refs: UploadRef[] = [];
  try {
    for (const image of images) {
      const { id, key } = newUploadKey(kind);
      await storage.put(key, image.bytes, image.contentType);
      refs.push({ id, kind, contentType: image.contentType, size: image.size });
    }
    return refs;
  } catch (e) {
    await deleteUploads(refs, storage);
    throw e;
  }
}

/** Cancella i file (anonimizzazione, rollback): ignora i riferimenti non validi e gli errori singoli. */
export async function deleteUploads(refs: readonly unknown[], storage: FileStorage = getFileStorage()): Promise<void> {
  for (const ref of refs) {
    const r = ref as Partial<UploadRef>;
    if (typeof r?.id !== "string" || (r.kind !== "foto" && r.kind !== "scena") || !isUploadId(r.id)) continue;
    try {
      await storage.delete(uploadKey(r.kind, r.id));
    } catch {
      // un file già assente o un errore di rete non deve bloccare l'anonimizzazione
    }
  }
}

export type UploadAccess = { readonly kind: "utente" } | { readonly kind: "token"; readonly token: string };

export type UploadReadResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly contentType: string; readonly filename: string }
  | { readonly ok: false; readonly status: 404 };

/**
 * Legge il file `id` per chi ha l'accesso indicato (l'utente interno è già stato verificato
 * dal chiamante). Id malformato, sconosciuto, di un'altra richiesta o file assente ⇒ 404
 * (stessa risposta, nessuna informazione su cosa esiste).
 */
export async function readUpload(id: string, access: UploadAccess, storage: FileStorage = getFileStorage()): Promise<UploadReadResult> {
  if (!isUploadId(id)) return { ok: false, status: 404 };
  const found = await findByUploadId(id);
  if (!found) return { ok: false, status: 404 };
  if (access.kind === "token") {
    const resolved = await resolveToken(access.token);
    if (!resolved || resolved.leadId !== found.leadId) return { ok: false, status: 404 };
  }
  const file = await storage.get(uploadKey(found.upload.kind, id));
  if (!file) return { ok: false, status: 404 };
  // Il tipo servito è quello dedotto dai byte al caricamento, mai un valore del cliente.
  const contentType = found.upload.contentType in IMAGE_EXTENSIONS ? found.upload.contentType : "application/octet-stream";
  const ext = IMAGE_EXTENSIONS[contentType as ImageType] ?? "bin";
  return { ok: true, bytes: file.bytes, contentType, filename: `${found.upload.kind}-${id.slice(0, 8)}.${ext}` };
}
