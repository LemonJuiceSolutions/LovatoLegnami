import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { configuratoreStore } from "@/stores/use-configuratore"
import { exampleConfig } from "@/stores/examples"
import { ResultsPanel } from "./results-panel"
import { reviewFit } from "./results-helpers"

const state = () => configuratoreStore.getState()

describe("ResultsPanel", () => {
  beforeEach(() => state().resetConfig("addossata-monofalda"))

  it("senza problemi mostra l'esito positivo", () => {
    render(<ResultsPanel />)
    expect(screen.getByText("Nessuna violazione né collisione.")).toBeTruthy()
  })

  it("auto-dimensiona: riepilogo delle modifiche, annulla e applica", () => {
    act(() => state().setParam("sezioneTrave", "60×80"))
    render(<ResultsPanel />)
    expect(screen.getByText("Errori")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /Auto-dimensiona/ }))
    const dialog = screen.getByRole("dialog")
    const row = within(dialog).getByText("Sezione travi").closest("tr")!
    expect(row.textContent).toContain("60×80 mm")

    fireEvent.click(within(dialog).getByRole("button", { name: "Annulla" }))
    expect(state().config.params.sezioneTrave).toBe("60×80")

    fireEvent.click(screen.getByRole("button", { name: /Auto-dimensiona/ }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Applica modifiche" }))
    expect(state().config.params.sezioneTrave).not.toBe("60×80")
    expect(state().derived.violations.filter((v) => v.severity === "errore" && v.kind === "max-span-by-section")).toHaveLength(0)
  })

  it("clic su una collisione seleziona i pezzi coinvolti", () => {
    act(() => {
      state().loadConfig(exampleConfig("monofalda-grondaia"))
      state().updateObstacle("OST-01", { elevation: 3100 })
    })
    render(<ResultsPanel />)
    const collision = state().derived.collisions[0]
    expect(collision).toBeDefined()
    fireEvent.click(screen.getAllByText(collision.message, { exact: false })[0].closest("button")!)
    expect(state().selection).toEqual([collision.pieceId])
  })

  it("adattamento senza soluzione: causa riportata e form invariato", () => {
    // box più piccolo di qualsiasi pergola ammessa: nessuna soluzione
    act(() => void state().setBox({ width: 1000, depth: 1000, height: 1500 }))
    const review = reviewFit(state().config)
    expect(review.kind).toBe("none")
    const params = state().config.params
    render(<ResultsPanel />)
    fireEvent.click(screen.getByRole("button", { name: /Adatta all'ingombro/ }))
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Chiudi" })).toBeTruthy()
    expect(state().config.params).toBe(params)
  })
})

describe("ResultsPanel – ferramenta", () => {
  beforeEach(() => state().resetConfig("portale-sandwich"))

  it("tabella codice/descrizione/quantità da hardwareRows", () => {
    render(<ResultsPanel />)
    const rows = state().derived.hardwareRows
    expect(rows.length).toBeGreaterThan(0)
    const table = screen.getByRole("region", { name: "Ferramenta" })
    expect(table.querySelectorAll("tbody tr").length).toBe(rows.length)
    for (const r of rows) expect(table.querySelector(`[data-hardware="${r.code}"]`)?.textContent).toContain(r.description)
  })

  it("clic sulla riga dei bulloni seleziona i pezzi forati", () => {
    render(<ResultsPanel />)
    const { assembly, hardwareRows } = state().derived
    const bolts = hardwareRows.find((r) => r.kind === "bullone")!
    // pezzi forati dai bulloni di quel codice
    const boltIds = new Set(assembly!.hardware.filter((h) => h.code === bolts.code).map((h) => h.id))
    const drilled = assembly!.pieces.filter((p) => p.machinings.some((m) => m.type === "foro" && m.jointId && boltIds.has(m.jointId))).map((p) => p.id)
    expect(drilled.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: `Seleziona i pezzi di ${bolts.code}` }))
    expect([...state().selection].sort()).toEqual([...drilled].sort())
    expect(screen.getByRole("button", { name: `Seleziona i pezzi di ${bolts.code}` }).getAttribute("aria-pressed")).toBe("true")

    // secondo clic sulla riga: selezione annullata
    fireEvent.click(document.querySelector(`[data-hardware="${bolts.code}"]`)!)
    expect(state().selection).toEqual([])
  })

  it("carpenteria: nessuna riga di bulloni", () => {
    act(() => state().setParam("costruzione", "carpenteria"))
    render(<ResultsPanel />)
    expect(state().derived.hardwareRows.some((r) => r.kind === "bullone")).toBe(false)
    expect(document.querySelector('[data-hardware^="bullone"]')).toBeNull()
  })
})
