import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generate, loadPreset } from "@/domain"
import { HardwareLayer } from "./hardware-layer"
import { DEFAULT_PALETTE } from "./theme-colors"

/** Rendering fuori dal Canvas (tag r3f come elementi sconosciuti di react-dom), come `piece-mesh.test.tsx`. */
describe("HardwareLayer", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it("assieme con 12 bulloni → 12 cilindri più i box della ferramenta posata", () => {
    const { typologySlug, params } = loadPreset("libera-4x6")
    const assembly = generate(typologySlug, params)
    const posed = assembly.hardware.filter((h) => h.pose).length
    const { container } = render(<HardwareLayer assembly={assembly} palette={DEFAULT_PALETTE} />)
    expect(container.querySelectorAll("mesh").length).toBe(posed)
    const bolts = assembly.hardware.filter((h) => h.kind === "bullone").map((h) => h.id)
    expect(bolts.length).toBe(12)
    for (const id of bolts) expect(container.querySelector(`mesh[name="${id}"]`)).toBeTruthy()
  })

  it("senza assieme nessun simbolo", () => {
    const { container } = render(<HardwareLayer assembly={null} palette={DEFAULT_PALETTE} />)
    expect(container.querySelectorAll("mesh").length).toBe(0)
  })
})
