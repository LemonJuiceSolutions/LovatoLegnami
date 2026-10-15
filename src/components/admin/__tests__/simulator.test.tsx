import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_VERSION } from "@/domain/pricing/data/default-listino"
import { loadPreset } from "@/domain/presets/catalog"
import { generate } from "@/domain/typologies/registry"
import { parseEnvelope } from "@/domain/envelope/types"
import { customerView, officeView } from "@/domain/pricing/views"
import { priceAssembly } from "@/domain/pricing/engine"
import type { Simulation } from "@/server/actions/simulate"

const { Simulator } = await import("../simula/simulator")

function fakeSimulation(): Simulation {
  const p = loadPreset("libera-4x6")
  const envelope = parseEnvelope({ box: { width: 6000, depth: 6000, height: 3500 } })
  const price = (pl: typeof DEFAULT_PRICE_LIST, version = DEFAULT_PRICE_LIST_VERSION) => {
    const q = priceAssembly({ assembly: generate(p.typologySlug, p.params), envelope, options: { species: "abete", quality: "lamellare" }, priceList: pl, version })
    return { versionLabel: `listino v${version.version}`, office: officeView(q), customer: customerView(q) }
  }
  const active = price(DEFAULT_PRICE_LIST)
  const draft = price({ ...DEFAULT_PRICE_LIST, labour: { ...DEFAULT_PRICE_LIST.labour, hourlyRateCents: Math.round(DEFAULT_PRICE_LIST.labour.hourlyRateCents * 1.05) } }, { ...DEFAULT_PRICE_LIST_VERSION, version: 2, status: "bozza" })
  return {
    draft,
    active,
    siteFactors: active.office.siteFactors,
    lines: [{ code: "montaggio-pezzi", label: "Montaggio pezzi", category: "montaggio", activeCents: 10_000, draftCents: 10_500, deltaCents: 500 }],
    totalDeltaCents: draft.office.totals.totalCents - active.office.totals.totalCents,
  }
}

describe("simulatore (9.8)", () => {
  it("invia sorgente, fattori e CAP; mostra i due totali, la differenza e le viste", async () => {
    const simulate = vi.fn(async () => ({ ok: true as const, data: fakeSimulation() }))
    render(
      <Simulator
        presets={[{ value: "libera-4x6", label: "Pergola libera 4×6" }]}
        leads={[]}
        species={[{ value: "abete", label: "Abete" }]}
        qualities={[{ value: "lamellare", label: "Lamellare" }]}
        treatments={[]}
        coverings={[]}
        simulate={simulate}
      />,
    )
    fireEvent.change(screen.getByLabelText(/dislivello del pavimento/), { target: { value: "150" } })
    fireEvent.change(screen.getByLabelText("CAP di consegna"), { target: { value: "37100" } })
    fireEvent.click(screen.getByRole("button", { name: "Simula" }))
    await waitFor(() => expect(simulate).toHaveBeenCalledWith({ source: { kind: "preset", id: "libera-4x6" }, factors: { floorRangeMm: 150 }, options: { cap: "37100" } }))
    const totals = await screen.findByRole("region", { name: "Totali" })
    expect(totals.textContent).toMatch(/Bozza: .*€.*Attiva: .*€.*Differenza: \+/)
    const diff = screen.getByRole("region", { name: "Differenze per riga" })
    expect(within(diff).getByText("Montaggio pezzi")).toBeTruthy()
    expect(within(diff).getByText(/\+5,00/)).toBeTruthy()
    expect(within(screen.getByRole("region", { name: "Listino in bozza" })).getByText("Anteprima vista cliente")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Listino attivo" })).toBeTruthy()
  })

  it("fattore non numerico ⇒ errore e nessuna simulazione", () => {
    const simulate = vi.fn()
    render(<Simulator presets={[{ value: "x", label: "X" }]} leads={[]} species={[]} qualities={[]} treatments={[]} coverings={[]} simulate={simulate} />)
    fireEvent.change(screen.getByLabelText(/ostacoli sulla pergola/), { target: { value: "molti" } })
    expect(screen.getByRole("alert").textContent).toMatch(/inserire un numero/)
    fireEvent.click(screen.getByRole("button", { name: "Simula" }))
    expect(simulate).not.toHaveBeenCalled()
  })
})
