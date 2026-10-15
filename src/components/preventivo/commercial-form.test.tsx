import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_CATALOG } from "@/stores/catalog"
import { configuratoreStore } from "@/stores/use-configuratore"
import { CommercialForm, SiteDeclaredFields } from "./commercial-form"

const state = () => configuratoreStore.getState()

describe("CommercialForm (10.2)", () => {
  beforeEach(() => {
    state().setCatalog(DEFAULT_CATALOG)
    state().resetConfig("addossata-monofalda")
  })

  it("CAP valido ⇒ commercial.cap e trasporto della zona; CAP errato ⇒ errore senza modifiche", () => {
    render(<CommercialForm />)
    const before = state().derived.quote!.warnings.some((w) => w.code === "zona-da-verificare")
    expect(before).toBe(true)
    fireEvent.change(screen.getByLabelText("CAP di consegna"), { target: { value: "37026" } })
    expect(state().config.commercial?.cap).toBe("37026")
    expect(state().derived.quote!.warnings.some((w) => w.code === "zona-da-verificare")).toBe(false)
    fireEvent.change(screen.getByLabelText("CAP di consegna"), { target: { value: "37" } })
    expect(screen.getByText("CAP non valido (5 cifre)")).toBeTruthy()
    expect(state().config.commercial?.cap).toBe("37026")
  })

  it("le scelte mostrano le voci del listino attivo", () => {
    act(() => void state().setCommercial({ species: "larice", covering: "pannello-sandwich", access: "difficile" }))
    render(
      <>
        <CommercialForm />
        <SiteDeclaredFields />
      </>
    )
    expect(screen.getByLabelText("Specie").textContent).toBe("Larice")
    expect(screen.getByLabelText("Copertura").textContent).toBe("Pannello sandwich coibentato")
    expect(screen.getByLabelText("Trattamento").textContent).toBe("Nessuno")
    expect(screen.getByLabelText("Accesso al cantiere").textContent).toBe("Difficile")
    expect(screen.getByLabelText("Ancoraggio").textContent).toBe("Dedotto dalla tipologia")
  })
})
