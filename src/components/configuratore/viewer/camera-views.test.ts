import { describe, expect, it } from "vitest"
import {
  assemblyBounds,
  defaultParams,
  generate,
  getTypology,
  measureAssembly,
  parseEnvelope,
  vec3,
} from "@/domain"
import {
  VIEWS,
  computeDimensions,
  isOrthographicView,
  orthoExtent,
  orthoZoom,
  sceneBounds,
  viewDirection,
  viewPose,
} from "./camera-views"

const box = { min: vec3(0, 0, 0), max: vec3(6000, 3000, 3000) }

describe("viste predefinite", () => {
  it("solo la prospettica è in proiezione prospettica", () => {
    expect(VIEWS.filter((v) => !isOrthographicView(v))).toEqual(["prospettica"])
  })

  it("fronte guarda da −Y, lato da −X, pianta dall'alto", () => {
    expect(viewDirection("fronte")).toEqual([0, -1, 0])
    expect(viewDirection("lato")).toEqual([-1, 0, 0])
    const [x, y, z] = viewDirection("pianta")
    expect(x).toBe(0)
    expect(y).toBeLessThan(0)
    expect(z).toBeCloseTo(1)
    for (const v of VIEWS) expect(Math.hypot(...viewDirection(v))).toBeCloseTo(1)
  })

  it("la posa punta al centro del box dalla direzione della vista", () => {
    const p = viewPose("pianta", box)
    expect(p.target).toEqual([3000, 1500, 1500])
    expect(p.position[2]).toBeGreaterThan(box.max.z)
    const f = viewPose("fronte", box)
    expect(f.position[1]).toBeLessThan(box.min.y)
    expect(f.position[0]).toBeCloseTo(3000)
  })

  it("in prospettica la sfera circoscritta entra nel campo visivo", () => {
    const p = viewPose("prospettica", box, 40, 1.5, 1)
    const radius = Math.hypot(6000, 3000, 3000) / 2
    expect(p.distance).toBeCloseTo(radius / Math.sin((40 * Math.PI) / 360))
    // finestra stretta (aspect < 1): serve più distanza
    expect(viewPose("prospettica", box, 40, 0.5, 1).distance).toBeGreaterThan(p.distance)
  })

  it("lo zoom ortografico fa entrare l'estensione visibile", () => {
    expect(orthoExtent("pianta", box)).toEqual([6000, 3000])
    expect(orthoExtent("fronte", box)).toEqual([6000, 3000])
    expect(orthoExtent("lato", box)).toEqual([3000, 3000])
    expect(orthoZoom("pianta", box, 600, 600, 1)).toBeCloseTo(0.1)
    expect(orthoZoom("pianta", box, 1200, 200, 1)).toBeCloseTo(200 / 3000)
  })
})

describe("sceneBounds", () => {
  it("unisce pergola e ingombro includendo il pavimento sotto zero", () => {
    const envelope = parseEnvelope({
      box: { width: 4000, depth: 3000, height: 2500 },
      floor: { corners: { frontLeft: -120, frontRight: 0, backLeft: 0, backRight: 0 } },
    })
    const assembly = generate("addossata-monofalda", defaultParams(getTypology("addossata-monofalda")))
    const b = sceneBounds(assembly, envelope)
    const a = assemblyBounds(assembly)!
    expect(b.min.z).toBe(Math.min(-120, a.min.z))
    expect(b.max.x).toBe(Math.max(4000, a.max.x))
    expect(sceneBounds(null, envelope)).toEqual({ min: vec3(0, 0, -120), max: vec3(4000, 3000, 2500) })
  })
})

describe("computeDimensions", () => {
  const assembly = generate("addossata-monofalda", defaultParams(getTypology("addossata-monofalda")))
  const measures = measureAssembly(assembly)

  it("restituisce le cinque quote ai valori correnti", () => {
    const dims = computeDimensions(assembly, measures)
    expect(dims.map((d) => d.key)).toEqual(["larghezza", "profondita", "sottoTrave", "altezzaMax", "pendenza"])
    const a = assemblyBounds(assembly)!
    const byKey = Object.fromEntries(dims.map((d) => [d.key, d]))
    expect(byKey.larghezza.value).toBeCloseTo(a.max.x - a.min.x)
    expect(byKey.profondita.value).toBeCloseTo(a.max.y - a.min.y)
    expect(byKey.altezzaMax.value).toBeCloseTo(a.max.z)
    expect(byKey.sottoTrave.value).toBeCloseTo(measures.clearHeight!.value)
    expect(byKey.pendenza.value).toBeCloseTo(measures.slope!)
    expect(byKey.pendenza.text).toMatch(/^Pendenza \d+,\d°$/)
    expect(byKey.larghezza.text).toMatch(/^Larghezza [\d.]+ mm$/)
    // la linea sotto trave è lunga quanto l'altezza libera
    expect(byKey.sottoTrave.to[2] - byKey.sottoTrave.from[2]).toBeCloseTo(measures.clearHeight!.value)
  })

  it("segue i parametri: una pergola più larga ha la quota più grande", () => {
    const t = getTypology("addossata-monofalda")
    const wider = generate("addossata-monofalda", { ...defaultParams(t), larghezza: 7000 })
    const w1 = computeDimensions(assembly, measures)[0].value
    const w2 = computeDimensions(wider, measureAssembly(wider))[0].value
    expect(w2 - w1).toBeCloseTo(7000 - Number(defaultParams(t).larghezza))
  })

  it("è vuota senza assieme", () => {
    expect(computeDimensions(null, null)).toEqual([])
  })
})
