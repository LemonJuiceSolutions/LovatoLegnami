import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 13.2 (P12, spec `hosting-e-distribuzione` "Ambiente di esecuzione"): nessuna route o
 * pagina dichiara il runtime edge (database, PDF ed email girano in Node); l'unico codice
 * edge è `src/middleware.ts`. Le route che generano PDF o inviano la richiesta dichiarano
 * `runtime = "nodejs"` e `maxDuration = 30`.
 */

const ROOT = process.cwd()
const APP = path.join(ROOT, "src", "app")
const SEGMENT_FILES = new Set(["route.ts", "route.tsx", "page.tsx", "page.ts", "layout.tsx", "layout.ts"])

function segmentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return segmentFiles(full)
    return SEGMENT_FILES.has(name) ? [full] : []
  })
}

const rel = (f: string) => path.relative(ROOT, f)
const EDGE = /export\s+const\s+runtime\s*=\s*["']edge["']/
const NODE = /export\s+const\s+runtime\s*=\s*["']nodejs["']/
const STATIC = /export\s+const\s+dynamic\s*=\s*["']force-static["']/
const DURATION_30 = /export\s+const\s+maxDuration\s*=\s*30\b/

describe("runtime delle route", () => {
  const files = segmentFiles(APP)

  it("trova route e pagine da controllare", () => {
    expect(files.filter((f) => f.endsWith("route.ts")).length).toBeGreaterThan(5)
    expect(files.filter((f) => f.endsWith("page.tsx")).length).toBeGreaterThan(5)
  })

  it("nessuna route o pagina dichiara il runtime edge", () => {
    const edge = files.filter((f) => EDGE.test(readFileSync(f, "utf8"))).map(rel)
    expect(edge).toEqual([])
  })

  // Escluse: le route statiche (generate al build, es. `og.png`) e l'assistente AI esistente.
  it("le route dinamiche dichiarano il runtime Node", () => {
    const routes = files.filter((f) => /route\.tsx?$/.test(f) && !f.includes(`${path.sep}api${path.sep}ai${path.sep}`))
    const missing = routes
      .map((f) => [f, readFileSync(f, "utf8")] as const)
      .filter(([, src]) => !NODE.test(src) && !STATIC.test(src))
      .map(([f]) => rel(f))
    expect(missing).toEqual([])
  })

  it.each([
    "src/app/api/preventivo/route.ts",
    "src/app/api/preventivo/[token]/pdf/route.ts",
    "src/app/api/admin/richieste/[id]/pdf/route.ts",
  ])("%s: runtime Node e maxDuration 30 s", (file) => {
    const source = readFileSync(path.join(ROOT, file), "utf8")
    expect(source).toMatch(NODE)
    expect(source).toMatch(DURATION_30)
  })

  it("il middleware è l'unico file edge e non accede al database", () => {
    const source = readFileSync(path.join(ROOT, "src", "middleware.ts"), "utf8")
    expect(source).not.toMatch(/@\/db|server\/db|drizzle|pglite|["']pg["']/i)
  })
})

describe("vercel.json", () => {
  const config = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as Record<string, unknown>

  it("migra il database prima del build (un errore interrompe il rilascio)", () => {
    expect(config.framework).toBe("nextjs")
    expect(config.buildCommand).toBe("npm run db:migrate && npm run build")
  })
})
