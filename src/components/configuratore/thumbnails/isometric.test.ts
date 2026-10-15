import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { generate, listTypologies } from "@/domain"
import { FAMILY_COLORS } from "../viewer/piece-colors"
import { VIEW_DIR, isometricSvg, projectPoint, thumbnailFaces, thumbnailFor } from "./isometric"

const polygons = (svg: string) => svg.match(/<polygon /g)?.length ?? 0

describe("miniature assonometriche", () => {
  it("la direzione di vista ha proiezione nulla", () => {
    const p = projectPoint(VIEW_DIR)
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(0, 9)
  })

  it("stessa tipologia due volte → stringhe identiche (anche senza memo)", () => {
    for (const { slug } of listTypologies()) {
      const a = isometricSvg(generate(slug).pieces, { label: slug })
      const b = isometricSvg(generate(slug).pieces, { label: slug })
      expect(a).toBe(b)
      expect(thumbnailFor(slug)).toBe(thumbnailFor(slug))
    }
  })

  it("ogni tipologia produce un SVG con viewBox e facce", () => {
    for (const { slug } of listTypologies()) {
      const svg = thumbnailFor(slug)
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+"/)
      expect(polygons(svg)).toBeGreaterThan(0)
      expect(svg).toContain("currentColor")
    }
  })

  it("portale-sandwich: 3 facce visibili per pilastro (≥ 6 pilastri → ≥ 18 facce)", () => {
    const { pieces } = generate("portale-sandwich")
    const posts = pieces.filter((p) => p.type === "pilastro")
    expect(posts.length).toBeGreaterThanOrEqual(6)
    const faces = thumbnailFaces(pieces)
    const postFaces = faces.filter((f) => posts.some((p) => p.id === f.pieceId))
    expect(postFaces.length).toBe(posts.length * 3)
    expect(postFaces.length).toBeGreaterThanOrEqual(18)
    expect(polygons(isometricSvg(pieces))).toBe(faces.length)
  })

  it("i pezzi curvi sono disegnati per tratti (pieceObbs)", () => {
    const { pieces } = generate("carport-arco")
    const arc = pieces.find((p) => p.curve)!
    const segments = Math.ceil(arc.curve!.sweep / 15)
    const faces = thumbnailFaces(pieces).filter((f) => f.pieceId === arc.id)
    expect(faces.length).toBeGreaterThanOrEqual(segments * 2)
  })

  it("usa i colori di famiglia del viewer", () => {
    const svg = thumbnailFor("portale-sandwich")
    expect(svg).toContain(FAMILY_COLORS.PIL)
  })

  it("il modulo non dipende da React né da Three", () => {
    const src = readFileSync(fileURLToPath(new URL("./isometric.ts", import.meta.url)), "utf8")
    const colors = readFileSync(fileURLToPath(new URL("../viewer/piece-colors.ts", import.meta.url)), "utf8")
    for (const s of [src, colors]) expect(s).not.toMatch(/from "(react|three|@react-three\/[^"]+)"/)
  })
})
