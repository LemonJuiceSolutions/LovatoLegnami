import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { DatasetStatusInfo } from "../types"

const push = vi.fn()
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/listino/legno", useRouter: () => ({ push, refresh: vi.fn() }) }))
const { AdminOverview } = await import("../admin-overview")
const { AdminSubnav } = await import("../admin-subnav")
const { Sidebar } = await import("@/components/layout/sidebar")

const active = { id: "a", version: 3, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-01-01T00:00:00.000Z", by: "Admin", at: "01/01/2026, 01:00" }
const status = (dataset: DatasetStatusInfo["dataset"], draft = false): DatasetStatusInfo => ({
  dataset,
  active,
  draft: draft ? { id: "d", version: 4, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-10-15T08:32:00.000Z", by: "Lucia Bianchi", at: "15/10/2026, 10:32" } : null,
})

describe("riepilogo admin (9.1)", () => {
  it("bozza presente ⇒ 'Bozza v4 – modificata da … il …' e pulsante Pubblica", () => {
    const onPublish = vi.fn()
    render(<AdminOverview user={{ role: "admin" }} datasets={[status("listino", true), status("regole")]} newLeads={2} onPublish={onPublish} />)
    const listino = screen.getByRole("region", { name: "Stato Listino" })
    expect(within(listino).getByText("Bozza v4 – modificata da Lucia Bianchi il 15/10/2026, 10:32")).toBeTruthy()
    expect(within(listino).getByText(/Attiva v3 – in vigore dal 2026-01-01/)).toBeTruthy()
    fireEvent.click(within(listino).getByRole("button", { name: "Pubblica" }))
    expect(onPublish).toHaveBeenCalledWith("listino")
    // senza bozza niente pulsante
    const regole = screen.getByRole("region", { name: "Stato Regole costruttive" })
    expect(within(regole).queryByRole("button", { name: "Pubblica" })).toBeNull()
    expect(screen.getByText("2 richieste nuove da prendere in carico")).toBeTruthy()
  })

  it("senza permesso di pubblicazione il pulsante non compare", () => {
    render(<AdminOverview user={{ role: "commerciale" }} datasets={[status("regole", true)]} newLeads={0} />)
    expect(screen.getByText(/Bozza v4/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Pubblica" })).toBeNull()
  })

  it("sotto-navigazione: solo le sezioni del ruolo", () => {
    render(<AdminSubnav user={{ role: "commerciale" }} />)
    const nav = screen.getByRole("navigation", { name: "Sezioni admin" })
    const labels = within(nav).getAllByRole("link").map((a) => a.textContent)
    expect(labels).toEqual(["Riepilogo", "Listino", "Richieste", "Registro", "Simula"])
    expect(within(nav).getByRole("link", { name: "Listino" }).getAttribute("aria-current")).toBe("page")
  })

  it("sidebar: voce ADMIN solo a un utente abilitato", () => {
    const { unmount } = render(<Sidebar />)
    expect(screen.queryByRole("link", { name: /ADMIN/ })).toBeNull()
    unmount()
    const second = render(<Sidebar user={{ role: "commerciale", active: false }} />)
    expect(screen.queryByRole("link", { name: /ADMIN/ })).toBeNull()
    second.unmount()
    render(<Sidebar user={{ role: "ufficio-tecnico" }} />)
    expect(screen.getByRole("link", { name: /ADMIN/ }).getAttribute("href")).toBe("/admin")
  })
})

