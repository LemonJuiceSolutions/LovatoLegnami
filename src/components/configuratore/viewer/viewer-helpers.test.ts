import { describe, expect, it } from "vitest"
import { Vector3 } from "three"
import { generate, getTypology, defaultParams, multiply, rotationZ, translation, vec3, applyToPoint } from "@/domain"
import { familyLegend, poseToMatrix4, poseToTransform } from "./viewer-helpers"

describe("poseToMatrix4", () => {
  it("rispetta l'ordine per righe del dominio (p' = M·p)", () => {
    const pose = multiply(translation(vec3(100, 200, 300)), rotationZ(Math.PI / 2))
    const m = poseToMatrix4(pose)
    const p = new Vector3(10, 0, 0).applyMatrix4(m)
    const expected = applyToPoint(pose, vec3(10, 0, 0))
    expect(p.x).toBeCloseTo(expected.x)
    expect(p.y).toBeCloseTo(expected.y)
    expect(p.z).toBeCloseTo(expected.z)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(210)
  })

  it("rifiuta pose con un numero errato di valori", () => {
    expect(() => poseToMatrix4([1, 2, 3])).toThrow(/posa non valida/)
  })
})

describe("poseToTransform", () => {
  it("scompone la posa in posizione e quaternione unitario", () => {
    const pose = multiply(translation(vec3(5, 6, 7)), rotationZ(Math.PI / 2))
    const t = poseToTransform(pose)
    expect(t.position).toEqual([5, 6, 7])
    const [x, y, z, w] = t.quaternion
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1)
    expect(z).toBeCloseTo(Math.SQRT1_2)
    expect(w).toBeCloseTo(Math.SQRT1_2)
  })
})

describe("familyLegend", () => {
  it("elenca le famiglie presenti nell'ordine canonico con i conteggi", () => {
    const t = getTypology("addossata-monofalda")
    const assembly = generate("addossata-monofalda", defaultParams(t))
    const legend = familyLegend(assembly)
    expect(legend.length).toBeGreaterThan(0)
    expect(legend.reduce((n, e) => n + e.count, 0)).toBe(assembly.pieces.length)
    expect(legend.map((e) => e.family)).toContain("PIL")
    expect(familyLegend(null)).toEqual([])
  })
})
