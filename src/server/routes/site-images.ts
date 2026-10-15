import { errorResponse, internalError } from "@/server/http";
import { getFileStorage, StorageKeyError, uploadKey } from "@/server/storage/storage";

/**
 * `GET /api/immagini/[id]` (9.7): immagini delle tipologie caricate dall'admin, **pubbliche**
 * (le usa il sito). Solo chiavi `sito/<id>` generate dal server: le foto dei clienti
 * (`foto/`, `scena/`) non sono raggiungibili da qui. Tipo dedotto al caricamento, `nosniff`,
 * CSP senza contenuti attivi, cache pubblica di un giorno.
 */
export async function handleSiteImageGet(id: string): Promise<Response> {
  try {
    let key: string;
    try {
      key = uploadKey("sito", id);
    } catch (e) {
      if (e instanceof StorageKeyError) return errorResponse(404, "immagine non trovata");
      throw e;
    }
    const file = await getFileStorage().get(key);
    if (!file || !file.contentType.startsWith("image/")) return errorResponse(404, "immagine non trovata");
    return new Response(Buffer.from(file.bytes), {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.bytes.byteLength),
        "cache-control": "public, max-age=86400",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return internalError(e, "immagini");
  }
}
