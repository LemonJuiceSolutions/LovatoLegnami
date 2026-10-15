import { ImageResponse } from "next/og"

/**
 * Immagine Open Graph del sito (11.5): marchio, promessa e luogo sul verde Lovato, con un
 * listello di legno. Usata da `opengraph-image.tsx` (convenzione di Next per la home) e da
 * `/og.png` (URL stabile citato dai metadati di ogni pagina: un `openGraph` di pagina
 * sostituirebbe l'immagine del layout).
 */
import { OG_SIZE } from "./seo"

export { OG_ALT, OG_PATH, OG_SIZE } from "./seo"

export function renderOgImage(): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#1B5A41", color: "#F4F6F2" }}>
        <div style={{ height: 28, display: "flex", background: "linear-gradient(90deg, #C9A06B, #A9763F 40%, #C39459 62%, #9C6B38)" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 80px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ position: "relative", width: 56, height: 56, display: "flex" }}>
              <div style={{ position: "absolute", left: 0, top: 21, width: 56, height: 14, background: "#9EC2AF" }} />
              <div style={{ position: "absolute", left: 21, top: 0, width: 14, height: 56, background: "#BA8B49" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 44, lineHeight: 1 }}>Lovato</div>
              <div style={{ fontSize: 18, letterSpacing: 8, color: "#D9B98A", marginTop: 6 }}>LEGNAMI</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, lineHeight: 1.05, maxWidth: 900 }}>Pergole in legno, disegnate sulle tue misure.</div>
            <div style={{ fontSize: 30, marginTop: 28, color: "#CFE0D6" }}>Prezzo indicativo online. Settimo di Pescantina, Verona, dal 1991.</div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
