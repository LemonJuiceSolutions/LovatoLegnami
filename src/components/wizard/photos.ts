/**
 * Foto del cantiere (12.7, P7): solo immagini, al massimo 5, ridimensionate nel browser a
 * 2000 px sul lato lungo (JPEG) prima dell'invio. Serve anche al limite di 4,5 MB del corpo
 * di una richiesta su Vercel: 5 foto ridimensionate stanno sotto i 4 MB.
 */

export const MAX_PHOTOS = 5
export const MAX_SIDE_PX = 2000
/** Budget dell'invio (foto + scena + dati) sotto il limite di 4,5 MB delle Function di Vercel. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
/** Senza ridimensionamento (formato non decodificabile dal browser) si accetta l'originale fino a qui. */
export const MAX_RAW_BYTES = 2.5 * 1024 * 1024

export const ONLY_IMAGES = "Sono ammesse solo immagini (JPEG, PNG, WebP o HEIC)."
export const TOO_MANY = `Puoi allegare al massimo ${MAX_PHOTOS} foto.`
export const TOO_HEAVY = "Le foto sono troppo pesanti per l'invio: togline qualcuna."
export const UNREADABLE = "Non riusciamo a leggere questa foto: prova con una foto JPEG."

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i

/** Immagine "fotografica" ammessa: tipo `image/*` (non SVG) o estensione nota se il tipo manca. */
export function isPhoto(file: Pick<File, "type" | "name">): boolean {
  if (file.type) return file.type.startsWith("image/") && file.type !== "image/svg+xml"
  return IMAGE_EXT.test(file.name)
}

export interface Resizer {
  (file: File): Promise<Blob>
}

/** Ridimensiona a `MAX_SIDE_PX` (JPEG 0,82) con `createImageBitmap` e un canvas. */
export const resizePhoto: Resizer = async (file) => {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas non disponibile")
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))
  if (!blob) throw new Error("conversione non riuscita")
  return blob
}

export interface PreparedPhoto {
  readonly id: string
  readonly name: string
  readonly blob: Blob
}

/**
 * Prepara le foto scelte: errore se non sono immagini o sono troppe; ridimensiona, e se il
 * browser non sa decodificare il formato tiene l'originale solo se è leggero.
 */
export async function preparePhotos(
  files: readonly File[],
  already: number,
  resize: Resizer = resizePhoto,
): Promise<{ photos: PreparedPhoto[]; error: string | null }> {
  if (files.some((f) => !isPhoto(f))) return { photos: [], error: ONLY_IMAGES }
  if (already + files.length > MAX_PHOTOS) return { photos: [], error: TOO_MANY }
  const photos: PreparedPhoto[] = []
  for (const file of files) {
    let blob: Blob
    try {
      blob = await resize(file)
    } catch {
      if (file.size > MAX_RAW_BYTES) return { photos: [], error: UNREADABLE }
      blob = file
    }
    const name = file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/jpeg" ? ".jpg" : "")
    photos.push({ id: `${Date.now()}-${photos.length}-${Math.random().toString(36).slice(2, 8)}`, name, blob })
  }
  return { photos, error: null }
}
