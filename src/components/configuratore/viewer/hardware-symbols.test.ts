import { Quaternion, Vector3 } from "three"
import { describe, expect, it } from "vitest"
import { applyToPoint, generate, loadPreset, vec3 } from "@/domain"
import { hardwareSymbols } from "./hardware-symbols"

describe("simboli della ferramenta", () => {
  const { typologySlug, params } = loadPreset("libera-4x6")
  const assembly = generate(typologySlug, params)

  it("pergola libera 4×6: 12 bulloni → 12 cilindri", () => {
    expect(assembly.hardware.filter((h) => h.kind === "bullone").length).toBe(12)
    const symbols = hardwareSymbols(assembly.hardware)
    expect(symbols.filter((s) => s.shape === "cylinder").length).toBe(12)
    // viti e tasselli (solo conteggi) non hanno simbolo
    expect(symbols.length).toBe(assembly.hardware.filter((h) => h.pose).length)
  })

  it("il cilindro del bullone attraversa tavola–pilastro–tavola lungo l'asse", () => {
    const bolt = assembly.hardware.find((h) => h.kind === "bullone")!
    const s = hardwareSymbols([bolt])[0]
    if (s.shape !== "cylinder") throw new Error("atteso un cilindro")
    const grip = bolt.params.grip as number
    expect(s.length).toBe(bolt.params.length)
    expect(s.length).toBeGreaterThan(grip)
    expect(s.radius).toBe((bolt.params.diameter as number) / 2)
    // asse del cilindro (Y di Three) = asse X della posa del bullone
    const axis = new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...s.quaternion))
    const a0 = applyToPoint(bolt.pose!, vec3(0, 0, 0))
    const a1 = applyToPoint(bolt.pose!, vec3(1, 0, 0))
    expect(axis.x).toBeCloseTo(a1.x - a0.x, 6)
    expect(axis.y).toBeCloseTo(a1.y - a0.y, 6)
    expect(axis.z).toBeCloseTo(a1.z - a0.z, 6)
    // centrato a metà dello spessore serrato: sporge dai due lati
    const mid = applyToPoint(bolt.pose!, vec3(grip / 2, 0, 0))
    expect(s.position[0]).toBeCloseTo(mid.x, 6)
    expect(bolt.pieceIds.length).toBe(3)
  })

  it("staffe e giunti come box con l'ingombro dichiarato", () => {
    const telaio = generate("telaio-giunti")
    const boxes = hardwareSymbols(telaio.hardware).filter((s) => s.shape === "box")
    expect(boxes.length).toBeGreaterThan(0)
    for (const b of boxes) {
      const item = telaio.hardware.find((h) => h.id === b.id)!
      expect(b.size).toEqual([item.dims!.x, item.dims!.y, item.dims!.z])
    }
  })
})
