import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { listTypologies } from "@/domain"
import { configuratoreStore } from "@/stores/use-configuratore"
import { ParamForm } from "./param-form"
import { TypologyPicker } from "./typology-picker"

const cards = () => [...document.querySelectorAll<HTMLElement>("[data-typology]")].map((el) => el.dataset.typology)

describe("TypologyPicker", () => {
  beforeEach(() => configuratoreStore.getState().resetConfig("addossata-monofalda"))

  it("mostra una scheda con miniatura per ogni tipologia", () => {
    render(<TypologyPicker value="addossata-monofalda" onSelect={() => {}} />)
    expect(cards()).toEqual(listTypologies().map((t) => t.slug))
    expect(document.querySelectorAll("[data-thumbnail] svg").length).toBe(listTypologies().length)
  })

  it("filtro gazebo → solo gazebo-padiglione", () => {
    render(<TypologyPicker value="addossata-monofalda" onSelect={() => {}} />)
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Gazebo" }))
    expect(cards()).toEqual(["gazebo-padiglione"])
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Tutte" }))
    fireEvent.change(screen.getByLabelText("Cerca tipologia"), { target: { value: "nessuna-corrispondenza" } })
    expect(screen.getByText("Nessuna tipologia corrisponde ai filtri.")).toBeTruthy()
  })

  it("clic su carport-arco nel dialogo → store aggiornato e form della tipologia", () => {
    render(<ParamForm />)
    fireEvent.click(screen.getByRole("button", { name: "Cambia tipologia" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Carport ad arco" }))
    expect(configuratoreStore.getState().config.typology).toBe("carport-arco")
    expect(configuratoreStore.getState().derived.assembly?.typologySlug).toBe("carport-arco")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.querySelector("[data-current-typology]")?.getAttribute("data-current-typology")).toBe("carport-arco")
    expect(document.querySelector('[data-param="raggioArco"]')).toBeTruthy()
  })

  it("la tipologia corrente è evidenziata", () => {
    act(() => void configuratoreStore.getState().setTypology("gazebo-padiglione"))
    render(<TypologyPicker value="gazebo-padiglione" onSelect={() => {}} />)
    expect(document.querySelector('[data-typology="gazebo-padiglione"]')?.getAttribute("aria-pressed")).toBe("true")
  })
})
