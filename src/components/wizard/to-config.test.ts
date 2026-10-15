import { describe, expect, it } from "vitest"
import type { StateStorage } from "zustand/middleware"
import { planDeviations } from "@/domain/envelope/plan"
import { loadPreset } from "@/domain/presets/catalog"
import { DEFAULT_LOVATO_RULES } from "@/domain/rules/data/default-lovato"
import { getTypology } from "@/domain/typologies/registry"
import { ConfigFileSchema, parseConfigFile } from "@/stores/config-file"
import { createWizardStore, WIZARD_STORAGE_KEY } from "@/stores/wizard-store"
import { DEFAULT_ANSWERS, measuresFromParams, newObstacle, type WizardAnswers } from "./answers"
import { toConfig } from "./to-config"

const rules = DEFAULT_LOVATO_RULES

function monofalda(patch: (a: WizardAnswers) => WizardAnswers = (a) => a): WizardAnswers {
  const preset = loadPreset("monofalda-grondaia")
  const template = getTypology("addossata-monofalda")
  return patch({
    ...DEFAULT_ANSWERS,
    tipologia: { slug: "addossata-monofalda", presetId: "monofalda-grondaia", baseParams: preset.params },
    misure: measuresFromParams(template, preset.params),
  })
}

function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

describe("toConfig (12.1)", () => {
  it("parametri del preset di riferimento con le misure del cliente in mm", () => {
    const d = toConfig(monofalda((a) => ({ ...a, misure: { ...a.misure, larghezza: 450 } })), rules)
    expect(d.error).toBeNull()
    expect(d.config?.typology).toBe("addossata-monofalda")
    expect(d.config?.params.larghezza).toBe(4500)
    expect(d.config?.params.pendenza).toBe(10) // dal preset
    expect(d.config?.commercial).toMatchObject({ species: "abete", quality: "lamellare", access: "facile" })
    // il file è valido per lo schema della stima e per il configuratore interno
    expect(ConfigFileSchema.safeParse(d.config).success).toBe(true)
    expect(() => parseConfigFile(d.config)).not.toThrow()
    expect(d.prepared?.collisions).toEqual([])
    expect(d.posts?.count).toBeGreaterThan(1)
  })

  it("diagonali 590/576 cm (fronte e muro 500, lati 300) ⇒ pianta fuori squadra di circa 2°", () => {
    const d = toConfig(
      monofalda((a) => ({
        ...a,
        misure: { ...a.misure, larghezza: 500, profondita: 300 },
        spazio: { ...a.spazio, againstWall: true, wallShape: "diagonali", diagonals: { front: 500, back: 500, left: 300, right: 300, d1: 590, d2: 576 } },
      })),
      rules,
    )
    expect(d.planError).toBeNull()
    expect(d.plan).not.toBeNull()
    expect(d.envelope?.plan).toEqual(d.plan)
    const dev = planDeviations(d.plan!).maxCornerDeg
    expect(dev).toBeGreaterThan(1.5)
    expect(dev).toBeLessThan(2.5)
    expect(d.notes.join(" ")).toMatch(/muro fuori squadra di circa 2°/i)
  })

  it("muro fuori squadra + grondaia + pendenza ⇒ pergola a filo del muro senza collisioni né verifica", () => {
    const d = toConfig(
      monofalda((a) => ({
        ...a,
        misure: { ...a.misure, larghezza: 450 },
        spazio: {
          ...a.spazio,
          wallShape: "diagonali",
          diagonals: { front: 450, back: 450, left: 300, right: 300, d1: 548, d2: 534 },
          obstacles: [{ ...newObstacle("grondaia", "g"), elevation: 270 }],
          floor: "dislivello",
          floorDrop: 5,
        },
      })),
      rules,
    )
    expect(d.prepared!.collisions).toEqual([])
    expect(d.prepared!.needsReview).toBe(false)
    // fianco sinistro aperto: angoli sinistri in x = 0, deviazione misurata conservata
    expect(d.plan!.corners[0].x).toBe(0)
    expect(d.plan!.corners[3].x).toBe(0)
    expect(planDeviations(d.plan!).maxCornerDeg).toBeGreaterThan(1)
    expect(d.notes.join(" ")).not.toMatch(/verifica del nostro ufficio/)
  })

  it("diagonali incoerenti ⇒ messaggio semplice e pianta rettangolare", () => {
    const d = toConfig(
      monofalda((a) => ({ ...a, spazio: { ...a.spazio, wallShape: "diagonali", diagonals: { front: 500, back: 500, left: 300, right: 300, d1: 900, d2: 576 } } })),
      rules,
    )
    expect(d.planError).toMatch(/ricontrolla le due diagonali/)
    expect(d.plan).toBeNull()
    expect(d.config).not.toBeNull()
  })

  it("grondaia a 270 cm sporgente 15 cm ⇒ ostacolo nell'ingombro e configurazione adattata", () => {
    const d = toConfig(
      monofalda((a) => ({ ...a, spazio: { ...a.spazio, obstacles: [{ ...newObstacle("grondaia", "g1"), elevation: 270, projection: 15 }] } })),
      rules,
    )
    const obstacle = d.envelope!.obstacles.find((o) => o.id === "g1")!
    expect(obstacle).toMatchObject({ type: "grondaia", side: "posteriore", elevation: 2700, projection: 150 })
    // la monofalda del preset (altezza 2,4 m, pendenza 10°) sale oltre 2,7 m al muro: collide e viene adattata
    expect(d.prepared!.fitAdjustments.length).toBeGreaterThan(0)
    expect(d.prepared!.collisions).toEqual([])
    expect(d.notes.join(" ")).toMatch(/Abbiamo ridotto .* per passare sotto la grondaia/)
    // l'adattamento non allarga mai le misure chieste
    for (const adj of d.prepared!.fitAdjustments) expect(adj.to).toBeLessThan(adj.from)
  })

  it("profondità oltre la luce della sezione di default ⇒ sezione adeguata automaticamente", () => {
    const d = toConfig(monofalda((a) => ({ ...a, misure: { ...a.misure, profondita: 400 } })), rules)
    expect(d.prepared!.autosize.length).toBeGreaterThan(0)
    expect(d.prepared!.violations.filter((v) => v.severity === "errore")).toEqual([])
    expect(d.notes).toContain("Le sezioni del legno sono state adeguate automaticamente alle misure scelte.")
  })

  it("larghezza oltre il passo del preset ⇒ una campata (un pilastro) in più", () => {
    const narrow = toConfig(monofalda((a) => ({ ...a, misure: { ...a.misure, larghezza: 500 } })), rules)
    const wide = toConfig(monofalda((a) => ({ ...a, misure: { ...a.misure, larghezza: 800 } })), rules)
    expect(wide.posts!.count).toBeGreaterThan(narrow.posts!.count)
    expect(narrow.posts!.nextPostAboveMm).not.toBeNull()
  })

  it("pavimento in pendenza ⇒ quote agli angoli dell'ingombro", () => {
    const d = toConfig(monofalda((a) => ({ ...a, spazio: { ...a.spazio, floor: "dislivello", floorDrop: 8, floorDirection: "fronte" } })), rules)
    expect(d.envelope!.floor.corners).toMatchObject({ frontLeft: -80, frontRight: -80, backLeft: 0, backRight: 0 })
  })

  it("senza tipologia ⇒ nessuna configurazione", () => {
    expect(toConfig(DEFAULT_ANSWERS, rules).config).toBeNull()
  })
})

