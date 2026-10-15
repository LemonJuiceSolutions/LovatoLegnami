import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SignInForm } from "./sign-in-form"

describe("SignInForm (7.4)", () => {
  it("invia email e destinazione all'azione", async () => {
    const action = vi.fn(async (_: FormData) => undefined)
    render(<SignInForm action={action} next="/configuratore?richiesta=1" />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "mario@lovato.it" } })
    fireEvent.click(screen.getByRole("button", { name: /invia il collegamento/i }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const data = action.mock.calls[0]![0]
    expect(data.get("email")).toBe("mario@lovato.it")
    expect(data.get("next")).toBe("/configuratore?richiesta=1")
  })

  it("mostra l'errore restituito dall'azione, annunciato e collegato al campo", async () => {
    render(<SignInForm action={async () => ({ ok: false, message: "Inserisci un indirizzo email valido." })} next="/dashboard" />)
    fireEvent.click(screen.getByRole("button", { name: /invia il collegamento/i }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("Inserisci un indirizzo email valido.")
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true")
  })

  it("collegamento scaduto o riusato: invito a richiederne uno nuovo", () => {
    render(<SignInForm action={async () => undefined} next="/dashboard" error="Verification" />)
    expect(screen.getByRole("alert").textContent).toMatch(/scaduto o è già stato usato\. Richiedine uno nuovo/)
  })
})
