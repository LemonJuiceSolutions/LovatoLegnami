import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 13.3: ogni comando `npm run <script>` citato nella guida di rilascio e nel README esiste
 * in `package.json`, e i file citati dalla guida esistono.
 */

const ROOT = process.cwd()
const scripts = Object.keys((JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts)
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8")

const npmRunCommands = (md: string): string[] => [...new Set([...md.matchAll(/npm run ([a-z][\w:-]*)/g)].map((m) => m[1]!))]

describe.each(["docs/deploy.md", "README.md"])("%s", (file) => {
  const md = read(file)

  it("cita solo script esistenti in package.json", () => {
    const commands = npmRunCommands(md)
    expect(commands.length).toBeGreaterThan(0)
    expect(commands.filter((c) => !scripts.includes(c))).toEqual([])
  })
})

describe("docs/deploy.md", () => {
  const md = read("docs/deploy.md")

  it("cita i comandi del rilascio", () => {
    for (const c of ["db:migrate", "db:seed", "build", "lint", "test:db", "test:bundle", "test:geometry"]) expect(npmRunCommands(md)).toContain(c)
  })

  it("i file del progetto citati esistono", () => {
    const files = [...md.matchAll(/`((?:src|docs|scripts|\.github)\/[\w./-]+\.\w+|vercel\.json|\.env\.example|next\.config\.js)`/g)].map((m) => m[1]!)
    expect(files.length).toBeGreaterThan(3)
    expect(files.filter((f) => !existsSync(path.join(ROOT, f)))).toEqual([])
  })

  it("elenca tutte le variabili validate da src/server/env.ts", () => {
    const env = read("src/server/env.ts")
    const schema = env.slice(env.indexOf("const EnvSchema"), env.indexOf("});", env.indexOf("const EnvSchema")))
    const names = [...schema.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]!).filter((n) => n !== "NODE_ENV")
    expect(names.length).toBeGreaterThan(8)
    expect(names.filter((n) => !md.includes(`\`${n}\``))).toEqual([])
  })

  it("ha la checklist delle voci da confermare", () => {
    expect(md).toMatch(/## \d+\. Da confermare/)
  })
})
