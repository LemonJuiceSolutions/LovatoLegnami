import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrasto dei token del tema del sito (spec `sito-pubblico`: testi ≥ 4,5:1 in chiaro e
 * in scuro). I valori sono letti da `site.css`, quindi il test segue ogni ritocco.
 */

const css = readFileSync(path.join(process.cwd(), "src/app/(site)/site.css"), "utf8")

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`blocco ${selector} assente`)
  const body = css.slice(start, css.indexOf("}", start))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

function hslToRgb(value: string): [number, number, number] {
  const m = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!m) throw new Error(`HSL non valido: ${value}`)
  const h = Number(m[1]) / 360
  const s = Number(m[2]) / 100
  const l = Number(m[3]) / 100
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

const luminance = ([r, g, b]: [number, number, number]) => {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(hslToRgb(a)), luminance(hslToRgb(b))].sort((x, y) => y - x)
  return (la + 0.05) / (lb + 0.05)
}

const light = block(".theme-site")
const dark = { ...light, ...block(".theme-site.dark") }

const PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["primary", "background"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["card-foreground", "card"],
  ["site-gold-ink", "background"],
  ["destructive", "background"],
]

describe("tema del sito: contrasto dei testi ≥ 4,5:1", () => {
  for (const [name, theme] of [
    ["chiaro", light],
    ["scuro", dark],
  ] as const)
    for (const [fg, bg] of PAIRS)
      it(`${name}: ${fg} su ${bg}`, () => {
        expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5)
      })

  it("il tema scuro ridefinisce i token principali", () => {
    for (const k of ["background", "foreground", "primary", "muted-foreground", "border"]) expect(block(".theme-site.dark")[k]).toBeDefined()
  })
})
