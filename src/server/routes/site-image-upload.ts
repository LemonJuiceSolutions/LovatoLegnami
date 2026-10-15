import { withUser } from "@/server/auth";
import { errorResponse, internalError, jsonResponse } from "@/server/http";
import { UploadError, validateImage } from "@/server/storage/images";
import { getFileStorage, newUploadKey } from "@/server/storage/storage";

/**
 * `POST /api/admin/immagini` (9.7): carica un'immagine per le schede delle tipologie
 * (solo `tipologie:scrivi`). Multipart con il campo `file`; tipo dai magic bytes (JPEG,
 * PNG, WebP: niente SVG né HEIC, che i browser non mostrano tutti), al massimo 4 MB (limite
 * del corpo delle Function di Vercel). Risposta `{ src }` da usare in `heroImage`/`gallery`.
 */

export const MAX_SITE_IMAGE_BYTES = 4 * 1024 * 1024;

export const handleSiteImageUpload = withUser("tipologie:scrivi", async (_user, req: Request) => {
  try {
    if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return errorResponse(415, "atteso multipart/form-data");
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_SITE_IMAGE_BYTES + 64 * 1024) return errorResponse(413, "immagine troppo grande (massimo 4 MB)");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return errorResponse(400, "nessun file", { issues: [{ path: "file", message: "nessun file" }] });
    let image;
    try {
      image = validateImage({ bytes: new Uint8Array(await file.arrayBuffer()) }, { maxBytes: MAX_SITE_IMAGE_BYTES, field: "file", allowed: ["image/jpeg", "image/png", "image/webp"] });
    } catch (e) {
      if (e instanceof UploadError) return errorResponse(400, e.message, { issues: [{ path: "file", message: e.message }] });
      throw e;
    }
    const { id, key } = newUploadKey("sito");
    await getFileStorage().put(key, image.bytes, image.contentType);
    return jsonResponse({ src: `/api/immagini/${id}` }, 201);
  } catch (e) {
    return internalError(e, "immagini-upload");
  }
});
