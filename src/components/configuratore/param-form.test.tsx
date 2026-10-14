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
