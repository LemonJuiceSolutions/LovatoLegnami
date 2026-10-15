import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { planDeviations, planFromDiagonals } from "@/domain"
import { configuratoreStore } from "@/stores/use-configuratore"
import { EnvelopeForm } from "./envelope-form"

const state = () => configuratoreStore.getState()

function chooseMode(label: RegExp) {
  // Radix Select in jsdom: apertura da tastiera, scelta con Invio sull'opzione
  fireEvent.keyDown(screen.getByLabelText("Pianta"), { key: "Enter" })
  fireEvent.keyDown(screen.getByRole("option", { name: label }), { key: "Enter" })
}

const type = (label: string, value: number) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } })

describe("EnvelopeForm – pianta (10.3)", () => {
  beforeEach(() => state().resetConfig("addossata-monofalda"))

  it("diagonali diverse ⇒ deviazione mostrata e envelope.plan nello store", () => {
    render(<EnvelopeForm />)
    expect(state().config.envelope.plan).toBeUndefined()
    chooseMode(/diagonali/)
    // passare a fuori squadra dichiara la pianta rettangolare del box
    expect(state().config.envelope.plan).toBeDefined()
    expect(screen.getByTestId("plan-deviation").textContent).toContain("0,0°")

    // esempio del task 5.2: fronte e muro 5000, fianchi 3000, diagonali 5900/5760
    act(() => {
      type("Fronte", 5000)
      type("Lato al muro", 5000)
      type("Fianco sinistro", 3000)
      type("Fianco destro", 3000)
      type("Diagonale 1", 5900)
      type("Diagonale 2", 5760)
    })
    const plan = state().config.envelope.plan!
    const expected = planFromDiagonals({ front: 5000, back: 5000, left: 3000, right: 3000, d1: 5900, d2: 5760 })
    plan.corners.forEach((c, i) => {
      expect(c.x).toBeCloseTo(expected.corners[i].x, 6)
      expect(c.y).toBeCloseTo(expected.corners[i].y, 6)
    })
    const dev = planDeviations(plan).maxCornerDeg
    expect(dev).toBeGreaterThan(1)
    expect(screen.getByTestId("plan-deviation").textContent).toContain(`${(Math.round(dev * 10) / 10).toFixed(1).replace(".", ",")}°`)
    // box = rettangolo contenitore, campi del box non modificabili a mano
    expect(state().config.envelope.box.width).toBeCloseTo(Math.max(...plan.corners.map((c) => c.x)), 6)
    expect(state().config.envelope.box.depth).toBeCloseTo(Math.max(...plan.corners.map((c) => c.y)), 6)
    expect((screen.getByLabelText("Larghezza (fronte)") as HTMLInputElement).disabled).toBe(true)
    // la generazione segue il muro reale: l'assieme è stato rigenerato senza errori
    expect(state().derived.error).toBeNull()
    expect(state().derived.siteFactors?.planDeviationDeg).toBeCloseTo(dev, 3)
  })

  it("misure incoerenti ⇒ 'misure non coerenti' e pianta invariata", () => {
    render(<EnvelopeForm />)
    chooseMode(/diagonali/)
    const before = state().config.envelope.plan
    act(() => type("Diagonale 1", 9000))
    expect(screen.getByTestId("plan-error").textContent).toMatch(/misure non coerenti/)
    expect(state().config.envelope.plan).toBe(before)
  })

  it("angoli: angolo a 93° ⇒ pianta fuori squadra; rettangolare ⇒ pianta rimossa", () => {
    render(<EnvelopeForm />)
    chooseMode(/angoli/)
    act(() => type("Angolo ant. sinistro", 93))
    expect(planDeviations(state().config.envelope.plan!).maxCornerDeg).toBeCloseTo(3, 6)
    act(() => type("Fianco destro", 3900))
    expect(Math.abs(planDeviations(state().config.envelope.plan!).sides.posteriore)).toBeGreaterThan(2)
    // muro ruotato ⇒ i travetti della monofalda arrivano al muro reale con lunghezze diverse
    expect(screen.getByTestId("plan-deviation").textContent).toMatch(/seguono il muro reale/)
    const joists = state().derived.assembly!.pieces.filter((p) => p.type === "travetto")
    expect(new Set(joists.map((p) => Math.round(p.length))).size).toBeGreaterThan(1)
    chooseMode(/Rettangolare/)
    expect(state().config.envelope.plan).toBeUndefined()
    expect(screen.queryByTestId("plan-deviation")).toBeNull()
  })
})
