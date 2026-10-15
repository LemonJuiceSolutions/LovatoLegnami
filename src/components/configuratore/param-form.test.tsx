import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { getTypology } from "@/domain"
import { configuratoreStore } from "@/stores/use-configuratore"
import { ParamForm } from "./param-form"

describe("ParamForm", () => {
  beforeEach(() => configuratoreStore.getState().resetConfig("addossata-monofalda"))

  it("mostra i campi del template della tipologia corrente", () => {
    render(<ParamForm />)
    for (const spec of getTypology("addossata-monofalda").params) expect(screen.getByText(spec.label)).toBeTruthy()
  })

  it("aggiorna i campi al cambio di tipologia", () => {
    render(<ParamForm />)
    expect(screen.queryByText("Sezione colmo")).toBeNull()
    act(() => void configuratoreStore.getState().setTypology("autoportante-bifalda"))
    expect(screen.getByText("Sezione colmo")).toBeTruthy()
    expect(screen.queryByText("Sezione banchina")).toBeNull()
  })

  it("pendenza 50° mostra l'errore inline e non rigenera l'assieme", () => {
    render(<ParamForm />)
    const before = configuratoreStore.getState().derived.assembly
    fireEvent.change(screen.getByLabelText("Pendenza", { selector: "input" }), { target: { value: "50" } })
    expect(screen.getByText("Fuori limite: ammesso 3–45 °")).toBeTruthy()
    const { derived } = configuratoreStore.getState()
    expect(derived.paramErrors.pendenza).toBeDefined()
    expect(derived.assembly).toBe(before)
  })
})

describe("ParamForm – campi a scelta e condizionati", () => {
  beforeEach(() => configuratoreStore.getState().resetConfig("portale-sandwich"))

  const field = (name: string) => document.querySelector(`[data-param="${name}"]`)

  it("enum come select con le etichette delle opzioni", () => {
    render(<ParamForm />)
    expect(field("costruzione")).toBeTruthy()
    expect(screen.getByLabelText("Forma").textContent).toBe("Piana")
  })

  it("forma = piana nasconde testaPilastro e il valore resta nello store", () => {
    act(() => configuratoreStore.getState().setParams({ forma: "monofalda", direzionePendenza: "larghezza", testaPilastro: "inclinata" }))
    render(<ParamForm />)
    expect(field("testaPilastro")).toBeTruthy()
    expect(field("pendenza")).toBeTruthy()
    act(() => configuratoreStore.getState().setParam("forma", "piana"))
    expect(field("testaPilastro")).toBeNull()
    expect(field("pendenza")).toBeNull()
    expect(configuratoreStore.getState().config.params.testaPilastro).toBe("inclinata")
  })

  it("cambio costruzione → carpenteria dal select: assieme rigenerato, nessun bullone nella ferramenta", () => {
    render(<ParamForm />)
    const before = configuratoreStore.getState().derived.assembly
    expect(configuratoreStore.getState().derived.hardwareRows.some((r) => r.kind === "bullone")).toBe(true)
    expect(field("sezioneTavola")).toBeTruthy()
    expect(field("sezioneTrave")).toBeNull()
    const trigger = screen.getByLabelText("Costruzione")
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(screen.getByRole("option", { name: "Carpenteria" }))
    const { config, derived } = configuratoreStore.getState()
    expect(config.params.costruzione).toBe("carpenteria")
    expect(derived.assembly).not.toBe(before)
    expect(derived.assembly?.params.costruzione).toBe("carpenteria")
    expect(derived.hardwareRows.some((r) => r.kind === "bullone")).toBe(false)
    expect(field("sezioneTavola")).toBeNull()
    expect(field("sezioneTrave")).toBeTruthy()
  })
})
