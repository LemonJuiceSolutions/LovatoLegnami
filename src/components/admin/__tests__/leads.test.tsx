import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { LeadDetailView, LeadRowView } from "../richieste/types"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }), usePathname: () => "/admin/richieste" }))
const { LeadsList } = await import("../richieste/leads-list")
const { LeadDetail } = await import("../richieste/lead-detail")

const row = (code: string, status: LeadRowView["status"]): LeadRowView => ({
  id: code,
  code,
  createdAt: "15/10/2026, 10:32",
  customer: "Anna Verdi",
  typology: "Pergola bifalda",
  dimensions: "4,00 × 5,00 m",
  totalCents: 647_000,
  status,
  assignee: null,
  anonymized: false,
})

describe("elenco richieste (9.9)", () => {
  it("filtro per stato 'nuovo' ⇒ indirizzo con ?status=nuovo; la tabella mostra le righe ricevute", () => {
    const onNavigate = vi.fn()
    render(<LeadsList items={[row("PRV-2026-00001", "nuovo")]} total={1} page={1} pageSize={25} status="" q="" onNavigate={onNavigate} />)
    fireEvent.change(screen.getByLabelText("Stato"), { target: { value: "nuovo" } })
    expect(onNavigate).toHaveBeenCalledWith("/admin/richieste?status=nuovo")
    const table = screen.getByRole("table", { name: "Richieste" })
    const cells = within(table).getAllByRole("row")[1]!.querySelectorAll("td")
    expect([...cells].map((c) => c.textContent?.replace(/\u00a0/g, " "))).toEqual(["15/10/2026, 10:32", "PRV-2026-00001", "Anna Verdi", "Pergola bifalda", "4,00 × 5,00 m", "6.470,00 €", "nuovo", "—"])
  })

  it("ricerca e paginazione conservano il filtro", () => {
    const onNavigate = vi.fn()
    render(<LeadsList items={[row("A", "nuovo")]} total={60} page={1} pageSize={25} status="nuovo" q="" onNavigate={onNavigate} />)
    fireEvent.change(screen.getByLabelText("Cerca"), { target: { value: "verdi" } })
    fireEvent.click(screen.getByRole("button", { name: "Cerca" }))
    expect(onNavigate).toHaveBeenLastCalledWith("/admin/richieste?status=nuovo&q=verdi")
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }))
    expect(onNavigate).toHaveBeenLastCalledWith("/admin/richieste?status=nuovo&page=2")
    expect(screen.getByText("Pagina 1 di 3")).toBeTruthy()
  })
})

const detail: LeadDetailView = {
  id: "lead-1",
  code: "PRV-2026-00001",
  status: "nuovo",
  createdAt: "15/10/2026, 10:32",
  anonymized: false,
  assignee: null,
  assigneeId: null,
  customer: [
    { label: "Nome", value: "Anna Verdi" },
    { label: "Email", value: "anna@example.it" },
  ],
  consent: "informativa 2026-10",
  notes: "<script>alert(1)</script>",
  photos: [{ id: "a".repeat(32), kind: "foto" }],
  config: { typology: "Pergola bifalda (autoportante-bifalda)", params: [{ name: "larghezza", value: "4000" }], envelope: "5,00 × 6,00 × 3,50 m" },
  quoteKind: "indicativo",
  office: null,
  customerQuote: null,
  events: [{ at: "15/10/2026, 10:32", by: null, from: null, to: "nuovo", note: null }],
  emails: [],
}

const actions = () => ({
  take: vi.fn(async () => ({ ok: true as const, data: {} })),
  changeStatus: vi.fn(async () => ({ ok: true as const, data: {} })),
  resend: vi.fn(async () => ({ ok: true as const, data: { sent: 2, failed: 0 } })),
  anonymize: vi.fn(async () => ({ ok: true as const, data: { removedPhotos: 1 } })),
})

describe("dettaglio richiesta (9.9)", () => {
  it("azioni: prendi in carico, reinvia email; anonimizza solo dopo conferma; testo del cliente non interpretato", async () => {
    const a = actions()
    render(<LeadDetail lead={detail} canManage canErase currentUserId="u1" actions={a} />)
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Apri nel configuratore" }).getAttribute("href")).toBe("/configuratore?richiesta=lead-1")
    expect(screen.getByRole("link", { name: "Scarica PDF" }).getAttribute("href")).toBe("/api/admin/richieste/lead-1/pdf")
    fireEvent.click(screen.getByRole("button", { name: "Prendi in carico" }))
    await waitFor(() => expect(a.take).toHaveBeenCalledWith("lead-1"))
    fireEvent.click(screen.getByRole("button", { name: "Reinvia email" }))
    expect((await screen.findByRole("status")).textContent).toMatch(/2 inviate/)
    fireEvent.click(screen.getByRole("button", { name: "Anonimizza" }))
    expect(a.anonymize).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Anonimizza" }))
    await waitFor(() => expect(a.anonymize).toHaveBeenCalledWith("lead-1"))
  })

  it("senza permessi: solo consultazione", () => {
    render(<LeadDetail lead={detail} canManage={false} canErase={false} currentUserId="u1" actions={actions()} />)
    for (const name of ["Prendi in carico", "Cambia stato", "Reinvia email", "Anonimizza"]) expect(screen.queryByRole("button", { name })).toBeNull()
    expect(screen.getByRole("link", { name: "Scarica PDF" })).toBeTruthy()
  })
})
