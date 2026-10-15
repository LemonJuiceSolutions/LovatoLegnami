import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { KernelClient } from "@/geometry/client"
import { testStore, wizardData } from "./__fixtures__/data"
import { PreventivoWizard } from "./wizard"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
// in jsdom niente WebGL: il visualizzatore è sostituito da un segnaposto che dice in che modo è
vi.mock("./wizard-viewer", () => ({
  default: (p: { results: Record<string, unknown> }) => <div data-testid="viewer">{Object.keys(p.results).length ? "dettaglio" : "box"}</div>,
}))

const quote = (totalCents: number) => ({
  status: "completo",
  priceList: { version: 1, effectiveFrom: "2026-01-01" },
  groups: [
    { id: "struttura", label: "Struttura in legno", amountCents: Math.round(totalCents * 0.6) },
    { id: "montaggio", label: "Montaggio e trasporto", amountCents: Math.round(totalCents * 0.4) },
  ],
  discountCents: 0,
  minimumAdjustmentCents: 0,
  taxableCents: Math.round(totalCents / 1.22),
  vatPct: 22,
  vatCents: totalCents - Math.round(totalCents / 1.22),
  roundingCents: 0,
  totalCents,
  range: { pct: 10, minCents: totalCents * 0.9, maxCents: totalCents * 1.1 },
  notes: ["Prezzo indicativo (±10%), soggetto a sopralluogo."],
})

/** Stima finta: il totale dipende dalla copertura scelta. */
function fakeFetch() {
  const calls: { body: { commercial: { covering: string | null } }; at: number }[] = []
  const fn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    calls.push({ body, at: Date.now() })
    const total = body.commercial.covering ? 1_250_000 : 790_000
    return new Response(JSON.stringify({ quote: quote(total), notes: [] }), { status: 200, headers: { "content-type": "application/json" } })
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

function unavailableKernel(): KernelClient {
  const listeners = new Set<(s: "init" | "ready" | "unavailable", e?: string) => void>()
  const client: KernelClient = {
    status: "init",
    error: undefined,
    onStatusChange: (l) => (listeners.add(l), () => listeners.delete(l)),
    ready: () => Promise.reject(new Error("no")),
    build: () => Promise.reject(new Error("no")),
    exportStep: () => Promise.reject(new Error("no")),
    cancel: () => {},
    dispose: () => {},
  }
  setTimeout(() => {
    ;(client as { status: string }).status = "unavailable"
    for (const l of listeners) l("unavailable", "WASM non caricato")
  }, 10)
  return client
}

async function renderSummary(opts: { fetcher: typeof fetch; kernelFactory?: () => KernelClient; cap?: string }) {
  const store = testStore()
  store.getState().chooseTypology("autoportante-bifalda", null)
  if (opts.cap) store.getState().setContacts({ cap: opts.cap })
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(<PreventivoWizard data={wizardData()} step="riepilogo" store={store} fetcher={opts.fetcher} kernelFactory={opts.kernelFactory} />)
  })
  return { ...utils, store }
}

describe("passo 5 riepilogo (12.6)", () => {
  it("prezzo dal server; cambio copertura ⇒ nuova richiesta e prezzo aggiornato entro 1 s; nessun listino nella pagina", async () => {
    const f = fakeFetch()
    const { store, container } = await renderSummary({ fetcher: f.fn })
    expect(screen.getByText(/calcolo…/)).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId("totale").textContent).toBe("7.900 €"), { timeout: 2000 })
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]!.body.commercial.covering).toBeNull()

    const changedAt = Date.now()
    act(() => store.getState().setFinishes({ covering: "policarbonato-alveolare" }))
    await waitFor(() => expect(screen.getByTestId("totale").textContent).toBe("12.500 €"), { timeout: 1000 })
    expect(Date.now() - changedAt).toBeLessThan(1000)
    expect(f.calls).toHaveLength(2)
    expect(f.calls[1]!.body.commercial.covering).toBe("policarbonato-alveolare")
    // la pagina non contiene il listino: nessun prezzo unitario né chiavi interne
    expect(container.innerHTML).not.toMatch(/pricePerM3|pricePerM2|€\/m/)
    expect(screen.getByText(/tra 7\.110 € e 8\.690 €|tra 11\.250 € e 13\.750 €/)).toBeTruthy()
  })

  it("modifiche rapide ⇒ una sola richiesta (debounce) e le precedenti annullate", async () => {
    const f = fakeFetch()
    const { store } = await renderSummary({ fetcher: f.fn })
    act(() => {
      store.getState().setFinishes({ covering: "telo-pvc" })
      store.getState().setFinishes({ covering: "pannello-sandwich" })
      store.getState().setFinishes({ covering: "policarbonato-alveolare" })
    })
    await waitFor(() => expect(screen.getByTestId("totale").textContent).toBe("12.500 €"), { timeout: 2000 })
    expect(f.calls.map((c) => c.body.commercial.covering)).toEqual(["policarbonato-alveolare"])
  })

  it("kernel non disponibile ⇒ il 3D resta a box e il prezzo è mostrato", async () => {
    const f = fakeFetch()
    await renderSummary({ fetcher: f.fn, kernelFactory: unavailableKernel })
    expect(await screen.findByTestId("viewer")).toBeTruthy()
    expect(screen.getByTestId("viewer").textContent).toBe("box")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mostra dettagli/ }))
    })
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/non è disponibile su questo dispositivo/))
    expect(screen.getByTestId("viewer").textContent).toBe("box")
    await waitFor(() => expect(screen.getByTestId("totale").textContent).toBe("7.900 €"))
  })

  it("preventivo incompleto ⇒ 'Prezzo su richiesta'", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ quote: { ...quote(500_000), status: "incompleto" }, notes: [] }), { status: 200 })) as unknown as typeof fetch
    await renderSummary({ fetcher: fn })
    await waitFor(() => expect(screen.getAllByText("Prezzo su richiesta").length).toBeGreaterThan(0))
  })

  it("CAP dal passo 3 ⇒ la prima stima usa già la zona di trasporto; senza CAP l'invito a indicarlo", async () => {
    const f = fakeFetch()
    const { unmount } = await renderSummary({ fetcher: f.fn, cap: "31100" })
    await waitFor(() => expect(screen.getByTestId("totale").textContent).toBe("7.900 €"), { timeout: 2000 })
    expect(f.calls).toHaveLength(1)
    expect((f.calls[0]!.body as unknown as { declared: { cap?: string } }).declared.cap).toBe("31100")
    expect(screen.getByTestId("trasporto-cap").textContent).toMatch(/CAP 31100/)
    unmount()

    const g = fakeFetch()
    await renderSummary({ fetcher: g.fn })
    await waitFor(() => expect(screen.getByTestId("totale").textContent).toBe("7.900 €"), { timeout: 2000 })
    expect((g.calls[0]!.body as unknown as { declared: { cap?: string } }).declared.cap).toBeUndefined()
    expect(screen.getByRole("link", { name: "indica il CAP del cantiere" }).getAttribute("href")).toBe("/preventivo/spazio")
  })

  it("misure finali e note semplici", async () => {
    await renderSummary({ fetcher: fakeFetch().fn })
    expect(screen.getByText("Misure finali")).toBeTruthy()
    expect(screen.getByText("Larghezza")).toBeTruthy()
    expect(screen.getByRole("img", { name: /Pianta in squadra/ })).toBeTruthy()
  })
})
