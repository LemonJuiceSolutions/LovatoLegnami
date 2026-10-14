import type { ObstacleType, PieceFamily } from "@/domain"

/**
 * Colori del visualizzatore 3D derivati dal tema dell'app (variabili CSS
 * shadcn `--background`, `--foreground`, … in formato HSL "h s% l%").
 * Funzioni pure: il hook `useViewerPalette` legge i valori calcolati sul
 * `<html>` e li ricalcola quando cambia la classe `.dark`.
 */

/** Token del tema letti dal visualizzatore. */
export const THEME_TOKENS = [
  "background",
  "foreground",
  "primary",
  "destructive",
  "muted",
  "muted-foreground",
  "border",
] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]

export interface ViewerPalette {
  readonly background: string
  readonly foreground: string
  readonly primary: string
  readonly destructive: string
  readonly muted: string
  readonly mutedForeground: string
  readonly border: string
  /** `true` se lo sfondo è scuro (luminosità < 50%). */
  readonly dark: boolean
}

/** Valori di riserva = tema chiaro di `globals.css` (usati se un token manca). */
export const FALLBACK_TOKENS: Readonly<Record<ThemeToken, string>> = {
  background: "0 0% 100%",
  foreground: "222.2 84% 4.9%",
  primary: "222.2 47.4% 11.2%",
  destructive: "0 84.2% 60.2%",
  muted: "210 40% 96.1%",
  "muted-foreground": "215.4 16.3% 46.9%",
  border: "214.3 31.8% 91.4%",
}

export interface Hsl {
  readonly h: number
  readonly s: number
  readonly l: number
}

/** Interpreta un token shadcn ("222.2 84% 4.9%", anche con virgole o `hsl(...)`); `null` se non valido. */
export function parseHslToken(token: string): Hsl | null {
  const m = token
    .trim()
    .replace(/^hsla?\(|\)$/g, "")
    .split(/[\s,/]+/)
    .filter(Boolean)
  if (m.length < 3) return null
  const [h, s, l] = m.slice(0, 3).map((v) => Number.parseFloat(v))
  if (![h, s, l].every(Number.isFinite)) return null
  return { h: h >= 0 && h < 360 ? h : ((h % 360) + 360) % 360, s: Math.min(100, Math.max(0, s)), l: Math.min(100, Math.max(0, l)) }
}

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v * 255))).toString(16).padStart(2, "0")

/** HSL (gradi, %, %) → "#rrggbb". */
export function hslToHex({ h, s, l }: Hsl): string {
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return `#${hex2(f(0))}${hex2(f(8))}${hex2(f(4))}`
}

/** Token shadcn → "#rrggbb"; `fallback` se il token non è valido. */
export function hslTokenToHex(token: string | undefined, fallback: string): string {
  const hsl = token ? parseHslToken(token) : null
  return hsl ? hslToHex(hsl) : hslTokenToHex(fallback, "0 0% 50%")
}

/** Miscela lineare di due colori "#rrggbb" (t = 0 → a, t = 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16) / 255)
  const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16) / 255)
  return `#${pa.map((v, i) => hex2(v + (pb[i] - v) * t)).join("")}`
}

/** Tavolozza del visualizzatore da una funzione che legge i token (es. `getComputedStyle`). */
export function paletteFromTokens(read: (token: ThemeToken) => string | undefined): ViewerPalette {
  const get = (t: ThemeToken) => {
    const v = read(t)?.trim()
    return v ? v : FALLBACK_TOKENS[t]
  }
  const hex = (t: ThemeToken) => hslTokenToHex(get(t), FALLBACK_TOKENS[t])
  const bg = parseHslToken(get("background")) ?? parseHslToken(FALLBACK_TOKENS.background)!
  return {
    background: hex("background"),
    foreground: hex("foreground"),
    primary: hex("primary"),
    destructive: hex("destructive"),
    muted: hex("muted"),
    mutedForeground: hex("muted-foreground"),
    border: hex("border"),
    dark: bg.l < 50,
  }
}

export const DEFAULT_PALETTE: ViewerPalette = paletteFromTokens(() => undefined)

/* ------------------------------------------------------------------ */
/* Colori dei pezzi e degli ostacoli                                   */
/* ------------------------------------------------------------------ */

/** Toni legno per famiglia (pezzi strutturali): distinguibili ma coerenti. */
export const FAMILY_COLORS: Readonly<Record<PieceFamily, string>> = {
  PIL: "#8b5a2b",
  TRV: "#b07a3e",
  TVT: "#d9b27c",
  PNT: "#a0662f",
  COL: "#6f4521",
  CTV: "#c4925a",
  BNC: "#9c7a54",
  TAV: "#c08a4a",
  ARC: "#7d4f26",
  CAN: "#94592a",
  MON: "#5e3a1c",
  MEN: "#b5824a",
  FAS: "#e0c194",
  GRG: "#cfae86",
}

export const FAMILY_LABELS: Readonly<Record<PieceFamily, string>> = {
  PIL: "Pilastri",
  TRV: "Travi",
  TVT: "Travetti",
  PNT: "Puntoni",
  COL: "Colmo",
  CTV: "Controventi",
  BNC: "Banchina",
  TAV: "Tavole",
  ARC: "Archi",
  CAN: "Cantonali",
  MON: "Monaci",
  MEN: "Mensole",
  FAS: "Fasce",
  GRG: "Grigliati",
}

export const OBSTACLE_LABELS: Readonly<Record<ObstacleType, string>> = {
  sottomuro: "Sottomuro",
  finestra: "Finestra",
  grondaia: "Grondaia",
  sporgenza: "Sporgenza",
  generico: "Ostacolo generico",
}

/** Tonalità per tipo di ostacolo; luminosità e saturazione seguono il tema. */
const OBSTACLE_HUES: Readonly<Record<ObstacleType, number>> = {
  sottomuro: 215,
  finestra: 190,
  grondaia: 265,
  sporgenza: 160,
  generico: 40,
}

/** Colore dell'ostacolo per tipo, più chiaro con il tema scuro. */
export function obstacleColor(type: ObstacleType, palette: Pick<ViewerPalette, "dark">): string {
  return hslToHex({ h: OBSTACLE_HUES[type], s: 45, l: palette.dark ? 65 : 45 })
}
