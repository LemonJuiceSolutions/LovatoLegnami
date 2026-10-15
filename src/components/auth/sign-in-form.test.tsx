import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { AuthErrorAlert, PasswordSignInForm, SignInForm } from "./sign-in-form"

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

describe("PasswordSignInForm (email e password)", () => {
  it("invia email, password e destinazione all'azione", async () => {
    const action = vi.fn(async (_: FormData) => undefined)
    render(<PasswordSignInForm action={action} next="/admin" />)
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "mario@lovato.it" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "una password lunga" } })
    fireEvent.click(screen.getByRole("button", { name: "Accedi" }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const data = action.mock.calls[0]![0]
    expect(data.get("email")).toBe("mario@lovato.it")
    expect(data.get("password")).toBe("una password lunga")
    expect(data.get("next")).toBe("/admin")
  })

  it("errore generico annunciato, campi marcati e password svuotata", async () => {
    render(<PasswordSignInForm action={async () => ({ ok: false, message: "Email o password non corretti." })} next="/dashboard" />)
    const password = screen.getByLabelText("Password") as HTMLInputElement
    fireEvent.change(password, { target: { value: "sbagliata-sbagliata" } })
    fireEvent.click(screen.getByRole("button", { name: "Accedi" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Email o password non corretti.")
    expect(password.value).toBe("")
    expect(password.getAttribute("aria-invalid")).toBe("true")
    expect(password.getAttribute("autocomplete")).toBe("current-password")
  })

  it("errore di Auth.js nell'URL (accesso diretto alla callback)", () => {
    render(<AuthErrorAlert error="CredentialsSignin" />)
    expect(screen.getByRole("alert").textContent).toBe("Email o password non corretti.")
  })
})
