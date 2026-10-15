import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getPreset, listTypologies } from "@/domain"
import { EXAMPLES } from "@/stores/examples"
import { configuratoreStore } from "@/stores/use-configuratore"
import { ConfigToolbar } from "./config-toolbar"
import { ParamForm } from "./param-form"
import { groupPresets } from "./preset-picker"

const state = () => configuratoreStore.getState()

describe("groupPresets", () => {
  it("raggruppa i 27 preset per tipologia nell'ordine del registro", () => {
    const groups = groupPresets(EXAMPLES)
    expect(groups.reduce((n, g) => n + g.presets.length, 0)).toBe(EXAMPLES.length)
    const order = listTypologies().map((t) => t.slug)
    expect(groups.map((g) => g.slug)).toEqual(order.filter((s) => groups.some((g) => g.slug === s)))
    expect(groups.length).toBe(order.length)
  })

  it("filtra per parole (nome, fonte, note)", () => {
    const ids = (q: string) => groupPresets(EXAMPLES, q).flatMap((g) => g.presets.map((p) => p.id))
    expect(ids("maxi 5×5")).toContain("maxi-5x5")
    expect(ids("pergola-maxi-5x5")).toEqual(["maxi-5x5"])
    expect(ids("zzz")).toEqual([])
  })
})

describe("PresetPicker", () => {
  const original = state().loadPreset
  beforeEach(() => state().resetConfig("addossata-monofalda"))
  afterEach(() => configuratoreStore.setState({ loadPreset: original }))

  it("scegliere \"MAXI 5×5\" chiama loadPreset e il form mostra i parametri del preset", () => {
    const spy = vi.fn((id: string) => original(id))
    configuratoreStore.setState({ loadPreset: spy })
    render(
      <>
        <ConfigToolbar />
        <ParamForm />
      </>
    )
    fireEvent.click(screen.getByRole("button", { name: "Esempi dal catalogo" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Esempi dal catalogo")).toBeTruthy()
    fireEvent.click(within(dialog).getByText("MAXI 5×5"))
    expect(spy).toHaveBeenCalledWith("maxi-5x5")
    expect(screen.queryByRole("dialog")).toBeNull()

    const preset = getPreset("maxi-5x5")
    const { config, derived } = state()
    expect(config.typology).toBe("portale-sandwich")
    expect(derived.assembly?.typologySlug).toBe("portale-sandwich")
    expect(derived.error).toBeNull()
    for (const [name, value] of Object.entries(preset.params)) {
      expect(config.params[name]).toEqual(value)
      if (typeof value === "number") {
        const input = document.querySelector<HTMLInputElement>(`#param-${name}`)
        if (input) expect(input.value).toBe(String(value).replace(".", ","))
      }
    }
    expect(document.querySelector("[data-current-typology]")?.getAttribute("data-current-typology")).toBe("portale-sandwich")
  })
})
