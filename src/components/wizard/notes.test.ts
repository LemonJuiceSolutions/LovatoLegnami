import { describe, expect, it } from "vitest"
import { planFromDiagonals, rectanglePlan } from "@/domain/envelope/plan"
import { parseEnvelope } from "@/domain/envelope/types"
import type { Violation } from "@/domain/rules/types"
import { loadPreset } from "@/domain/presets/catalog"
import { DEFAULT_LOVATO_RULES } from "@/domain/rules/data/default-lovato"
import { getTypology } from "@/domain/typologies/registry"
import { DEFAULT_ANSWERS, measuresFromParams, newObstacle } from "./answers"
import { REVIEW_NOTE, SECTIONS_NOTE, SQUARE_UNKNOWN_NOTE, simpleMetres, simpleNotes, type SimpleNotesInput } from "./notes"
import { toConfig } from "./to-config"

const empty: SimpleNotesInput = { violations: [], collisions: [], fitLimits: [], autosize: [] }
const grondaia = parseEnvelope({
  box: { width: 5000, depth: 3600, height: 3600 },
  obstacles: [{ id: "g1", type: "grondaia", side: "posteriore", label: "Grondaia", elevation: 2700, height: 900, projection: 150 }],
}).obstacles

const violation = (patch: Partial<Violation>): Violation => ({ ruleId: "r", kind: "max-span-by-section", severity: "errore", message: "interno", pieceIds: ["P1"], ...patch })

describe("note semplici (12.2)", () => {
  it("nessun problema ⇒ nessuna nota", () => {
    expect(simpleNotes(empty)).toEqual([])
  })

  it("metri senza zeri inutili", () => {
    expect(simpleMetres(2900)).toBe("2,9 m")
    expect(simpleMetres(2950)).toBe("2,95 m")
    expect(simpleMetres(3000)).toBe("3 m")
  })

  it("adattamento per un ostacolo sopra ⇒ 'Abbiamo ridotto la profondità a 2,9 m per passare sotto la grondaia'", () => {
    const notes = simpleNotes({
      ...empty,
      obstacles: grondaia,
      fitLimits: [{ dimension: "profondita", param: "profondita", from: 3050, to: 2900, cause: { kind: "ostacolo", obstacleIds: ["g1"] } }],
    })
    expect(notes).toEqual(["Abbiamo ridotto la profondità a 2,9 m per passare sotto la grondaia."])
  })

  it("adattamento per un ostacolo sul muro, per lo spazio e per le regole", () => {
    const porta = parseEnvelope({ box: { width: 5000, depth: 3600, height: 3600 }, obstacles: [{ id: "p", type: "finestra", side: "posteriore", label: "Porta", offset: 100, width: 900, elevation: 0, height: 2200 }] }).obstacles
    expect(simpleNotes({ ...empty, obstacles: porta, fitLimits: [{ dimension: "altezza", param: "altezza", from: 2400, to: 2100, cause: { kind: "ostacolo", obstacleIds: ["p"] } }] })).toEqual([
      "Abbiamo ridotto l'altezza a 2,1 m per non toccare la porta.",
    ])
    expect(simpleNotes({ ...empty, fitLimits: [{ dimension: "larghezza", param: "larghezza", from: 5000, to: 4500, cause: { kind: "ingombro", sides: ["destro"] } }] })[0]).toBe(
      "Abbiamo ridotto la larghezza a 4,5 m per stare nello spazio disponibile.",
    )
    expect(simpleNotes({ ...empty, fitLimits: [{ dimension: "larghezza", param: "larghezza", from: 5000, to: 4500, cause: { kind: "regola", ruleIds: ["x"] } }] })[0]).toMatch(/regole di costruzione\.$/)
  })

  it("auto-dimensionamento: sezioni e interasse dei travetti", () => {
    const notes = simpleNotes({
      ...empty,
      autosize: [
        { param: "sezioneTrave", from: "120×200", to: "120×240", ruleIds: ["luci"], pieceIds: ["T1"], message: "" },
        { param: "interasse", from: 800, to: 620, ruleIds: ["interasse"], pieceIds: [], message: "" },
      ],
    })
    expect(notes).toEqual([SECTIONS_NOTE, "Abbiamo avvicinato i travetti (uno ogni 62 cm) per reggere bene la copertura."])
  })

  it("pianta fuori squadra ⇒ 'Muro fuori squadra di circa 2°'; in squadra nessuna nota", () => {
    const plan = planFromDiagonals({ front: 5000, back: 5000, left: 3000, right: 3000, d1: 5900, d2: 5760 })
    expect(simpleNotes({ ...empty, plan }).join(" ")).toMatch(/^Muro fuori squadra di circa 2°/)
    expect(simpleNotes({ ...empty, plan: rectanglePlan({ width: 5000, depth: 3000 }) })).toEqual([])
  })

  it("squadra non nota ⇒ verifica al sopralluogo", () => {
    expect(simpleNotes({ ...empty, squareUnknown: true })).toEqual([SQUARE_UNKNOWN_NOTE])
  })

  it("violazioni solo di avviso ⇒ nessuna nota per il cliente", () => {
    expect(simpleNotes({ ...empty, violations: [violation({ severity: "avviso" })] })).toEqual([])
  })

  it("non risolvibile: altezza libera insufficiente ⇒ spiegazione e verifica dell'ufficio", () => {
    const notes = simpleNotes({ ...empty, violations: [violation({ kind: "min-clear-height" })] })
    expect(notes).toEqual(["Lo spazio in altezza è poco per questo modello.", REVIEW_NOTE])
    expect(REVIEW_NOTE).toMatch(/^Questa soluzione richiede una verifica del nostro ufficio/)
  })

  it("non risolvibile: collisioni residue ⇒ verifica dell'ufficio (si può comunque inviare)", () => {
    const notes = simpleNotes({ ...empty, collisions: [{ pieceId: "P1", obstacleId: "g1", depth: 30, message: "interno" }], fitFailed: true })
    expect(notes.at(-1)).toBe(REVIEW_NOTE)
    expect(REVIEW_NOTE).toMatch(/puoi comunque inviare la richiesta/)
  })

  it("dal wizard: balcone troppo basso sopra tutto lo spazio (ingombro troppo basso) ⇒ nota di verifica, configurazione comunque prodotta", () => {
    const preset = loadPreset("monofalda-grondaia")
    const template = getTypology("addossata-monofalda")
    const d = toConfig(
      {
        ...DEFAULT_ANSWERS,
        tipologia: { slug: "addossata-monofalda", presetId: "monofalda-grondaia", baseParams: preset.params },
        misure: measuresFromParams(template, preset.params),
        spazio: { ...DEFAULT_ANSWERS.spazio, obstacles: [{ ...newObstacle("balcone", "b"), elevation: 170, projection: 500 }] },
      },
      DEFAULT_LOVATO_RULES,
    )
    expect(d.config).not.toBeNull()
    expect(d.prepared!.needsReview).toBe(true)
    expect(d.notes).toContain(REVIEW_NOTE)
  })
})
