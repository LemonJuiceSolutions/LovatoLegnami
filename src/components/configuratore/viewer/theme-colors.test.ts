import { describe, expect, it } from "vitest"
import {
  FALLBACK_TOKENS,
  hslToHex,
  hslTokenToHex,
  mixHex,
  obstacleColor,
  paletteFromTokens,
  parseHslToken,
} from "./theme-colors"

describe("parseHslToken", () => {
  it("interpreta i token shadcn", () => {
    expect(parseHslToken("222.2 84% 4.9%")).toEqual({ h: 222.2, s: 84, l: 4.9 })
    expect(parseHslToken(" hsl(0, 84.2%, 60.2%) ")).toEqual({ h: 0, s: 84.2, l: 60.2 })
  })
  it("restituisce null per valori non validi", () => {
    expect(parseHslToken("")).toBeNull()
    expect(parseHslToken("rosso")).toBeNull()
  })
})

describe("hslToHex", () => {
  it("converte i colori di riferimento", () => {
    expect(hslToHex({ h: 0, s: 0, l: 100 })).toBe("#ffffff")
    expect(hslToHex({ h: 0, s: 0, l: 0 })).toBe("#000000")
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe("#ff0000")
    expect(hslToHex({ h: 120, s: 100, l: 50 })).toBe("#00ff00")
    expect(hslToHex({ h: 240, s: 100, l: 50 })).toBe("#0000ff")
  })
  it("usa il valore di riserva per token non validi", () => {
    expect(hslTokenToHex("boh", "0 0% 100%")).toBe("#ffffff")
  })
})

describe("mixHex", () => {
  it("miscela linearmente", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000")
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff")
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080")
  })
})

describe("paletteFromTokens", () => {
  it("usa i token del tema chiaro", () => {
    const p = paletteFromTokens((t) => FALLBACK_TOKENS[t])
    expect(p.background).toBe("#ffffff")
    expect(p.dark).toBe(false)
    expect(p.destructive).toBe(hslTokenToHex("0 84.2% 60.2%", "0 0% 0%"))
  })
  it("riconosce il tema scuro e ripiega sui default per i token mancanti", () => {
    const dark: Record<string, string> = { background: "222.2 84% 4.9%", foreground: "210 40% 98%" }
    const p = paletteFromTokens((t) => dark[t])
    expect(p.dark).toBe(true)
    expect(p.background).toBe(hslTokenToHex("222.2 84% 4.9%", ""))
    expect(p.primary).toBe(hslTokenToHex(FALLBACK_TOKENS.primary, ""))
  })
})

describe("obstacleColor", () => {
  it("distingue i tipi e si schiarisce col tema scuro", () => {
    expect(obstacleColor("grondaia", { dark: false })).not.toBe(obstacleColor("finestra", { dark: false }))
    expect(obstacleColor("grondaia", { dark: true })).not.toBe(obstacleColor("grondaia", { dark: false }))
  })
})
