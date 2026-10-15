import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { DEFAULT_PRICE_LIST } from "@/domain/pricing/data/default-listino"
import { parsePriceList } from "@/domain/pricing/types"
import { ruleFires } from "@/domain/pricing/phases/complications"
import type { SiteFactors } from "@/domain/pricing/types"
import type { DatasetStatusInfo } from "../types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/admin/listino/legno" }))
const { ComplicationsForm } = await import("../listino/complications-form")
const { PriceListEditor } = await import("../listino/price-list-editor")
const { DraftProvider } = await import("../draft-context")
const { draftFromRule, ruleFromDraft, sentence } = await import("../listino/complication-rules")

// la sezione legno ha un centinaio di righe: rendering lento in jsdom sotto carico
vi.setConfig({ testTimeout: 60_000 })

const status: DatasetStatusInfo = { dataset: "listino", active: null, draft: { id: "d", version: 2, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-10-15T08:00:00.000Z", by: null, at: "" } }

const factors: SiteFactors = {
  planDeviationDeg: 0,
  wallDeviationDeg: 0,
  floorSlopePct: 0,
  floorRangeMm: 150,
  obstaclesCount: 0,
  maxHeightMm: 3000,
  clearHeightMm: 2400,
  embedmentMm: 0,
  access: "facile",
  anchoring: "terra",
}

describe("regole di complicazione a frasi (9.3)", () => {
  it("andata e ritorno regola ↔ form per le regole del seed", () => {
    for (const rule of DEFAULT_PRICE_LIST.complications) {
      const back = ruleFromDraft(draftFromRule(rule))
      expect(back).toEqual({ ok: true, rule })
    }
    expect(sentence(DEFAULT_PRICE_LIST.complications[1]!)).toBe("Se dislivello del pavimento ≥ 100 mm allora +3 ore")
  })

  it("regola composta nel form ⇒ ComplicationRule attesa, applicata a un dislivello di 150 mm", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }))
    render(<ComplicationsForm rules={[]} onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi regola" }))
    fireEvent.change(screen.getByLabelText("Fattore della condizione 1 della regola 1"), { target: { value: "floorRangeMm" } })
    fireEvent.change(screen.getByLabelText("Confronto della condizione 1 della regola 1"), { target: { value: ">=" } })
    fireEvent.change(screen.getByLabelText("Soglia della condizione 1 della regola 1"), { target: { value: "100" } })
    fireEvent.change(screen.getByLabelText("Effetto della regola 1"), { target: { value: "ore" } })
    fireEvent.change(screen.getByLabelText("Valore dell'effetto della regola 1"), { target: { value: "2" } })
    // seconda condizione: accesso medio o difficile
    fireEvent.click(screen.getByRole("button", { name: /aggiungi una condizione/ }))
    fireEvent.change(screen.getByLabelText("Fattore della condizione 2 della regola 1"), { target: { value: "access" } })
    const values = screen.getByRole("group", { name: "Valori della condizione 2 della regola 1" })
    fireEvent.click(within(values).getByLabelText("medio"))
    fireEvent.click(within(values).getByLabelText("difficile"))
    // etichetta mancante ⇒ errore e salvataggio bloccato
    expect(screen.getByRole("alert").textContent).toMatch(/etichetta per il cliente obbligatoria/)
    expect((screen.getByRole("button", { name: "Salva nella bozza" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("Etichetta per il cliente della regola 1"), { target: { value: "Pavimento non in piano" } })
    expect(screen.getByText("Se dislivello del pavimento ≥ 100 mm e accesso è medio o difficile allora +2 ore")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const expected = {
      id: "pavimento-non-in-piano",
      label: "Pavimento non in piano",
      enabled: true,
      conditions: [
        { factor: "floorRangeMm", op: ">=", value: 100 },
        { factor: "access", op: "in", value: ["medio", "difficile"] },
      ],
      effect: { kind: "ore", value: 2 },
    }
    expect(onSave).toHaveBeenCalledWith([expected])
    const [rule] = (onSave.mock.calls[0] as unknown as [Parameters<typeof ruleFires>[0][]])[0]
    expect(ruleFires(rule!, { ...factors, access: "medio" })).toBe(true)
    expect(ruleFires(rule!, factors)).toBe(false)
    // il listino con la regola è valido
    expect(() => parsePriceList({ ...DEFAULT_PRICE_LIST, complications: [expected] })).not.toThrow()
  })

  it("ordine, disattivazione e importo fisso in euro → centesimi", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }))
    const [a, b] = DEFAULT_PRICE_LIST.complications
    render(<ComplicationsForm rules={[a!, b!]} onSave={onSave} />)
    fireEvent.click(screen.getByRole("button", { name: "Sposta giù la regola 1" }))
    fireEvent.click(screen.getByRole("switch", { name: "Regola 1 attiva" }))
    fireEvent.change(screen.getByLabelText("Effetto della regola 2"), { target: { value: "fisso" } })
    fireEvent.change(screen.getByLabelText("Valore dell'effetto della regola 2"), { target: { value: "150,50" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = (onSave.mock.calls[0] as unknown as [{ id: string; enabled: boolean; effect: unknown }[]])[0]
    expect(saved.map((r) => [r.id, r.enabled])).toEqual([
      [b!.id, false],
      [a!.id, true],
    ])
    expect(saved[1]!.effect).toEqual({ kind: "fisso", value: 15_050 })
  })
})

describe("form del listino (9.3)", () => {
  it("lunghezze commerciali: aggiunta della barra 8 000 per 120×240 e salvataggio raggruppato per sezione", async () => {
    const saveAction = vi.fn(async () => ({ ok: true as const, data: status }))
    render(
      <DraftProvider status={status} saveAction={saveAction}>
        <PriceListEditor section="legno" priceList={DEFAULT_PRICE_LIST} canCommercial={false} canTechnical />
      </DraftProvider>,
    )
    // il tecnico non modifica i prezzi
    expect((within(screen.getByRole("table", { name: "Prezzi del legno al m³" })).getByLabelText("Prezzo riga 1") as HTMLInputElement).disabled).toBe(true)
    const table = screen.getByRole("table", { name: "Lunghezze commerciali" })
    const before = within(table).getAllByRole("row").length
    const container = table.closest("div.rounded-md") as HTMLElement
    fireEvent.click(within(container).getByRole("button", { name: "Aggiungi riga" }))
    const n = before // righe dati = righe totali − intestazione + la nuova
    fireEvent.change(within(table).getByLabelText(`Sezione riga ${n}`), { target: { value: "120×240" } })
    fireEvent.change(within(table).getByLabelText(`Lunghezza riga ${n}`), { target: { value: "8000" } })
    fireEvent.change(within(table).getByLabelText(`Prezzo barra riga ${n}`), { target: { value: "190" } })
    fireEvent.click(within(container).getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    const call = (saveAction.mock.calls[0] as unknown as [{ changes: { path: string; value: Record<string, { length: number; priceCents?: number }[]> }[] }])[0]
    expect(call.changes[0]!.path).toBe("timber.stockLengths")
    expect(call.changes[0]!.value["120×240"]).toEqual([{ length: 4000 }, { length: 5000 }, { length: 6000 }, { length: 8000, priceCents: 19_000 }, { length: 13_500, qualities: ["lamellare"] }])
    expect(() => parsePriceList({ ...DEFAULT_PRICE_LIST, timber: { ...DEFAULT_PRICE_LIST.timber, stockLengths: call.changes[0]!.value } })).not.toThrow()
  })

  it("parametri: percentuale non valida segnalata, valori in un solo salvataggio", async () => {
    const saveAction = vi.fn(async () => ({ ok: true as const, data: status }))
    render(
      <DraftProvider status={status} saveAction={saveAction}>
        <PriceListEditor section="margini" priceList={DEFAULT_PRICE_LIST} canCommercial canTechnical={false} />
      </DraftProvider>,
    )
    const form = screen.getByRole("form", { name: "Margini, minimo e arrotondamento" })
    fireEvent.change(within(form).getByLabelText(/Fascia di indicatività/), { target: { value: "abc" } })
    expect(within(form).getByRole("alert").textContent).toBe("inserire un numero tra 0 e 100")
    fireEvent.change(within(form).getByLabelText(/Fascia di indicatività/), { target: { value: "12" } })
    fireEvent.change(within(form).getByLabelText(/Margine sulla manodopera/), { target: { value: "31,5" } })
    fireEvent.click(within(form).getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    expect(saveAction.mock.calls[0]).toEqual([
      {
        dataset: "listino",
        changes: [
          { path: "margins.labourPct", value: 31.5 },
          { path: "indicativityPct", value: 12 },
        ],
        expectedUpdatedAt: status.draft!.updatedAt,
      },
    ])
  })
})
