/**
 * Immagine della scena 3D per il PDF della richiesta (P9, 12.6): il visualizzatore del
 * riepilogo registra una funzione di cattura (render + `toDataURL` dello stesso frame,
 * senza `preserveDrawingBuffer` permanente); prima di passare ai contatti il riepilogo
 * scatta la foto e la tiene in memoria fino all'invio. Senza immagine (nessun WebGL,
 * pagina ricaricata) il server usa l'assonometria generata.
 */

type Capture = () => string | null

let capture: Capture | null = null
let shot: Blob | null = null

export function registerSceneCapture(fn: Capture | null): void {
  capture = fn
}

/** Scatta e conserva l'immagine della scena; `false` se il visualizzatore non c'è. */
export function takeSceneShot(): boolean {
  const url = capture?.() ?? null
  if (!url?.startsWith("data:image/")) return false
  const [head, b64] = url.split(",", 2)
  const type = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/png"
  try {
    const bin = atob(b64 ?? "")
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    shot = new Blob([bytes], { type })
    return true
  } catch {
    return false
  }
}

export const sceneShot = (): Blob | null => shot
export const clearSceneShot = (): void => {
  shot = null
}
