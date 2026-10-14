import { describe, expect, it } from "vitest"
import { checkCollisions, defaultParams, generate, getTypology, parseEnvelope, pieceAabb, type Violation } from "@/domain"
import { pieceCenter, pieceMessages, pieceSummary, piecesBounds, problemPieceIds } from "./piece-info"

const assembly = generate("addossata-monofalda", defaultParams(getTypology("addossata-monofalda")))
const joist = assembly.pieces.find((p) => p.type === "travetto")!
const top = pieceAabb(joist).max.z

// grondaia sul muro posteriore all'altezza dei travetti: collisione garantita
const envelope = parseEnvelope({
  box: { width: 6000, depth: 3600, height: 3700 },
  obstacles: [{ id: "OST-01", type: "grondaia", side: "posteriore", label: "Grondaia di casa", elevation: top - 400, height: 400, projection: 3600 }],
})
const collisions = checkCollisions(assembly, envelope)

const violations: Violation[] = [
  { ruleId: "r1", kind: "pendenza", severity: "errore", message: "Pendenza fuori intervallo", pieceIds: ["PIL-01"] },
  { ruleId: "r2", kind: "sbalzo-massimo", severity: "avviso", message: "Sbalzo al limite", pieceIds: [joist.id] },
] as unknown as Violation[]

describe("problemPieceIds", () => {
  it("include pezzi in collisione e in violazioni errore, non gli avvisi", () => {
    const ids = problemPieceIds(collisions, violations)
    expect(ids.has(joist.id)).toBe(true)
    expect(ids.has("PIL-01")).toBe(true)
    const onlyWarning = problemPieceIds([], violations.slice(1))
    expect(onlyWarning.size).toBe(0)
  })
})

describe("pieceMessages", () => {
  it("descrive la collisione con il tipo di ostacolo e le violazioni", () => {
    const msgs = pieceMessages(joist.id, collisions, violations, envelope)
    expect(msgs[0].tone).toBe("errore")
    expect(msgs[0].text).toMatch(/^Collisione con grondaia OST-01 – Grondaia di casa \(\d/)
    expect(msgs.at(-1)).toEqual({ tone: "avviso", text: "Sbalzo al limite" })
  })
  it("descrive l'uscita dall'ingombro con il lato", () => {
    const msgs = pieceMessages(
      "X",
      [{ pieceId: "X", obstacleId: "ingombro", side: "soffitto", depth: 12.34, message: "" }],
      [],
      envelope
    )
    expect(msgs).toEqual([{ tone: "errore", text: "Esce dall'ingombro (lato soffitto) di 12,3 mm" }])
  })
})

describe("pieceSummary / pieceCenter / piecesBounds", () => {
  it("riassume il pezzo e ne calcola centro e bounding box", () => {
    const pil = assembly.pieces.find((p) => p.type === "pilastro")!
    const s = pieceSummary(pil)
    expect(s.section).toBe(`${pil.section.b}×${pil.section.h} mm`)
    expect(s.length).toMatch(/ mm$/)
    const c = pieceCenter(pil)
    const box = pieceAabb(pil)
    expect(c[2]).toBeCloseTo((box.min.z + box.max.z) / 2)
    expect(piecesBounds(assembly.pieces, [pil.id])).toEqual(box)
    expect(piecesBounds(assembly.pieces, ["nessuno"])).toBeUndefined()
    const both = piecesBounds(assembly.pieces, [pil.id, joist.id])!
    expect(both.max.z).toBeGreaterThanOrEqual(pieceAabb(joist).max.z)
  })
})
