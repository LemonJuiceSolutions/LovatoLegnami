import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("next/navigation", () => ({ usePathname: () => "/configuratore" }))
const { NavHeader } = await import("./nav-header")

describe("NavHeader (7.4)", () => {
  it("mostra nome e ruolo e il pulsante Esci", async () => {
    const onSignOut = vi.fn(async () => undefined)
    render(<NavHeader user={{ name: "Lucia Bianchi", email: "lucia@lovato.it", role: "ufficio-tecnico" }} onSignOut={onSignOut} />)
    expect(screen.getByText("Lucia Bianchi")).toBeTruthy()
    expect(screen.getByText("ufficio tecnico")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Esci" }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalled())
  })

  it("senza utente niente pulsante Esci", () => {
    render(<NavHeader />)
    expect(screen.queryByRole("button", { name: "Esci" })).toBeNull()
  })
})
