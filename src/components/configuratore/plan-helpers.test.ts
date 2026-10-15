import { describe, expect, it } from "vitest"
import { PlanMeasuresError, parseEnvelope, planDeviations } from "@/domain"
import { anglesFromPlan, envelopeWithPlan, planFromAngles, planSummary } from "./plan-helpers"

describe("plan-helpers (10.3)", () => {
  it("angoli a 90° ⇒ rettangolo; inverso coerente", () => {
    const plan = planFromAngles({ front: 6000, left: 3600, right: 3600, angleLeft: 90, angleRight: 90 })
    expect(plan.corners).toEqual([
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 3600 },
      { x: 0, y: 3600 },
    ])
    expect(anglesFromPlan(plan)).toEqual({ front: 6000, left: 3600, right: 3600, angleLeft: 90, angleRight: 90 })
  })

  it("angolo sinistro a 95° ⇒ pianta traslata a x ≥ 0 con deviazione 5°", () => {
    const plan = planFromAngles({ front: 6000, left: 3600, right: 3600, angleLeft: 95, angleRight: 90 })
    expect(Math.min(...plan.corners.map((c) => c.x))).toBe(0)
    expect(planDeviations(plan).maxCornerDeg).toBeCloseTo(5, 6)
    expect(anglesFromPlan(plan)).toMatchObject({ angleLeft: 95, angleRight: 90 })
  })

  it("pianta non convessa ⇒ misure non coerenti", () => {
    expect(() => planFromAngles({ front: 1000, left: 3000, right: 3000, angleLeft: 60, angleRight: 60 })).toThrow(PlanMeasuresError)
    expect(() => planFromAngles({ front: 0, left: 3000, right: 3000, angleLeft: 90, angleRight: 90 })).toThrow(/misure non coerenti/)
  })

  it("envelopeWithPlan: box = rettangolo contenitore; null ⇒ senza pianta", () => {
    const env = parseEnvelope({ box: { width: 6000, depth: 3600, height: 3700 } })
    const plan = planFromAngles({ front: 6000, left: 3600, right: 3600, angleLeft: 95, angleRight: 90 })
    const withPlan = parseEnvelope(envelopeWithPlan(env, plan))
    expect(withPlan.plan).toBeDefined()
    expect(withPlan.box.height).toBe(3700)
    expect(withPlan.box.width).toBeGreaterThan(6000)
    expect(planSummary(withPlan)!.maxDeg).toBeCloseTo(5, 6)
    const back = parseEnvelope(envelopeWithPlan(withPlan, null))
    expect(back.plan).toBeUndefined()
    expect(planSummary(back)).toBeNull()
  })
})
