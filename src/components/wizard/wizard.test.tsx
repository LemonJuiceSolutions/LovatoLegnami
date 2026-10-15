import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadPreset } from "@/domain/presets/catalog"
import { axeViolations } from "@/test/axe"
import { testStore, wizardData } from "./__fixtures__/data"
import { PreventivoWizard } from "./wizard"

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: new URLSearchParams() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.search,
}))

beforeEach(() => {
  nav.push.mockReset()
  nav.replace.mockReset()
  nav.search = new URLSearchParams()
})

describe("wizard: scheletro e passo 1 (12.3)", () => {
  it("mostra solo le tipologie visibili con 'a partire da' e filtra per categoria (gazebo)", async () => {
    const store = testStore()
    render(<PreventivoWizard data={wizardData()} step="tipologia" store={store} />)
    const list = await screen.findByRole("list", { name: "Modelli disponibili" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(4)
    expect(within(list).getAllByText(/a partire da/).length).toBe(3)
    expect(within(list).getByText("Prezzo su richiesta")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Gazebo" }))
    expect(screen.getByRole("button", { name: "Gazebo" }).getAttribute("aria-pressed")).toBe("true")
    const items = within(screen.getByRole("list", { name: "Modelli disponibili" })).getAllByRole("listitem")
    expect(items).toHaveLength(1)
    expect(within(items[0]!).getByRole("heading", { name: "Gazebo a padiglione" })).toBeTruthy()
  })

  it("indicatore di avanzamento: passo corrente con aria-current", async () => {
    render(<PreventivoWizard data={wizardData()} step="tipologia" store={testStore()} />)
    const nav = await screen.findByRole("navigation", { name: "Avanzamento del preventivo" })
    const current = nav.querySelector('[aria-current="step"]')
    expect(current?.textContent).toMatch(/Passo 1: Modello/)
  })

  it("la scelta applica il preset di riferimento e porta al passo 2", async () => {
    const store = testStore()
    render(<PreventivoWizard data={wizardData()} step="tipologia" store={store} />)
    fireEvent.click(await screen.findByRole("button", { name: /Scegli questo modello.*Pergola bifalda/ }))
    expect(store.getState().answers.tipologia).toMatchObject({ slug: "autoportante-bifalda", presetId: "bifalda-libera" })
    expect(nav.push).toHaveBeenCalledWith("/preventivo/misure")
    expect(store.getState().step).toBe("misure")
  })

  it("arrivo con ?tipologia=portale-sandwich ⇒ passo 2 con il preset applicato", async () => {
    nav.search = new URLSearchParams("tipologia=portale-sandwich")
    const store = testStore()
    await act(async () => {
      render(<PreventivoWizard data={wizardData()} step="tipologia" store={store} />)
    })
    const preset = loadPreset("libera-4x3")
    expect(store.getState().answers.tipologia.slug).toBe("portale-sandwich")
    expect(store.getState().answers.tipologia.baseParams).toEqual(preset.params)
    expect(store.getState().answers.misure.larghezza).toBe(Math.round((preset.params.larghezza as number) / 10))
    expect(nav.replace).toHaveBeenCalledWith("/preventivo/misure")
    expect(store.getState().step).toBe("misure")
    expect(store.getState().derived.config?.typology).toBe("portale-sandwich")
  })

  it("una tipologia non visibile in ?tipologia= è ignorata", async () => {
    nav.search = new URLSearchParams("tipologia=carport-arco")
    const store = testStore()
    await act(async () => {
      render(<PreventivoWizard data={wizardData()} step="tipologia" store={store} />)
    })
    expect(store.getState().answers.tipologia.slug).toBeNull()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it("passo successivo senza modello scelto ⇒ ritorno al passo 1", async () => {
    await act(async () => {
      render(<PreventivoWizard data={wizardData()} step="spazio" store={testStore()} />)
    })
    expect(nav.replace).toHaveBeenCalledWith("/preventivo")
  })

  it("accessibilità del passo 1 (axe)", async () => {
    const { container } = render(<PreventivoWizard data={wizardData()} step="tipologia" store={testStore()} />)
    await screen.findByRole("list", { name: "Modelli disponibili" })
    expect(await axeViolations(container)).toEqual([])
  })
})
