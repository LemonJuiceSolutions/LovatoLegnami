import { describe, expect, it } from "vitest"
import { parseEnvelope } from "@/domain"
import { floorGrid, formatDeg, formatMm, obstacleBoxes, obstacleTypes } from "./layer-helpers"

const envelope = parseEnvelope({
  box: { width: 4000, depth: 3000, height: 3000 },
  obstacles: [
    { id: "OST-01", type: "grondaia", side: "posteriore", elevation: 2700, height: 150, projection: 300 },
    { id: "OST-02", type: "finestra", side: "posteriore", offset: 1000, width: 800, elevation: 900, height: 1200 },
  ],
  floor: { corners: { frontLeft: 0, frontRight: 0, backLeft: 100, backRight: 100 } },
})

describe("formatMm / formatDeg", () => {
  it("formatta in italiano", () => {
    expect(formatMm(1250)).toBe("1.250 mm")
    expect(formatMm(-30.4)).toBe("−30 mm")
    expect(formatMm(100, true)).toBe("+100 mm")
    expect(formatMm(0, true)).toBe("±0 mm")
    expect(formatDeg(12.345)).toBe("12,3°")
  })
})

describe("obstacleBoxes", () => {
  it("converte gli ostacoli in box assoluti con centro e dimensioni", () => {
    const [g, w] = obstacleBoxes(envelope)
    expect(g).toMatchObject({ id: "OST-01", type: "grondaia", ignored: false })
    expect(g.size).toEqual([4000, 300, 150])
    expect(g.center).toEqual([2000, 2850, 2775])
    expect(w.center[0]).toBe(1400)
    expect(obstacleTypes(envelope)).toEqual(["grondaia", "finestra"])
  })
})

describe("floorGrid", () => {
  it("campiona il pavimento interpolato passando per le quote degli angoli", () => {
    const g = floorGrid(envelope, 4)
    expect(g.positions.length).toBe(25 * 3)
    expect(g.indices.length).toBe(4 * 4 * 6)
    // primo vertice = angolo anteriore sinistro, ultimo = posteriore destro
    expect(Array.from(g.positions.slice(0, 3))).toEqual([0, 0, 0])
    expect(Array.from(g.positions.slice(-3))).toEqual([4000, 3000, 100])
    // a metà profondità quota intermedia
    const mid = (2 * 5 + 2) * 3
    expect(g.positions[mid + 2]).toBeCloseTo(50)
    expect(g.lines.length).toBe(2 * 5 * 4 * 6)
    expect(g.corners.map((c) => c.z)).toEqual([0, 0, 100, 100])
  })
})
