import { describe, expect, it } from "vitest"
import { metadata as authMetadata } from "@/app/(auth)/layout"
import { metadata as adminMetadata } from "@/app/(admin)/layout"
import { companyInfo } from "./company"
import { buildRobots, buildSitemap, DISALLOWED_PATHS, jsonLdString, localBusinessJsonLd, pageMetadata, productJsonLd } from "./seo"

const BASE = "https://www.lovatolegnami.it"
const INTERNAL = ["/admin", "/dashboard", "/configuratore", "/ai", "/api", "/accesso", "/preventivo", "/p/"]

describe("sitemap (11.5)", () => {
  const map = buildSitemap(BASE, [{ seoSlug: "pergola-addossata" }, { seoSlug: "pergola-bifalda" }])
  const urls = map.map((e) => e.url)

  it("contiene home, tipologie visibili, galleria, contatti e privacy", () => {
    expect(urls).toEqual([
      `${BASE}/`,
      `${BASE}/pergole`,
      `${BASE}/galleria`,
      `${BASE}/contatti`,
      `${BASE}/privacy`,
      `${BASE}/pergole/pergola-addossata`,
      `${BASE}/pergole/pergola-bifalda`,
    ])
  })

  it("nessun percorso interno", () => {
    for (const u of urls) for (const p of INTERNAL) expect(u.slice(BASE.length).startsWith(p)).toBe(false)
  })
})

describe("robots (11.5)", () => {
  it("esclude aree interne, API, accesso, wizard oltre il primo passo e preventivi dei clienti", () => {
    const r = buildRobots(BASE)
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules
    expect(rule.allow).toBe("/")
    expect(rule.disallow).toEqual([...DISALLOWED_PATHS])
    for (const p of ["/admin", "/dashboard", "/configuratore", "/ai", "/api/", "/accesso", "/preventivo/", "/p/"]) expect(rule.disallow).toContain(p)
    // il primo passo del wizard resta raggiungibile
    expect(rule.disallow).not.toContain("/preventivo")
    expect(r.sitemap).toBe(`${BASE}/sitemap.xml`)
  })
})

describe("noindex delle aree non pubbliche (11.5)", () => {
  it("la pagina di accesso e l'area admin hanno noindex", () => {
    expect(authMetadata.robots).toEqual({ index: false, follow: false })
    expect(adminMetadata.robots).toEqual({ index: false, follow: false })
  })
})

describe("metadati e dati strutturati (11.5)", () => {
  it("pageMetadata: canonical e Open Graph completi", () => {
    const m = pageMetadata({ title: "Contatti", description: "Recapiti", path: "/contatti" })
    expect(m.alternates?.canonical).toBe("/contatti")
    expect(m.openGraph).toMatchObject({ title: "Contatti – Lovato Legnami", description: "Recapiti", url: "/contatti", siteName: "Lovato Legnami", locale: "it_IT" })
  })

  it("LocalBusiness con indirizzo, telefono e orari", () => {
    const ld = localBusinessJsonLd(companyInfo({}), BASE)
    expect(ld["@type"]).toBe("HomeAndConstructionBusiness")
    expect(ld.address).toMatchObject({ postalCode: "37026", addressLocality: "Settimo di Pescantina", addressCountry: "IT" })
    expect(ld.telephone).toBe("+390456700620")
    expect(ld.openingHours).toEqual(["Mo-Fr 08:00-12:00", "Mo-Fr 13:30-17:30"])
  })

  it("Product con offers dal prezzo 'a partire da'; senza prezzo nessuna offerta", () => {
    const base = { title: "Pergola bifalda", description: "Due falde", tagline: "", seoSlug: "pergola-bifalda", categoryLabel: "Autoportanti" }
    const withPrice = productJsonLd(
      { ...base, fromPrice: { totalCents: 548_000, widthMm: 5000, depthMm: 4000, heightMm: 3000, presetName: null, includes: [], finish: "" } },
      BASE,
    )
    expect(withPrice.offers).toMatchObject({ "@type": "Offer", priceCurrency: "EUR", price: "5480.00", url: `${BASE}/pergole/pergola-bifalda` })
    expect(productJsonLd({ ...base, fromPrice: null }, BASE)).not.toHaveProperty("offers")
  })

  it("il JSON-LD non può chiudere il tag script", () => {
    expect(jsonLdString({ name: "</script><script>alert(1)</script>" })).not.toContain("<")
  })
})
