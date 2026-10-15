import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { fakeContent, fakeTypology } from "./__fixtures__/content"
import { companyInfo } from "./company"
import { Gallery } from "./gallery"
import { HomeContent } from "./home"
import { SiteFooter } from "./site-footer"
import { SiteHeader } from "./site-header"
import { Steps } from "./steps"
import { TypologyCard } from "./typology-card"

const company = companyInfo({})

function renderPage() {
  return render(
    <div>
      <SiteHeader />
      <main id="contenuto">
        <HomeContent content={fakeContent()} company={company} />
      </main>
      <SiteFooter company={company} />
    </div>,
  )
}

describe("home del sito (11.2)", () => {
  it("presenta l'azienda, le tipologie in evidenza, come funziona, la galleria e i contatti", () => {
    renderPage()
    expect(screen.getByRole("heading", { level: 1, name: /Pergole in legno, disegnate sulle tue misure/ })).toBeTruthy()
    for (const name of ["Scegli la forma", "Come funziona", "Dal legname alla pergola montata", "Dalla galleria", "Parliamone"])
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 3, name: "Pergola bifalda" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 3, name: "Pergola addossata" })).toBeTruthy()
    expect(screen.getAllByRole("link", { name: /^Calcola il prezzo$/ })[0].getAttribute("href")).toBe("/preventivo")
    expect(screen.getAllByRole("link", { name: company.phone })[0].getAttribute("href")).toBe("tel:+390456700620")
  })

  it("il cartiglio dell'eroe riporta misure e prezzo di partenza della prima tipologia", () => {
    renderPage()
    const hero = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement
    expect(within(hero).getByText("5,00 m × 4,00 m")).toBeTruthy()
    expect(within(hero).getByText("da 7.890 €")).toBeTruthy()
  })

  it("senza listino il cartiglio non inventa misure né prezzi", () => {
    render(<HomeContent content={fakeContent({ typologies: [fakeTypology({ fromPrice: null })] })} company={company} />)
    const hero = screen.getByRole("heading", { level: 1 }).closest("section") as HTMLElement
    expect(within(hero).getByText("Prezzo calcolato sulle tue misure")).toBeTruthy()
    expect(within(hero).queryByText(/€/)).toBeNull()
  })

  it("nessuna violazione WCAG A/AA rilevabile da axe", async () => {
    const { container } = renderPage()
    expect(await axeViolations(container)).toEqual([])
  })

  it("senza tipologie visibili invita a chiamare", () => {
    render(<HomeContent content={fakeContent({ typologies: [], gallery: [] })} company={company} />)
    expect(screen.getByText(/chiamaci e ti consigliamo noi/)).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Dalla galleria" })).toBeNull()
  })
})

describe("componenti del sito (11.2)", () => {
  it("TypologyCard: prezzo 'da', link alla pagina e al wizard precompilato", () => {
    render(<TypologyCard typology={fakeTypology()} />)
    expect(screen.getByText("7.890 €")).toBeTruthy()
    expect(screen.getByText(/IVA inclusa, per 5,00 × 4,00 m/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Pergola bifalda" }).getAttribute("href")).toBe("/pergole/pergola-bifalda")
    expect(screen.getByRole("link", { name: "Calcola il prezzo di Pergola bifalda" }).getAttribute("href")).toBe("/preventivo?tipologia=autoportante-bifalda")
    // il disegno è decorativo nella scheda (il titolo è già un collegamento)
    expect(screen.getByRole("img", { name: "Disegno di prova", hidden: true })).toBeTruthy()
  })

  it("TypologyCard senza prezzo: 'Prezzo su richiesta'; con immagine dell'ufficio usa next/image", () => {
    render(<TypologyCard typology={fakeTypology({ fromPrice: null, heroImage: { src: "/foto/pergola.jpg", alt: "Pergola" } })} />)
    expect(screen.getByText("Prezzo su richiesta")).toBeTruthy()
    const img = document.querySelector("img") as HTMLImageElement
    expect(img.getAttribute("src")).toContain("pergola.jpg")
    expect(screen.queryByRole("img", { name: "Disegno di prova", hidden: true })).toBeNull()
  })

  it("Steps: quattro passi in ordine", () => {
    render(<Steps />)
    const items = within(screen.getByRole("list")).getAllByRole("listitem")
    expect(items.map((li) => within(li).getByRole("heading").textContent)).toEqual([
      "Scegli la forma",
      "Inserisci le misure",
      "Vedi il prezzo indicativo",
      "Sopralluogo e preventivo",
    ])
  })

  it("Gallery: foto con testo alternativo e disegni con didascalia e misura", () => {
    render(<Gallery items={fakeContent().gallery} />)
    expect(screen.getByAltText("Pergola in larice in un giardino")).toBeTruthy()
    expect(screen.getByText("Pergola bifalda, Bifalda libera")).toBeTruthy()
    expect(screen.getByText("5,00 × 4,00 m")).toBeTruthy()
  })
})
