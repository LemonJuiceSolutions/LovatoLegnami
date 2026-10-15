import { renderOgImage } from "@/components/site/og-image"

// Immagine statica: generata al build e servita dalla cache.
export const dynamic = "force-static"

export function GET() {
  return renderOgImage()
}