describe("store del wizard (12.1)", () => {
  it("ricaricamento: un nuovo store dallo stesso storage ritrova passo e risposte", async () => {
    const storage = memoryStorage()
    const a = createWizardStore({ storage })
    a.getState().setRuleSet(rules)
    a.getState().chooseTypology("addossata-monofalda", { id: "monofalda-grondaia", params: loadPreset("monofalda-grondaia").params })
    a.getState().setMeasure("larghezza", 520)
    a.getState().setSpace({ floor: "dislivello", floorDrop: 5 })
    a.getState().setStep("finiture")
    expect(storage.data.has(WIZARD_STORAGE_KEY)).toBe(true)

    // come nel browser: prima l'idratazione, poi le regole dal server (una scrittura prima
    // dell'idratazione sovrascriverebbe lo storage)
    const b = createWizardStore({ storage, skipHydration: true })
    await b.persist.rehydrate()
    b.getState().setRuleSet(rules)
    expect(b.getState().step).toBe("finiture")
    expect(b.getState().answers).toEqual(a.getState().answers)
    expect(b.getState().derived.config?.params.larghezza).toBe(5200)
  })

  it("tornare indietro non perde i dati né il passo più avanzato", () => {
    const s = createWizardStore({ storage: memoryStorage() })
    s.getState().setRuleSet(rules)
    s.getState().chooseTypology("autoportante-bifalda", null)
    s.getState().setStep("riepilogo")
    s.getState().setStep("misure")
    expect(s.getState().step).toBe("riepilogo")
    expect(s.getState().answers.tipologia.slug).toBe("autoportante-bifalda")
    expect(s.getState().derived.config).not.toBeNull()
  })
})
