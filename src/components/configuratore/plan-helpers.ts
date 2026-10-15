import {
  PlanMeasuresError,
  boxOfPlan,
  planDeviations,
  planIssues,
  type Envelope,
  type EnvelopeInput,
  type Plan,
  type Vec2,
} from "@/domain"

/**
 * Logica pura della pianta nel form dell'ingombro (10.3): pianta rettangolare (nessuna
 * `plan`), dagli **angoli** (ufficio: fronte, fianchi e angoli interni sul fronte) o
 * dalle **diagonali** (cliente/sopralluogo: `planFromDiagonals` del dominio).
 */

export const PLAN_MODES = ["rettangolare", "angoli", "diagonali"] as const
export type PlanMode = (typeof PLAN_MODES)[number]
export const PLAN_MODE_LABELS: Record<PlanMode, string> = {
  rettangolare: "Rettangolare (in squadra)",
  angoli: "Fuori squadra – angoli",
  diagonali: "Fuori squadra – diagonali",
}

/** Misure dagli angoli: fronte, fianchi e angoli interni ai due spigoli anteriori (gradi). */
export interface AngleMeasures {
  readonly front: number
  readonly left: number
  readonly right: number
  /** Angolo interno all'anteriore sinistro (90 = in squadra). */
  readonly angleLeft: number
  /** Angolo interno all'anteriore destro. */
  readonly angleRight: number
}

const rad = (deg: number) => (deg * Math.PI) / 180
const round6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0

/**
 * Pianta dagli angoli: fronte su X dall'origine, fianchi lunghi `left`/`right` con gli
 * angoli interni dati; traslata perché il rettangolo contenitore parta da 0.
 * `PlanMeasuresError` ("misure non coerenti") se la pianta non è un quadrilatero convesso.
 */
export function planFromAngles(m: AngleMeasures): Plan {
  for (const [k, v] of Object.entries(m))
    if (!Number.isFinite(v) || v <= 0) throw new PlanMeasuresError(`${k} deve essere un numero maggiore di 0`)
  if (m.angleLeft >= 180 || m.angleRight >= 180) throw new PlanMeasuresError("gli angoli devono essere minori di 180°")
  const fl: Vec2 = { x: 0, y: 0 }
  const fr: Vec2 = { x: m.front, y: 0 }
  const bl: Vec2 = { x: m.left * Math.cos(rad(m.angleLeft)), y: m.left * Math.sin(rad(m.angleLeft)) }
  const br: Vec2 = { x: m.front - m.right * Math.cos(rad(m.angleRight)), y: m.right * Math.sin(rad(m.angleRight)) }
  const minX = Math.min(fl.x, bl.x)
  const at = (p: Vec2): Vec2 => ({ x: round6(p.x - minX), y: round6(p.y) })
  const plan: Plan = { corners: [at(fl), at(fr), at(br), at(bl)] }
  const issues = planIssues(plan, boxOfPlan(plan, 1))
  if (issues.length) throw new PlanMeasuresError(issues[0].message)
  return plan
}

/** Inverso di `planFromAngles` (per precompilare il form da una pianta esistente). */
export function anglesFromPlan(plan: Plan): AngleMeasures {
  const [fl, fr, br, bl] = plan.corners
  const dev = planDeviations(plan).corners
  const round1 = (v: number) => Math.round(v * 10) / 10
  return {
    front: Math.round(Math.hypot(fr.x - fl.x, fr.y - fl.y)),
    left: Math.round(Math.hypot(bl.x - fl.x, bl.y - fl.y)),
    right: Math.round(Math.hypot(br.x - fr.x, br.y - fr.y)),
    angleLeft: round1(90 + dev.anterioreSinistro),
    angleRight: round1(90 + dev.anterioreDestro),
  }
}

/** Ingombro con la pianta data (box = rettangolo contenitore, stessa altezza) o rettangolare (`null`). */
export function envelopeWithPlan(envelope: Envelope, plan: Plan | null): EnvelopeInput {
  const { plan: _old, ...rest } = envelope
  void _old
  const base = { ...rest, obstacles: [...envelope.obstacles], floor: { corners: envelope.floor.corners, points: [...envelope.floor.points] } }
  if (!plan) return base
  return { ...base, box: boxOfPlan(plan, envelope.box.height), plan: { corners: [...plan.corners] as unknown as Plan["corners"] } } as EnvelopeInput
}

/** Deviazioni da mostrare: massima dallo squadro e rotazione del muro (gradi, assoluti). */
export function planSummary(envelope: Pick<Envelope, "plan" | "wallSide">): { maxDeg: number; wallDeg: number } | null {
  if (!envelope.plan) return null
  const d = planDeviations(envelope.plan)
  return { maxDeg: d.maxCornerDeg, wallDeg: Math.abs(d.sides[envelope.wallSide]) }
}
