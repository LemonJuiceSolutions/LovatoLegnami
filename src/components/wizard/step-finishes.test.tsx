import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { testStore, wizardData } from "./__fixtures__/data"
import { normalizeFinishes } from "./finishes"
import { PreventivoWizard } from "./wizard"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const withLamiera = (base = wizardData()) => ({
  ...base,
  options: { ...base.options, coverings: [...base.options.coverings, { id: "lamiera-grecata", label: "Lamiera grecata" }] },
})

async function renderFinishes(data = wizardData()) {
  const store = testStore()
  store.getState().chooseTypology("autoportante-bifalda", null)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(<PreventivoWizard data={data} step="finiture" store={store} />)
  })
  return { ...utils, store }
}

describe("passo 4 finiture (12.5)", () => {
  it("voci dal listino: senza lamiera la lamiera non compare; con la lamiera sì", async () => {
    const { unmount } = await renderFinishes()
    expect(screen.queryByLabelText(/lamiera/i)).toBeNull()
    expect(screen.getByLabelText(/Policarbonato alveolare/)).toBeTruthy()
    unmount()
    await renderFinishes(withLamiera())
    expect(screen.getByLabelText(/Lamiera grecata/)).toBeTruthy()
  })

  it("nessun prezzo nella pagina delle finiture", async () => {
    const { container } = await renderFinishes()
    expect(container.textContent).not.toMatch(/€/)
  })

  it("scelte nello store e nella configurazione; tinta solo con il trattamento colorato", async () => {
    const { store } = await renderFinishes()
    fireEvent.click(screen.getByLabelText(/^Larice/))
    expect(screen.queryByRole("group", { name: "Tinta" })).toBeNull()
    fireEvent.click(screen.getByLabelText(/Impregnante colorato/))
    fireEvent.click(screen.getByLabelText("Noce"))
    fireEvent.click(screen.getByLabelText(/Telo in PVC/))
    expect(store.getState().answers.finiture).toMatchObject({ species: "larice", treatment: "impregnante-tinta", tint: "noce", covering: "telo-pvc" })
    expect(store.getState().derived.config!.commercial).toMatchObject({ species: "larice", treatment: "impregnante-tinta", covering: "telo-pvc" })
    fireEvent.click(screen.getByLabelText(/Nessun trattamento/))
    expect(store.getState().answers.finiture).toMatchObject({ treatment: null, tint: null })
  })

  it("una voce non più a listino torna alla prima disponibile", () => {
    const o = wizardData().options
    expect(normalizeFinishes({ species: "rovere", quality: "lamellare", treatment: "cera", tint: null, covering: "lamiera" }, o)).toEqual({
      species: "abete",
      quality: "lamellare",
      treatment: "impregnante-incolore",
      tint: null,
      covering: null,
    })
  })

  it("accessibilità (axe)", async () => {
    const { container } = await renderFinishes()
    fireEvent.click(screen.getByLabelText(/Impregnante colorato/))
    expect(await axeViolations(container)).toEqual([])
  })
})
