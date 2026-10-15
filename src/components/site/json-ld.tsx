import { jsonLdString } from "./seo"

/** Dati strutturati della pagina (JSON con `<`, `>` e `&` escapati: non può chiudere lo script). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />
}
