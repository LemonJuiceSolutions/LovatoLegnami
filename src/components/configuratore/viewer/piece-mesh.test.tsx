import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generate } from "@/domain"
import { PieceMesh } from "./piece-mesh"

/**
 * Rendering di `PieceMesh` fuori dal Canvas: react-dom crea gli elementi r3f
 * (`<mesh>`, `<group>`) come tag sconosciuti, quanto basta per contarli.
 */
describe("PieceMesh – modalità semplificata", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  const pieces = generate("carport-arco").pieces

  it("un arco senza mesh del kernel → ceil(sweep/15°) box", () => {
    const arc = pieces.find((p) => p.curve)!
    const { container } = render(<PieceMesh piece={arc} color="#7d4f26" />)
    expect(container.querySelectorAll("mesh").length).toBe(Math.ceil(arc.curve!.sweep / 15))
  })

  it("un pezzo dritto → un solo box", () => {
    const post = pieces.find((p) => p.type === "pilastro")!
    const { container } = render(<PieceMesh piece={post} color="#8b5a2b" />)
    expect(container.querySelectorAll("mesh").length).toBe(1)
  })

  it("con la mesh del kernel l'arco è un solo solido", () => {
    const arc = pieces.find((p) => p.curve)!
    const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }
    const { container } = render(<PieceMesh piece={arc} color="#7d4f26" mesh={mesh} />)
    expect(container.querySelectorAll("mesh").length).toBe(1)
  })
})
