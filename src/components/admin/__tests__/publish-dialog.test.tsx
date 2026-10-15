import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { DatasetStatusInfo } from "../types"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }), usePathname: () => "/admin/listino/legno" }))
const { PublishDialog } = await import("../publish-dialog")

const status: DatasetStatusInfo = {
  dataset: "listino",
  active: { id: "a", version: 3, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-01-01T00:00:00.000Z", by: "Admin", at: "" },
  draft: { id: "d", version: 4, effectiveFrom: "2026-01-01", notes: "aumenti", updatedAt: "2026-10-15T08:00:00.000Z", by: "Mario", at: "" },
}

const preview = (blocking: string[] = []) => ({
  ok: true as const,
  data: {
    status,
    diff: [
      { path: "timber.pricePerM3.abete.lamellare", before: 65_000, after: 68_000 },
      { path: "timber.pricePerM3.larice.lamellare", before: 78_000, after: 80_000 },
      { path: "hardware.priceCents.VT-8x120", before: 120, after: 130 },
    ],
    totalDiff: 3,
    blocking,
    warnings: [],
  },
})

describe("dialogo Pubblica (9.4)", () => {
  it("elenca esattamente le tre differenze con prima/dopo e pubblica con validità e note", async () => {
    const publish = vi.fn(async () => ({ ok: true as const, data: { version: 4, archivedVersion: 3, status, warnings: [] } }))
    render(<PublishDialog status={status} open onOpenChange={() => {}} loadPreview={async () => preview()} publish={publish} />)
    const section = await screen.findByRole("region", { name: "Differenze" })
    expect(within(section).getByRole("heading").textContent).toBe("3 differenze")
    const rows = within(section).getAllByRole("row").slice(1)
    expect(rows.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent))).toEqual([
      ["timber.pricePerM3.abete.lamellare", "65000", "68000"],
      ["timber.pricePerM3.larice.lamellare", "78000", "80000"],
      ["hardware.priceCents.VT-8x120", "120", "130"],
    ])
    fireEvent.change(screen.getByLabelText("In vigore dal"), { target: { value: "2026-11-01" } })
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "listino autunno" } })
    fireEvent.click(screen.getByRole("button", { name: "Pubblica v4" }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    expect(publish).toHaveBeenCalledWith({ dataset: "listino", effectiveFrom: "2026-11-01", notes: "listino autunno", expectedUpdatedAt: status.draft!.updatedAt })
    expect((await screen.findByRole("status")).textContent).toMatch(/Pubblicata la v4; la v3 è archiviata\./)
    expect(refresh).toHaveBeenCalled()
  })

  it("prova bloccante ⇒ motivo mostrato e pulsante disabilitato", async () => {
    const publish = vi.fn()
    render(<PublishDialog status={{ ...status, dataset: "regole" }} open onOpenChange={() => {}} loadPreview={async () => preview(["tipologie non generabili: autoportante-bifalda"])} publish={publish} />)
    expect((await screen.findByRole("alert")).textContent).toMatch(/tipologie non generabili: autoportante-bifalda/)
    const button = screen.getByRole("button", { name: "Pubblica v4" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(publish).not.toHaveBeenCalled()
  })

  it("errore della pubblicazione (es. bozza cambiata) mostrato", async () => {
    render(
      <PublishDialog
        status={status}
        open
        onOpenChange={() => {}}
        loadPreview={async () => preview()}
        publish={async () => ({ ok: false, status: 409, message: "la bozza è stata modificata da Lucia" })}
      />,
    )
    await screen.findByRole("region", { name: "Differenze" })
    fireEvent.click(screen.getByRole("button", { name: "Pubblica v4" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/modificata da Lucia/)
  })
})
