import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/admin/registro" }))
const { UsersAdmin } = await import("../utenti/users-admin")
const { AuditLog } = await import("../registro/audit-log")
const { AdminSubnav } = await import("../admin-subnav")

describe("utenti (9.10)", () => {
  it("per un commerciale la sezione Utenti non è raggiungibile dalla navigazione", () => {
    render(<AdminSubnav user={{ role: "commerciale" }} />)
    expect(screen.queryByRole("link", { name: "Utenti" })).toBeNull()
  })

  it("crea, cambia ruolo, disattiva e mostra gli errori del server", async () => {
    const actions = {
      create: vi.fn(async () => ({ ok: true as const, data: {} })),
      setRole: vi.fn(async () => ({ ok: false as const, status: 409 as const, message: "deve restare almeno un amministratore attivo" })),
      setActive: vi.fn(async () => ({ ok: true as const, data: {} })),
    }
    render(
      <UsersAdmin
        currentUserId="u1"
        actions={actions}
        users={[
          { id: "u1", email: "admin@lovato.it", name: "Admin", role: "admin", active: true, createdAt: "" },
          { id: "u2", email: "mario@lovato.it", name: "Mario", role: "commerciale", active: true, createdAt: "" },
        ]}
      />,
    )
    const form = screen.getByRole("form", { name: "Nuovo utente" })
    fireEvent.change(within(form).getByLabelText("Email"), { target: { value: "lucia@lovato.it" } })
    fireEvent.change(within(form).getByLabelText("Ruolo"), { target: { value: "ufficio-tecnico" } })
    fireEvent.click(within(form).getByRole("button", { name: "Crea utente" }))
    await waitFor(() => expect(actions.create).toHaveBeenCalledWith({ email: "lucia@lovato.it", name: null, role: "ufficio-tecnico" }))
    fireEvent.click(screen.getByRole("switch", { name: "mario@lovato.it attivo" }))
    await waitFor(() => expect(actions.setActive).toHaveBeenCalledWith("u2", false))
    fireEvent.change(screen.getByLabelText("Ruolo di admin@lovato.it"), { target: { value: "commerciale" } })
    expect((await screen.findByRole("alert")).textContent).toMatch(/almeno un amministratore attivo/)
  })
})

describe("registro (9.10)", () => {
  const entry = {
    id: 7,
    at: "15/10/2026, 10:32",
    user: "Mario Rossi",
    dataset: "listino" as const,
    entity: "dataset_version",
    entityId: "v2",
    action: "salva",
    diff: [{ path: "timber.pricePerM3.abete.lamellare", before: 65_000, after: 68_000 }],
  }

  it("mostra la voce del cambio prezzo con utente, data e differenza espandibile", () => {
    render(<AuditLog entries={[entry]} users={[{ id: "m", label: "Mario Rossi" }]} dataset="" userId="" />)
    const item = within(screen.getByRole("list", { name: "Voci del registro" })).getByRole("listitem")
    expect(item.querySelector("summary")!.textContent).toBe("15/10/2026, 10:32 · Mario Rossi · salvataggio · Listino · 1 campo")
    fireEvent.click(item.querySelector("summary")!)
    const cells = [...item.querySelectorAll("tbody td")].map((td) => td.textContent)
    expect(cells).toEqual(["timber.pricePerM3.abete.lamellare", "65000", "68000"])
    // sola lettura: nessun comando di modifica
    expect(within(item).queryByRole("button")).toBeNull()
  })

  it("filtri per insieme di dati e utente nell'indirizzo", () => {
    const onNavigate = vi.fn()
    render(<AuditLog entries={[]} users={[{ id: "m", label: "Mario Rossi" }]} dataset="" userId="" onNavigate={onNavigate} />)
    fireEvent.change(screen.getByLabelText("Insieme di dati"), { target: { value: "listino" } })
    expect(onNavigate).toHaveBeenLastCalledWith("/admin/registro?dataset=listino")
    fireEvent.change(screen.getByLabelText("Utente"), { target: { value: "m" } })
    expect(onNavigate).toHaveBeenLastCalledWith("/admin/registro?utente=m")
  })
})
