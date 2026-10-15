import { describe, expect, it } from "vitest"
import { Quaternion, Vector3 } from "three"
import { generate, getTypology, defaultParams, multiply, rotationZ, translation, vec3, applyToPoint, pieceObbs } from "@/domain"
import { pieceCacheKey } from "@/geometry/cache"
import { curvedFallbackBoxes, familyLegend, poseToMatrix4, poseToTransform, usableKernelMesh } from "./viewer-helpers"

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

describe("usableKernelMesh", () => {
  const t = getTypology("addossata-monofalda")
  const piece = generate("addossata-monofalda", defaultParams(t)).pieces[0]
  const mesh = { positions: new Float32Array(9), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }
  const base = { pieceId: piece.id, cacheKey: pieceCacheKey(piece), pose: piece.pose, mesh }

  it("usa la mesh se la chiave di cache corrisponde al pezzo corrente", () => {
    expect(usableKernelMesh(piece, base)).toBe(mesh)
  })
  it("torna al box se il risultato manca, ha errori, è vuoto o è di un pezzo diverso", () => {
    expect(usableKernelMesh(piece, undefined)).toBeUndefined()
    expect(usableKernelMesh(piece, { ...base, error: { message: "x" } } as never)).toBeUndefined()
    expect(usableKernelMesh(piece, { ...base, mesh: { ...mesh, indices: new Uint32Array() } })).toBeUndefined()
    expect(usableKernelMesh({ ...piece, length: piece.length + 10 }, base)).toBeUndefined()
  })
})

describe("pezzi curvi in modalità semplificata", () => {
  const arc = generate("carport-arco").pieces.find((p) => p.curve)!

  it("ceil(sweep/15°) box di tratto, uno per OBB di pieceObbs", () => {
    const boxes = curvedFallbackBoxes(arc)
    expect(boxes.length).toBe(Math.ceil(arc.curve!.sweep / 15))
    const obbs = pieceObbs(arc)
    boxes.forEach((b, i) => {
      expect(b.position[0]).toBeCloseTo(obbs[i].center.x, 6)
      expect(b.scale[2]).toBeCloseTo(2 * obbs[i].halfSize.z, 6)
      // la rotazione porta l'asse X locale sull'asse tangente del tratto
      const x = new Vector3(1, 0, 0).applyQuaternion(new Quaternion(...b.quaternion))
      expect(x.x).toBeCloseTo(obbs[i].axes[0].x, 6)
      expect(x.z).toBeCloseTo(obbs[i].axes[0].z, 6)
    })
  })

  it("pezzi dritti: nessun box di tratto", () => {
    const straight = generate("carport-arco").pieces.find((p) => !p.curve)!
    expect(curvedFallbackBoxes(straight)).toEqual([])
  })
})
