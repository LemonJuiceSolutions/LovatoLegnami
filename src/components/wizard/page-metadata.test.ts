import { describe, expect, it } from "vitest"
import { generateMetadata, generateStaticParams } from "@/app/(site)/preventivo/[[...step]]/page"

describe("pagina del wizard (12.3)", () => {
  it("passo 1 indicizzabile, dal passo 2 noindex", () => {
    expect(generateMetadata({ params: {} }).robots).toBeUndefined()
    expect(generateMetadata({ params: { step: [] } }).robots).toBeUndefined()
    expect(generateMetadata({ params: { step: ["misure"] } }).robots).toEqual({ index: false, follow: false })
    expect(generateMetadata({ params: { step: ["contatti"] } }).robots).toEqual({ index: false, follow: false })
  })

  it("un percorso per ogni passo", () => {
    expect(generateStaticParams().map((p) => (p.step ?? []).join("/"))).toEqual(["", "misure", "spazio", "finiture", "riepilogo", "contatti"])
  })
})
