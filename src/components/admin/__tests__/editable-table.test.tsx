import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { DatasetStatusInfo } from "../types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/admin" }))
const { EditableTable } = await import("../editable-table")
const { DraftProvider } = await import("../draft-context")
const { SectionTable } = await import("../section-table")
const { parseCell, formatCell } = await import("../cells")

type Row = { id: string; label: string; pct: number; price: number }
const columns = [
  { key: "id", header: "Codice", kind: "text" },
  { key: "label", header: "Descrizione", kind: "text" },
  { key: "pct", header: "Recupero", kind: "number", unit: "%", min: 0, max: 100 },
  { key: "price", header: "Prezzo", kind: "money", unit: "€/m²", min: 0 },
] as const
const rows: Row[] = [{ id: "impregnante", label: "Impregnante", pct: 30, price: 850 }]

const status: DatasetStatusInfo = {
  dataset: "listino",
  active: { id: "a", version: 1, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-01-01T00:00:00.000Z", by: null, at: "" },
  draft: { id: "d", version: 2, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-10-15T08:00:00.000Z", by: "Mario", at: "" },
}

describe("celle (9.2)", () => {
  it("numeri con la virgola, importi in centesimi, messaggi in italiano", () => {
    expect(parseCell({ kind: "number", min: 0, max: 100 }, "12,5")).toEqual({ ok: true, value: 12.5 })
    expect(parseCell({ kind: "number", min: 0, max: 100 }, "abc")).toEqual({ ok: false, error: "inserire un numero tra 0 e 100" })
    expect(parseCell({ kind: "number", min: 0, max: 100 }, "120")).toEqual({ ok: false, error: "inserire un numero tra 0 e 100" })
    expect(parseCell({ kind: "number", min: 1, integer: true }, "1,5")).toEqual({ ok: false, error: "inserire un numero intero maggiore o uguale a 1" })
    expect(parseCell({ kind: "money", min: 0 }, "1.234,50")).toEqual({ ok: true, value: 123_450 })
    expect(parseCell({ kind: "money", min: 0 }, "1,234")).toEqual({ ok: false, error: "inserire un importo con al massimo due decimali" })
    expect(parseCell({ kind: "number", optional: true }, "")).toEqual({ ok: true, value: undefined })
    expect(parseCell({ kind: "text" }, "  ")).toEqual({ ok: false, error: "campo obbligatorio" })
    expect(formatCell({ kind: "money" }, 65_000)).toBe("650,00")
    expect(formatCell({ kind: "number" }, 0.5)).toBe("0,5")
  })
})

describe("EditableTable (9.2)", () => {
  it("'abc' in una percentuale ⇒ 'inserire un numero tra 0 e 100' annunciato e nessun salvataggio", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }))
    render(<EditableTable<Row> label="Trattamenti" columns={columns} rows={rows} onSave={onSave} newRow={() => ({ id: "", label: "", pct: 0, price: 0 })} />)
    const cell = screen.getByLabelText("Recupero riga 1")
    fireEvent.change(cell, { target: { value: "abc" } })
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe("inserire un numero tra 0 e 100")
    expect(cell.getAttribute("aria-invalid")).toBe("true")
    expect(cell.getAttribute("aria-describedby")).toBe(alert.id)
    const save = screen.getByRole("button", { name: "Salva nella bozza" })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
    // correzione ⇒ errore sparito e salvataggio con il valore numerico
    fireEvent.change(cell, { target: { value: "12,5" } })
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(save)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ ...rows[0], pct: 12.5 }]))
    expect(await screen.findByRole("status")).toBeTruthy()
  })

  it("frecce su/giù tra le righe nella stessa colonna", () => {
    render(<EditableTable<Row> label="T" columns={columns} rows={[...rows, { id: "vernice", label: "Vernice", pct: 0, price: 1 }]} onSave={async () => ({ ok: true })} />)
    const first = screen.getByLabelText("Prezzo riga 1")
    first.focus()
    fireEvent.keyDown(first, { key: "ArrowDown" })
    expect(document.activeElement).toBe(screen.getByLabelText("Prezzo riga 2"))
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" })
    expect(document.activeElement).toBe(first)
  })

  it("ricerca: filtra le righe", () => {
    render(<EditableTable<Row> label="T" searchable columns={columns} rows={[...rows, { id: "vernice", label: "Vernice", pct: 0, price: 1 }]} onSave={async () => ({ ok: true })} />)
    fireEvent.change(screen.getByLabelText("Cerca in T"), { target: { value: "vern" } })
    expect(screen.queryByDisplayValue("impregnante")).toBeNull()
    expect(screen.getByDisplayValue("vernice")).toBeTruthy()
  })

  it("aggiunta riga e salvataggio chiamano l'action con il percorso giusto e il lock della bozza", async () => {
    const saveAction = vi.fn(async () => ({ ok: true as const, data: status }))
    render(
      <DraftProvider status={status} saveAction={saveAction}>
        <SectionTable<Row>
          label="Trattamenti"
          path="treatments"
          columns={columns}
          rows={rows}
          newRow={() => ({ id: "", label: "", pct: 0, price: 0 })}
          toValue={(rs) => rs.map(({ id, label, price }) => ({ id, label, pricePerM2Cents: price }))}
        />
      </DraftProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi riga" }))
    // riga nuova: campi obbligatori vuoti segnalati, salvataggio bloccato
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["campo obbligatorio", "campo obbligatorio"])
    fireEvent.change(screen.getByLabelText("Codice riga 2"), { target: { value: "olio" } })
    fireEvent.change(screen.getByLabelText("Descrizione riga 2"), { target: { value: "Olio di lino" } })
    fireEvent.change(screen.getByLabelText("Prezzo riga 2"), { target: { value: "9,90" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    expect(saveAction).toHaveBeenCalledWith({
      dataset: "listino",
      path: "treatments",
      value: [
        { id: "impregnante", label: "Impregnante", pricePerM2Cents: 850 },
        { id: "olio", label: "Olio di lino", pricePerM2Cents: 990 },
      ],
      expectedUpdatedAt: "2026-10-15T08:00:00.000Z",
    })
  })

  it("errore del server mostrato come avviso", async () => {
    render(
      <DraftProvider status={status} saveAction={async () => ({ ok: false, status: 409, message: "la bozza è stata modificata da Lucia" })}>
        <SectionTable<Row> label="T" path="treatments" columns={columns} rows={rows} toValue={(r) => r} />
      </DraftProvider>,
    )
    fireEvent.change(screen.getByLabelText("Prezzo riga 1"), { target: { value: "10" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva nella bozza" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/modificata da Lucia/)
  })
})
