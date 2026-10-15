import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PRIVACY_NOTICE_VERSION } from "@/server/consent"
import { axeViolations } from "@/test/axe"
import { companyInfo } from "./company"
import { ContactForm } from "./contact-form"
import type { ContactResult } from "./contact-validation"
import { PrivacyNotice, versionDate } from "./privacy-notice"

function fill(values: Partial<Record<"name" | "email" | "phone" | "message", string>>, consent = true) {
  if (values.name !== undefined) fireEvent.change(screen.getByLabelText("Nome e cognome"), { target: { value: values.name } })
  if (values.email !== undefined) fireEvent.change(screen.getByLabelText("Email"), { target: { value: values.email } })
  if (values.phone !== undefined) fireEvent.change(screen.getByLabelText(/Telefono/), { target: { value: values.phone } })
  if (values.message !== undefined) fireEvent.change(screen.getByLabelText("Messaggio"), { target: { value: values.message } })
  if (consent) fireEvent.click(screen.getByRole("checkbox"))
}

describe("form Contatti (11.4)", () => {
  it("valida nel browser: errori sui campi e nessun invio", () => {
    const action = vi.fn<(fd: FormData) => Promise<ContactResult>>()
    render(<ContactForm action={action} privacyVersion="2026-10" />)
    fill({ name: "M", email: "non-una-email", message: "ciao" }, false)
    fireEvent.click(screen.getByRole("button", { name: "Invia il messaggio" }))
    expect(action).not.toHaveBeenCalled()
    expect(screen.getByText("Scrivi il tuo nome.")).toBeTruthy()
    expect(screen.getByText(/Controlla l'indirizzo email/)).toBeTruthy()
    expect(screen.getByText("Scrivi qualche parola in più sulla tua richiesta.")).toBeTruthy()
    expect(screen.getByText(/devi accettare l'informativa/)).toBeTruthy()
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toBe("Controlla i campi evidenziati.")
    expect(document.activeElement).toBe(screen.getByLabelText("Nome e cognome"))
  })

  it("invia i dati con versione dell'informativa, campo trappola e istante di apertura", async () => {
    const action = vi.fn(async (_fd: FormData): Promise<ContactResult> => ({ ok: true }))
    render(<ContactForm action={action} privacyVersion="2026-10" />)
    fill({ name: "Maria Rossi", email: "Maria@Example.it", phone: "+39 333 1234567", message: "Vorrei una pergola addossata di 4 × 3 m." })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Invia il messaggio" }))
    })
    expect(action).toHaveBeenCalledTimes(1)
    const fd = action.mock.calls[0][0]
    expect(fd.get("name")).toBe("Maria Rossi")
    expect(fd.get("consent")).toBe("on")
    expect(fd.get("privacyVersion")).toBe("2026-10")
    expect(fd.get("website")).toBe("")
    expect(Number(fd.get("startedAt"))).toBeGreaterThan(0)
    expect(screen.getByRole("status").textContent).toContain("maria@example.it")
  })

  it("mostra l'errore del server sul campo", async () => {
    const action = vi.fn(async (): Promise<ContactResult> => ({ ok: false, message: "Controlla i campi evidenziati.", fieldErrors: { email: "Indirizzo rifiutato." } }))
    render(<ContactForm action={action} privacyVersion="2026-10" />)
    fill({ name: "Maria Rossi", email: "maria@example.it", message: "Vorrei una pergola addossata." })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Invia il messaggio" }))
    })
    expect(screen.getByText("Indirizzo rifiutato.")).toBeTruthy()
  })

  it("nessuna violazione WCAG A/AA", async () => {
    const { container } = render(
      <main>
        <ContactForm action={async () => ({ ok: true })} privacyVersion="2026-10" />
      </main>,
    )
    expect(await axeViolations(container)).toEqual([])
  })
})

describe("informativa privacy (11.4)", () => {
  it("espone la versione del consenso del server e la data", () => {
    render(<PrivacyNotice version={PRIVACY_NOTICE_VERSION} company={companyInfo({})} />)
    expect(screen.getByTestId("versione-informativa").textContent).toBe(`Versione ${PRIVACY_NOTICE_VERSION}, aggiornata a ${versionDate(PRIVACY_NOTICE_VERSION)}.`)
    expect(versionDate("2026-10")).toBe("ottobre 2026")
    expect(screen.getByText(/Lovato Alessandro S\.r\.l\./)).toBeTruthy()
  })
})
