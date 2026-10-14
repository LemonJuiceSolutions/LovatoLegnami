import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { configuratoreStore } from "@/stores/use-configuratore"
import { EnvelopeForm } from "./envelope-form"

const state = () => configuratoreStore.getState()

describe("EnvelopeForm", () => {
  beforeEach(() => state().resetConfig("addossata-monofalda"))

  it("aggiungere un ostacolo inserisce una grondaia nello store e nell'elenco", () => {
    render(<EnvelopeForm />)
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi ostacolo/ }))
    const [o] = state().config.envelope.obstacles
    expect(o).toMatchObject({ id: "OST-01", type: "grondaia", side: "posteriore", height: 150 })
    expect(screen.getByText("OST-01 · Grondaia")).toBeTruthy()

    // modifica della quota → store aggiornato e collisioni ricalcolate
    fireEvent.change(screen.getByLabelText("Quota", { selector: "#ost-OST-01-elevation" }), { target: { value: "3300" } })
    expect(state().config.envelope.obstacles[0].elevation).toBe(3300)
    expect(state().derived.collisions.some((c) => c.obstacleId === "OST-01")).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Rimuovi OST-01" }))
    expect(state().config.envelope.obstacles).toHaveLength(0)
  })

  it("un box non valido mostra l'errore e lascia lo stato invariato", () => {
    render(<EnvelopeForm />)
    const before = state().config.envelope
    fireEvent.change(screen.getByLabelText("Altezza", { selector: "#env-height" }), { target: { value: "0" } })
    expect(state().config.envelope).toBe(before)
    expect(screen.getByText(/maggiore di 0/)).toBeTruthy()
  })

  it("le quote agli angoli aggiornano il pavimento", () => {
    render(<EnvelopeForm />)
    fireEvent.change(screen.getByLabelText("Anteriore sinistro"), { target: { value: "-80" } })
    expect(state().config.envelope.floor.corners.frontLeft).toBe(-80)
  })
})
