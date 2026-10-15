import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { beforeAll, describe, expect, it } from "vitest"

/**
 * Test di bundle del sito pubblico (11.6, P8, spec `sito-pubblico` "Prestazioni"): da
 * eseguire **dopo `next build`** con `npm run test:bundle` (progetto vitest `bundle`,
 * escluso da `npm test`).
 *
 * - JS iniziale di una pagina = file principali della radice (`build-manifest.json`
 *   `rootMainFiles`) + chunk del layout radice, del layout `(site)` e della pagina
 *   (`app-build-manifest.json`), senza duplicati e senza i polyfill `nomodule`: è lo
 *   stesso conto della colonna "First Load JS" di `next build`, ma compresso con gzip.
 * - Nessun chunk iniziale delle pagine `(site)` (escluso il wizard `preventivo`) contiene
 *   firme di `three`, `@react-three/*`, `replicad`/OCCT, `zustand` o del listino seed
 *   (`src/domain/pricing/data`). Le firme sono verificate sul build stesso: ognuna deve
 *   comparire in almeno un chunk dell'app (il configuratore interno le carica), così un
 *   aggiornamento di libreria che le cambia fa fallire il test invece di renderlo cieco.
 */

const NEXT_DIR = path.join(process.cwd(), ".next")
const HOME_BUDGET_BYTES = 200 * 1024

const SIGNATURES: Readonly<Record<string, RegExp>> = {
  three: /WebGLRenderer/,
  "@react-three": /__r3f/,
  replicad: /replicad|opencascade/i,
  zustand: /getInitialState=\(\)=>/,
  "listino seed (domain/pricing/data)": /pricePerM3|Policarbonato alveolare/,
}

interface Manifests {
  rootMainFiles: string[]
  pages: Record<string, string[]>
}

let manifests: Manifests

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(NEXT_DIR, file), "utf8")) as T
}

const gz = (file: string) => gzipSync(readFileSync(path.join(NEXT_DIR, file)), { level: 9 }).length
const text = (file: string) => readFileSync(path.join(NEXT_DIR, file), "utf8")

/** Chunk JS iniziali di una pagina del gruppo `(site)`. */
function initialChunks(page: string): string[] {
  const files = [...manifests.rootMainFiles, ...(manifests.pages["/layout"] ?? []), ...(manifests.pages["/(site)/layout"] ?? []), ...(manifests.pages[page] ?? [])]
  return [...new Set(files.filter((f) => f.endsWith(".js")))]
}

function allChunks(dir = path.join(NEXT_DIR, "static", "chunks")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return allChunks(full)
    return name.endsWith(".js") ? [path.relative(NEXT_DIR, full)] : []
  })
}

/** Pagina del wizard (gruppo 12): unica del sito con dominio, zustand e (a richiesta) il 3D. */
const WIZARD_PAGE = "/(site)/preventivo/[[...step]]/page"
/**
 * Budget del wizard: il dominio (template, regole, zod) gira nel browser per l'anteprima
 * immediata, quindi supera di poco i 200 kB delle altre pagine; `three`/r3f e il kernel
 * restano fuori dal JS iniziale (caricati solo nel riepilogo).
 */
const WIZARD_BUDGET_BYTES = 240 * 1024

/** Pagine pubbliche: tutto il gruppo `(site)` tranne il wizard (conferma e pagina del cliente comprese). */
const sitePages = () => Object.keys(manifests.pages).filter((p) => p.startsWith("/(site)/") && p.endsWith("page") && p !== WIZARD_PAGE)

beforeAll(() => {
  if (!existsSync(path.join(NEXT_DIR, "app-build-manifest.json")))
    throw new Error("build assente: eseguire `npm run build` prima di `npm run test:bundle`")
  const build = readJson<{ rootMainFiles: string[] }>("build-manifest.json")
  const app = readJson<{ pages: Record<string, string[]> }>("app-build-manifest.json")
  manifests = { rootMainFiles: build.rootMainFiles, pages: app.pages }
})

describe("bundle del sito pubblico (11.6)", () => {
  it("le pagine del sito sono nel build", () => {
    const pages = sitePages()
    for (const p of ["/(site)/page", "/(site)/pergole/page", "/(site)/pergole/[seoSlug]/page", "/(site)/galleria/page", "/(site)/contatti/page", "/(site)/privacy/page", "/(site)/preventivo/grazie/page", "/(site)/p/[token]/page"])
      expect(pages).toContain(p)
  })

  it("le firme delle librerie vietate esistono nel build (il controllo non è cieco)", () => {
    const contents = allChunks().map(text)
    for (const [name, re] of Object.entries(SIGNATURES)) expect(contents.some((c) => re.test(c)), `firma di ${name} non trovata in nessun chunk`).toBe(true)
  })

  it("nessuna pagina del sito (tranne il wizard) carica 3D, kernel, zustand o il listino seed", () => {
    const found: string[] = []
    for (const page of sitePages())
      for (const chunk of initialChunks(page)) {
        const c = text(chunk)
        for (const [name, re] of Object.entries(SIGNATURES)) if (re.test(c)) found.push(`${page}: ${name} in ${chunk}`)
      }
    expect(found).toEqual([])
  })

  it("JS iniziale della home < 200 kB compressi", () => {
    const total = initialChunks("/(site)/page").reduce((s, f) => s + gz(f), 0)
    console.info(`[bundle] JS iniziale della home: ${(total / 1024).toFixed(1)} kB gzip`)
    expect(total).toBeLessThan(HOME_BUDGET_BYTES)
  })

  it("JS iniziale di ogni pagina del sito < 200 kB compressi", () => {
    const over = sitePages()
      .map((p) => [p, initialChunks(p).reduce((s, f) => s + gz(f), 0)] as const)
      .filter(([, size]) => size >= HOME_BUDGET_BYTES)
    expect(over).toEqual([])
  })

  it("wizard (12): nel JS iniziale niente three, r3f, kernel né listino seed; entro il budget", () => {
    expect(Object.keys(manifests.pages)).toContain(WIZARD_PAGE)
    const found: string[] = []
    for (const chunk of initialChunks(WIZARD_PAGE)) {
      const c = text(chunk)
      for (const [name, re] of Object.entries(SIGNATURES)) if (name !== "zustand" && re.test(c)) found.push(`${name} in ${chunk}`)
    }
    expect(found).toEqual([])
    const total = initialChunks(WIZARD_PAGE).reduce((s, f) => s + gz(f), 0)
    console.info(`[bundle] JS iniziale del wizard: ${(total / 1024).toFixed(1)} kB gzip`)
    expect(total).toBeLessThan(WIZARD_BUDGET_BYTES)
  })
})

/**
 * 13.4 (P12): `@vercel/analytics` entra nel build solo con `NEXT_PUBLIC_ANALYTICS=1`.
 * Senza la variabile (build predefinito, CI) nessun chunk contiene lo script delle
 * statistiche; con la variabile attiva al build il test non si applica.
 */
describe("analytics opzionale (13.4)", () => {
  it.skipIf(process.env.NEXT_PUBLIC_ANALYTICS === "1")("senza NEXT_PUBLIC_ANALYTICS il bundle non contiene @vercel/analytics", () => {
    const found = allChunks().filter((chunk) => /_vercel\/insights|@vercel\/analytics/.test(text(chunk)))
    expect(found).toEqual([])
  })
})
