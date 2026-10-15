import { createRequire } from "node:module"
import path from "node:path"
import { describe, expect, it } from "vitest"

/** Intestazioni di `next.config.js`: cache del kernel OCCT (13.1) e sicurezza (14.3). */
const require = createRequire(import.meta.url)
const config = require(path.join(process.cwd(), "next.config.js")) as {
  headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>
}

describe("next.config.js headers()", () => {
  it("ogni pagina non è incorniciabile e non fa MIME sniffing", async () => {
    const all = (await config.headers()).find((h) => h.source === "/:path*")
    const map = Object.fromEntries(all!.headers.map((h) => [h.key, h.value]))
    expect(map["X-Frame-Options"]).toBe("DENY")
    expect(map["Content-Security-Policy"]).toBe("frame-ancestors 'none'")
    expect(map["X-Content-Type-Options"]).toBe("nosniff")
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
  })

  it("WASM OCCT con cache immutabile e tipo application/wasm", async () => {
    const wasm = (await config.headers()).find((h) => h.source === "/occt/:path*.wasm")
    const map = Object.fromEntries(wasm!.headers.map((h) => [h.key, h.value]))
    expect(map["Cache-Control"]).toBe("public, max-age=31536000, immutable")
    expect(map["Content-Type"]).toBe("application/wasm")
  })
})
