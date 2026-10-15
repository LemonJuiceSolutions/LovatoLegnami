import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { DEFAULT_PRICE_LIST } from "@/domain/pricing/data/default-listino"
import { exportTable } from "@/domain/pricing/csv"
import type { DatasetStatusInfo } from "../types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/admin/listino/legno" }))
const { CsvTools } = await import("../listino/csv-tools")
const { DraftProvider } = await import("../draft-context")

const status: DatasetStatusInfo = { dataset: "listino", active: null, draft: { id: "d", version: 2, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-10-15T08:00:00.000Z", by: null, at: "" } }

function setup(importCsv = vi.fn(async () => ({ ok: true as const, data: status }))) {
  render(
    <DraftProvider status={status}>
      <CsvTools table="legno" priceList={DEFAULT_PRICE_LIST} importCsv={importCsv} />
    </DraftProvider>,
  )
  return importCsv
}

const upload = (text: string) => fireEvent.change(screen.getByLabelText("File CSV delle prezzi del legno"), { target: { files: [new File([text], "legno.csv", { type: "text/csv" })] } })

describe("import/export CSV del listino (9.5)", () => {
  it("riga errata ⇒ anteprima con 'riga 3: prezzo non numerico' e conferma disabilitata", async () => {
    const importCsv = setup()
    const lines = exportTable(DEFAULT_PRICE_LIST, "legno").split("\r\n")
    lines[2] = lines[2]!.replace(/;[^;]*$/, ";12a")
    upload(lines.join("\r\n"))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toMatch(/riga 3: prezzo non numerico/)
    const confirm = screen.getByRole("button", { name: "Conferma import" }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(importCsv).not.toHaveBeenCalled()
  })

  it("round-trip senza differenze ⇒ nessuna differenza e niente da confermare", async () => {
    setup()
    upload(exportTable(DEFAULT_PRICE_LIST, "legno"))
    expect((await screen.findByRole("status")).textContent).toBe("Nessuna differenza rispetto alla bozza.")
    expect(screen.getByLabelText("Riepilogo dell'import").textContent).toBe("0 aggiunte · 0 modificate · 0 rimosse")
    expect((screen.getByRole("button", { name: "Conferma import" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("prezzo cambiato ⇒ una modifica in anteprima e conferma con il CSV e il lock", async () => {
    const importCsv = setup()
    const lines = exportTable(DEFAULT_PRICE_LIST, "legno").split("\r\n")
    lines[1] = lines[1]!.replace(/;[^;]*$/, ";999,00")
    const csv = lines.join("\r\n")
    upload(csv)
    await waitFor(() => expect(screen.getByLabelText("Riepilogo dell'import").textContent).toBe("0 aggiunte · 1 modificate · 0 rimosse"))
    fireEvent.click(screen.getByRole("button", { name: "Conferma import" }))
    await waitFor(() => expect(importCsv).toHaveBeenCalledWith({ table: "legno", csv: expect.stringContaining(csv.replace(/^\uFEFF/, "")), expectedUpdatedAt: status.draft!.updatedAt }))
  })
})
