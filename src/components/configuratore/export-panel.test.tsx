import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { pieceBoxBrep } from "@/geometry/neutral-brep-box"
import type { PieceResult } from "@/geometry/protocol"
import { INITIAL_KERNEL_STATE } from "@/stores/kernel-slice"
import { configuratoreStore } from "@/stores/use-configuratore"
import { ExportPanel } from "./export-panel"

const state = () => configuratoreStore.getState()

/** Simula il kernel pronto con un solido a box per ogni pezzo dell'assieme corrente. */
function solidsReadyForCurrentAssembly() {
  const assembly = state().derived.assembly!
  const results: Record<string, PieceResult> = {}
  for (const p of assembly.pieces)
    results[p.id] = { pieceId: p.id, cacheKey: p.id, pose: p.pose, brep: pieceBoxBrep(p.section, p.length) }
  configuratoreStore.setState({ kernel: { ...INITIAL_KERNEL_STATE, status: "ready", results, builtFor: assembly } })
}

const button = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement

describe("ExportPanel", () => {
  beforeEach(() => {
    state().resetConfig("addossata-monofalda")
    configuratoreStore.setState({ kernel: INITIAL_KERNEL_STATE })
  })

  it("SAT e STEP disabilitati finché i solidi non sono pronti, CSV sempre disponibile", () => {
    render(<ExportPanel />)
    expect(button(/Esporta SAT/).disabled).toBe(true)
    expect(button(/Esporta STEP/).disabled).toBe(true)
    expect(button(/Esporta distinta CSV/).disabled).toBe(false)

    act(() => configuratoreStore.setState({ kernel: { ...INITIAL_KERNEL_STATE, status: "ready", building: true, progress: { done: 3, total: 22 } } }))
    expect(screen.getByText("Costruzione solidi 3/22")).toBeTruthy()
    expect(button(/Esporta SAT/).disabled).toBe(true)

    act(solidsReadyForCurrentAssembly)
    expect(screen.getByText("Solidi pronti")).toBeTruthy()
    expect(button(/Esporta SAT/).disabled).toBe(false)
    expect(button(/Esporta STEP/).disabled).toBe(false)
  })

  it("verifica file: valida la struttura del SAT prodotto", () => {
    act(solidsReadyForCurrentAssembly)
    render(<ExportPanel />)
    fireEvent.click(button(/Verifica file/))
    const box = screen.getByTestId("sat-verification")
    expect(box.textContent).toContain("Struttura SAT valida")
    expect(box.textContent).toContain(`${state().derived.assembly!.pieces.length} body`)
  })

  it("con collisioni chiede conferma e annullando non esporta", () => {
    act(() => {
      state().setBox({ height: 2500 })
      solidsReadyForCurrentAssembly()
    })
    expect(state().derived.collisions.length).toBeGreaterThan(0)
    render(<ExportPanel />)
    fireEvent.click(button(/Esporta SAT/))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Esportare comunque?")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Esporta comunque" })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Annulla" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByText(/Export annullato/)).toBeTruthy()
  })

  it("le opzioni SAT sono scritte nella configurazione", () => {
    render(<ExportPanel />)
    fireEvent.change(screen.getByLabelText("Produttore / CAM (header)"), { target: { value: "CAM Lovato" } })
    expect(state().config.exportOptions.sat.producer).toBe("CAM Lovato")
  })
})
