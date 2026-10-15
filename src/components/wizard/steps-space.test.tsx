import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadPreset } from "@/domain/presets/catalog"
import { axeViolations } from "@/test/axe"
import { testStore, wizardData } from "./__fixtures__/data"
import { PreventivoWizard } from "./wizard"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

function monofaldaStore() {
  const store = testStore()
  store.getState().chooseTypology("addossata-monofalda", { id: "monofalda-grondaia", params: loadPreset("monofalda-grondaia").params })
  return store
}

async function renderStep(step: "misure" | "spazio", store = monofaldaStore()) {
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(<PreventivoWizard data={wizardData()} step={step} store={store} />)
  })
  return { ...utils, store }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe("passo 2 misure (12.4)", () => {
  it("larghezza oltre il massimo ⇒ si ferma al massimo con 'Per misure maggiori contattaci'", async () => {
    const { store } = await renderStep("misure")
    const input = screen.getByLabelText("Larghezza")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "2000" } })
    fireEvent.blur(input)
    expect(store.getState().answers.misure.larghezza).toBe(1200)
    expect(screen.getByText(/Per misure maggiori/).textContent).toMatch(/Per misure maggiori contattaci/)
    expect((input as HTMLInputElement).value).toBe("1200")
    expect(input.getAttribute("aria-invalid")).toBe("true")
  })

  it("profondità oltre la luce della sezione di default ⇒ sezione adeguata nello store, nessun campo visibile", async () => {
    const { store } = await renderStep("misure")
    const before = store.getState().derived.config!.params.sezioneTravetto
    const input = screen.getByLabelText("Profondità")
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "400" } })
    fireEvent.blur(input)
    expect(store.getState().answers.misure.profondita).toBe(400)
    const after = store.getState().derived.config!.params.sezioneTravetto
    expect(after).not.toBe(before)
    expect(store.getState().derived.prepared!.autosize.length).toBeGreaterThan(0)
    expect(screen.queryByLabelText(/sezion/i)).toBeNull()
    expect(screen.queryByText(/80×160|×/)).toBeNull()
  })

  it("anteprima di pilastri e distanza", async () => {
    await renderStep("misure")
    expect(screen.getByText(/\d+ pilastri/)).toBeTruthy()
    expect(screen.getByText(/un pilastro ogni/)).toBeTruthy()
  })

  it("accessibilità (axe)", async () => {
    const { container } = await renderStep("misure")
    expect(await axeViolations(container)).toEqual([])
  })
})

describe("passo 3 spazio (12.4)", () => {
  it("diagonali 590/576 ⇒ 'muro fuori squadra di circa 2°'", async () => {
    const { store } = await renderStep("spazio")
    fireEvent.click(screen.getByLabelText(/Non proprio/))
    // fronte e lato proposti dalle misure della pergola (500 × 300)
    expect(store.getState().answers.spazio.diagonals).toMatchObject({ front: 500, back: 500, left: 300, right: 300 })
    fireEvent.change(screen.getByLabelText(/davanti a sinistra/), { target: { value: "590" } })
    fireEvent.change(screen.getByLabelText(/davanti a destra/), { target: { value: "576" } })
    expect(store.getState().derived.plan).not.toBeNull()
    expect(screen.getByRole("status").textContent).toMatch(/muro fuori squadra di circa 2°/i)
  })

  it("diagonali incoerenti ⇒ errore sul campo", async () => {
    await renderStep("spazio")
    fireEvent.click(screen.getByLabelText(/Non proprio/))
    fireEvent.change(screen.getByLabelText(/davanti a sinistra/), { target: { value: "900" } })
    fireEvent.change(screen.getByLabelText(/davanti a destra/), { target: { value: "576" } })
    expect(screen.getByRole("alert").textContent).toMatch(/ricontrolla le due diagonali/)
  })

  it("ostacolo guidato: grondaia con due campi, finisce nell'ingombro", async () => {
    const { store } = await renderStep("spazio")
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi grondaia" }))
    const group = screen.getByRole("group", { name: "Grondaia" })
    expect(group.querySelectorAll("input")).toHaveLength(2)
    fireEvent.change(screen.getByLabelText("Altezza da terra"), { target: { value: "260" } })
    const env = store.getState().derived.envelope!
    expect(env.obstacles[0]).toMatchObject({ type: "grondaia", elevation: 2600 })
    fireEvent.click(screen.getByRole("button", { name: "Togli grondaia" }))
    expect(store.getState().derived.envelope!.obstacles).toEqual([])
  })

  it("pavimento in pendenza e accesso", async () => {
    const { store } = await renderStep("spazio")
    fireEvent.click(screen.getByLabelText(/No, è in pendenza/))
    fireEvent.change(screen.getByLabelText("Dislivello"), { target: { value: "6" } })
    fireEvent.click(screen.getByLabelText(/Verso il muro/))
    fireEvent.click(screen.getByLabelText(/Difficile/))
    expect(store.getState().answers.spazio).toMatchObject({ floor: "dislivello", floorDrop: 6, floorDirection: "muro", access: "difficile" })
    expect(store.getState().derived.envelope!.floor.corners).toMatchObject({ backLeft: -60, backRight: -60 })
    expect(store.getState().derived.config!.commercial.access).toBe("difficile")
  })

  it("accessibilità (axe) con le diagonali e un ostacolo", async () => {
    const { container } = await renderStep("spazio")
    fireEvent.click(screen.getByLabelText(/Non proprio/))
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi finestra" }))
    expect(await axeViolations(container)).toEqual([])
  })
})
