import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { formatEuro } from "@/domain"
import { DEFAULT_CATALOG } from "@/stores/catalog"
import { configuratoreStore } from "@/stores/use-configuratore"
import { parseEuroInput } from "./final-quote-helpers"
import { RequestHeader, RequestNotice, type RequestHeaderData, type SaveFinalQuote } from "./request-header"

const state = () => configuratoreStore.getState()
const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ")

const request: RequestHeaderData = {
  id: "lead-1",
  code: "PRV-2026-00042",
  customer: { name: "Giulia Verdi", email: "giulia@example.com", phone: null, comune: "Pescantina" },
  status: "nuovo",
  adminUrl: "/admin/richieste/lead-1",
  latestQuote: { kind: "indicativo", totalCents: 470_000, createdAt: "2026-10-01T10:00:00.000Z" },
}

describe("RequestHeader (10.4)", () => {
  beforeEach(() => {
    state().setCatalog(DEFAULT_CATALOG)
    state().resetConfig("addossata-monofalda")
  })

  it("intestazione: codice, cliente, stato, ultimo preventivo e link all'admin", () => {
    render(<RequestHeader request={request} canSave />)
    const header = screen.getByTestId("request-header")
    expect(header.textContent).toContain("PRV-2026-00042")
    expect(header.textContent).toContain("Giulia Verdi")
    expect(screen.getByTestId("request-status").textContent).toBe("Nuova")
    expect(norm(header.textContent)).toContain("Ultimo preventivo indicativo: 4.700,00 €")
    expect(screen.getByRole("link", { name: /Richiesta nell'admin/ }).getAttribute("href")).toBe("/admin/richieste/lead-1")
  })

  it("senza permesso il pulsante è disabilitato", () => {
    render(<RequestHeader request={request} canSave={false} />)
    expect((screen.getByRole("button", { name: /Salva preventivo definitivo/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("dialogo: voce manuale nell'anteprima cliente e salvataggio con righe, IVA e stato", async () => {
    const save = vi.fn<SaveFinalQuote>(async () => ({ ok: true, data: { quoteId: "q2", totalCents: 999_000, status: "preventivo-inviato", emailQueued: false } }))
    render(<RequestHeader request={request} canSave save={save} />)
    fireEvent.click(screen.getByRole("button", { name: /Salva preventivo definitivo/ }))
    const dialog = screen.getByRole("dialog")
    const total = () => norm(within(dialog).getByTestId("customer-total").textContent)
    const before = total()
    // senza voci né sconto l'anteprima coincide con il preventivo del pannello
    expect(before).toBe(norm(formatEuro(state().derived.customerQuote!.totalCents)))

    fireEvent.click(within(dialog).getByRole("button", { name: /Aggiungi voce/ }))
    fireEvent.change(within(dialog).getByLabelText("Descrizione"), { target: { value: "Smontaggio vecchia tettoia" } })
    fireEvent.change(within(dialog).getByLabelText(/Importo/), { target: { value: "500" } })
    expect(within(dialog).getByText("Altre voci")).toBeTruthy()
    expect(total()).not.toBe(before)

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Segna la richiesta come preventivo inviato" }))
    await act(async () => {
      fireEvent.click(within(dialog).getAllByRole("button", { name: "Salva preventivo definitivo" }).at(-1)!)
    })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const input = save.mock.calls[0][0]
    expect(input).toMatchObject({
      leadId: "lead-1",
      manualLines: [{ description: "Smontaggio vecchia tettoia", amountCents: 50_000 }],
      vat: "ordinaria",
      discount: null,
      markSent: true,
      sendEmail: false,
    })
    expect((input.config as { typology: string }).typology).toBe("addossata-monofalda")
    await waitFor(() => expect(screen.getByTestId("request-status").textContent).toBe("Preventivo inviato"))
    expect(norm(screen.getByTestId("request-header").textContent)).toContain("Ultimo preventivo definitivo: 9.990,00 €")
  })

  it("errore del server mostrato nel dialogo", async () => {
    const save = vi.fn<SaveFinalQuote>(async () => ({ ok: false, status: 409, message: "nessun listino attivo" }))
    render(<RequestHeader request={request} canSave save={save} />)
    fireEvent.click(screen.getByRole("button", { name: /Salva preventivo definitivo/ }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Salva preventivo definitivo" }).at(-1)!)
    })
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("nessun listino attivo"))
  })

  it("richiesta inesistente: avviso", () => {
    render(<RequestNotice message='La richiesta "x" non esiste: configurazione predefinita.' />)
    expect(screen.getByTestId("request-missing").textContent).toMatch(/non esiste: configurazione predefinita/)
  })
})

describe("parseEuroInput", () => {
  it("formati italiani e non validi", () => {
    expect(parseEuroInput("500")).toBe(50_000)
    expect(parseEuroInput("1.234,50")).toBe(123_450)
    expect(parseEuroInput("1.500")).toBe(150_000)
    expect(parseEuroInput("-20,5")).toBe(-2_050)
    expect(parseEuroInput("12.5")).toBe(1_250)
    expect(parseEuroInput("€ 99")).toBe(9_900)
    expect(parseEuroInput("abc")).toBeUndefined()
    expect(parseEuroInput("1,234")).toBeUndefined()
  })
})
