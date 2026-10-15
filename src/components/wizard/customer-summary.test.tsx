import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import type { CustomerSummary } from "@/server/quotes/customer-summary"
import { CustomerSummaryView } from "./customer-summary"

const summary: CustomerSummary = {
  code: "PRV-2026-00042",
  createdAt: "2026-10-15T08:00:00.000Z",
  kind: "indicativo",
  firstName: "Maria",
  typologyTitle: "Pergola bifalda",
  measures: [
    { label: "Larghezza", cm: 500 },
    { label: "Profondità", cm: 400 },
  ],
  outOfSquareDeg: 2,
  quote: {
    status: "completo",
    priceList: { version: 1, effectiveFrom: "2026-01-01" },
    groups: [{ id: "struttura", label: "Struttura in legno", amountCents: 790_000 }],
    discountCents: 0,
    minimumAdjustmentCents: 0,
    taxableCents: 647_541,
    vatPct: 22,
    vatCents: 142_459,
    roundingCents: 0,
    totalCents: 790_000,
    range: { pct: 10, minCents: 711_000, maxCents: 869_000 },
    notes: ["Prezzo indicativo (±10%), soggetto a sopralluogo."],
  } as CustomerSummary["quote"],
  notes: ["Muro fuori squadra di circa 2°: ne teniamo conto nel progetto e nel prezzo."],
  pdfUrl: "/api/preventivo/tok/pdf",
  expiresAt: "2027-01-13T08:00:00.000Z",
}

describe("pagina del cliente /p/[token] (12.8)", () => {
  it("riepilogo con prezzo, misure, note e download del PDF", async () => {
    const { container } = render(<CustomerSummaryView summary={summary} phone="045 6700620" email="info@lovatosrl.it" />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Maria, ecco la tua Pergola bifalda/)
    expect(screen.getAllByText("7.900 €").length).toBeGreaterThan(0)
    expect(screen.getByText(/tra 7\.110 € e 8\.690 €/)).toBeTruthy()
    expect(screen.getByRole("link", { name: /Scarica il PDF/ }).getAttribute("href")).toBe("/api/preventivo/tok/pdf")
    expect(screen.getAllByText(/PRV-2026-00042/).length).toBe(2)
    expect(await axeViolations(container)).toEqual([])
  })

  it("collegamento scaduto ⇒ invito a contattare l'ufficio, nessun preventivo", () => {
    render(<CustomerSummaryView summary={null} phone="045 6700620" email="info@lovatosrl.it" />)
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/scaduto/)
    expect(screen.getByRole("link", { name: /Chiama 045 6700620/ }).getAttribute("href")).toBe("tel:0456700620")
    expect(screen.queryByText(/€/)).toBeNull()
  })
})
