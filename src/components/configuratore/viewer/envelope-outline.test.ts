import { describe, expect, it } from "vitest"
import { parseEnvelope, planFromDiagonals, boxOfPlan } from "@/domain"
import { envelopeOutline } from "./layer-helpers"

const vertices = (a: Float32Array) => Array.from({ length: a.length / 3 }, (_, i) => [a[3 * i], a[3 * i + 1], a[3 * i + 2]])

describe("envelopeOutline (10.3)", () => {
  it("senza pianta: 12 spigoli del box e muro posteriore", () => {
    const o = envelopeOutline(parseEnvelope({ box: { width: 6000, depth: 3600, height: 3700 } }))
    expect(o.planned).toBe(false)
    expect(o.edges.length).toBe(12 * 2 * 3)
    const xs = vertices(o.edges).map((v) => v[0])
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(6000)
    expect(vertices(o.wall)).toEqual([
      [0, 3600, 0],
      [6000, 3600, 0],
      [6000, 3600, 3700],
      [0, 3600, 3700],
    ])
  })

  it("pianta fuori squadra: vertici della pianta reale e muro sul lato inclinato", () => {
    const plan = planFromDiagonals({ front: 5000, back: 5000, left: 3000, right: 3000, d1: 5900, d2: 5760 })
    const env = parseEnvelope({ box: boxOfPlan(plan, 3000), plan })
    const o = envelopeOutline(env)
    expect(o.planned).toBe(true)
    const base = vertices(o.edges).filter((v) => v[2] === 0)
    for (const c of plan.corners) expect(base.some((v) => Math.abs(v[0] - c.x) < 1e-3 && Math.abs(v[1] - c.y) < 1e-3)).toBe(true)
    const [w0, w1] = vertices(o.wall)
    expect(w0[0]).toBeCloseTo(plan.corners[3].x, 3)
    expect(w1[0]).toBeCloseTo(plan.corners[2].x, 3)
    expect(w1[1]).toBeCloseTo(plan.corners[2].y, 3)
  })
})
