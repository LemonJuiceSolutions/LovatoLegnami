import { describe, expect, it } from "vitest"
import type { NumberParamSpec } from "@/domain"
import {
  formatRange,
  groupParams,
  numberParamError,
  parseNumberInput,
  sectionOptions,
} from "./form-helpers"

const pendenza: NumberParamSpec = { kind: "number", name: "pendenza", label: "Pendenza", unit: "°", min: 3, max: 45, default: 15 }

describe("form-helpers", () => {
  it("interpreta numeri con virgola o punto e rifiuta testo non numerico", () => {
    expect(parseNumberInput("12,5")).toBe(12.5)
    expect(parseNumberInput(" 3000 ")).toBe(3000)
    expect(parseNumberInput("-80")).toBe(-80)
    expect(parseNumberInput("")).toBeUndefined()
    expect(parseNumberInput("12a")).toBeUndefined()
    expect(parseNumberInput("-")).toBeUndefined()
  })

  it("segnala i valori fuori limite con l'intervallo ammesso", () => {
    expect(numberParamError(pendenza, 50)).toBe("Fuori limite: ammesso 3–45 °")
    expect(numberParamError(pendenza, 15)).toBeUndefined()
    expect(numberParamError({ ...pendenza, unit: "n", integer: true, min: 1, max: 8 }, 2.5)).toBe("Inserire un numero intero")
    expect(formatRange(2000, 12000, "mm")).toBe("2000–12000 mm")
  })

  it("separa le sezioni dagli altri parametri e propone il catalogo", () => {
    const g = groupParams([pendenza, { kind: "section", name: "sezioneTrave", label: "Sezione travi", pieceType: "trave", default: "120×240" }])
    expect(g.main.map((p) => p.name)).toEqual(["pendenza"])
    expect(g.sections.map((p) => p.name)).toEqual(["sezioneTrave"])
    expect(sectionOptions("120×240")).toContain("120×240")
    expect(sectionOptions("130×250")[0]).toBe("130×250")
  })
})
