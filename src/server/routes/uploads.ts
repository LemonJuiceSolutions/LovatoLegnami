import { handleAuthError, requireUser } from "@/server/auth";
import { errorResponse, internalError } from "@/server/http";
import { readUpload, type UploadAccess } from "@/server/storage/uploads";

/**
 * `GET /api/uploads/[id]` (P7): file di una richiesta per un utente interno con
 * `richieste:leggi` oppure con `?t=<token del cliente>` della stessa richiesta. Il file è
 * servito con il tipo dedotto al caricamento, `nosniff`, CSP che vieta ogni contenuto
 * attivo e senza cache condivise.
 */
export async function handleUploadGet(req: Request, id: string): Promise<Response> {
  try {
    const token = new URL(req.url).searchParams.get("t");
    let access: UploadAccess;
    if (token) {
      access = { kind: "token", token };
    } else {
      try {
        await requireUser("richieste:leggi");
      } catch (e) {
        const res = handleAuthError(e);
        if (res) return res;
        throw e;
      }
      access = { kind: "utente" };
    }
    const file = await readUpload(id, access);
    if (!file.ok) return errorResponse(404, "file non trovato");
    return new Response(Buffer.from(file.bytes), {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.bytes.byteLength),
        "content-disposition": `inline; filename="${file.filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cross-origin-resource-policy": "same-origin",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (e) {
    return internalError(e, "uploads");
  }
}
