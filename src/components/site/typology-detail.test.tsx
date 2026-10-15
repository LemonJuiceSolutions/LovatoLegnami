import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { fakeTypology } from "./__fixtures__/content"
import { TypologyDetail, TypologyList } from "./typology-detail"

describe("pagina tipologia (11.3)", () => {
  it("titolo, descrizione, prezzo 'a partire da', caratteristiche e wizard precompilato", () => {
    render(<TypologyDetail typology={fakeTypology()} />)
    expect(screen.getByRole("heading", { level: 1, name: "Pergola bifalda" })).toBeTruthy()
    expect(screen.getByText("Due falde su quattro pilastri.")).toBeTruthy()
    expect(screen.getByText("7.890 €")).toBeTruthy()
    expect(screen.getByText(/Per 5,00 × 4,00 m \(Bifalda libera\)/)).toBeTruthy()
    expect(screen.getByText(/prezzo indicativo: quello definitivo arriva dopo il sopralluogo/)).toBeTruthy()
    expect(screen.getByText("Larghezza da 2,00 a 7,00 m")).toBeTruthy()
    for (const link of screen.getAllByRole("link", { name: /Calcola il prezzo con le tue misure|Inizia dal preventivo/ }))
      expect(link.getAttribute("href")).toBe("/preventivo?tipologia=autoportante-bifalda")
    expect(screen.getByRole("img", { name: "Disegno di prova" })).toBeTruthy()
  })

  it("immagini dell'ufficio: foto principale e sezione Immagini", () => {
    render(
      <TypologyDetail
        typology={fakeTypology({
          heroImage: { src: "/foto/bifalda.jpg", alt: "Bifalda in larice a Bussolengo" },
          gallery: [{ src: "/foto/dettaglio.jpg", alt: "Dettaglio del colmo" }],
        })}
      />,
    )
    expect(screen.getAllByAltText("Bifalda in larice a Bussolengo")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 2, name: "Immagini" })).toBeTruthy()
    expect(screen.getByAltText("Dettaglio del colmo")).toBeTruthy()
  })

  it("senza prezzo: su richiesta", () => {
    render(<TypologyDetail typology={fakeTypology({ fromPrice: null })} />)
    expect(screen.getByText(/Prezzo su richiesta/)).toBeTruthy()
  })

  it("nessuna violazione WCAG A/AA", async () => {
    const { container } = render(
      <main>
        <TypologyDetail typology={fakeTypology()} />
      </main>,
    )
    expect(await axeViolations(container)).toEqual([])
  })
})

describe("elenco tipologie (11.3)", () => {
  it("raggruppa per categoria nell'ordine ricevuto", () => {
    render(
      <TypologyList
        typologies={[
          fakeTypology(),
          fakeTypology({ slug: "addossata-monofalda", seoSlug: "addossata", title: "Addossata", categoryLabel: "Addossate al muro" }),
          fakeTypology({ slug: "portale-sandwich", seoSlug: "libera", title: "Libera" }),
        ]}
      />,
    )
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Autoportanti", "Addossate al muro"])
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Pergola bifalda", "Libera", "Addossata"])
  })
})
