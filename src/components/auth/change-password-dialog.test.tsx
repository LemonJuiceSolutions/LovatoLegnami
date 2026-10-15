import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ChangePasswordDialog } from "./change-password-dialog"

const open = () => fireEvent.click(screen.getByRole("button", { name: "Cambia password" }))
const fill = (current: string, next: string, confirm = next) => {
  fireEvent.change(screen.getByLabelText("Password attuale"), { target: { value: current } })
  fireEvent.change(screen.getByLabelText("Nuova password"), { target: { value: next } })
  fireEvent.change(screen.getByLabelText("Conferma la nuova password"), { target: { value: confirm } })
  fireEvent.click(screen.getByRole("button", { name: "Salva la password" }))
}

describe("ChangePasswordDialog", () => {
  it("controlli immediati: lunghezza minima e conferma", async () => {
    const action = vi.fn(async () => ({ ok: true as const, data: null }))
    render(<ChangePasswordDialog action={action} />)
    open()
    fill("vecchia", "corta")
    expect((await screen.findByRole("alert")).textContent).toMatch(/almeno 12/)
    fill("vecchia", "nuova password lunga", "diversa password lunga")
    expect((await screen.findByRole("alert")).textContent).toMatch(/non coincidono/)
    expect(action).not.toHaveBeenCalled()
  })

  it("invia attuale e nuova; mostra l'esito o l'errore del server", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400, message: "La password attuale non è corretta." })
      .mockResolvedValueOnce({ ok: true, data: null })
    render(<ChangePasswordDialog action={action} />)
    open()
    fill("sbagliata", "nuova password lunga")
    expect((await screen.findByRole("alert")).textContent).toBe("La password attuale non è corretta.")
    fill("giusta", "nuova password lunga")
    await waitFor(() => expect(action).toHaveBeenLastCalledWith({ current: "giusta", next: "nuova password lunga" }))
    expect((await screen.findByRole("status")).textContent).toMatch(/Password aggiornata/)
  })
})
