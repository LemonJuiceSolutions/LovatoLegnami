import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { DEFAULT_LOVATO_RULES } from "@/domain/rules/data/default-lovato"
import { loadRuleSet, RULE_KINDS } from "@/domain/rules/types"
import { PIECE_TYPES } from "@/domain/components/types"
import type { DatasetStatusInfo } from "../types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/admin/regole" }))
vi.setConfig({ testTimeout: 60_000 })
const { RulesEditor } = await import("../regole/rules-editor")
const { DraftProvider } = await import("../draft-context")
const { formFromRule, ruleFromForm } = await import("../regole/rule-forms")

const status: DatasetStatusInfo = { dataset: "regole", active: null, draft: { id: "d", version: 2, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-10-15T08:00:00.000Z", by: null, at: "" } }

describe("regole costruttive (9.6)", () => {
  it("andata e ritorno regola ↔ form per il set di default", () => {
    const back = loadRuleSet({ ...DEFAULT_LOVATO_RULES, rules: DEFAULT_LOVATO_RULES.rules.map((r) => ruleFromForm(formFromRule(r))) })
    expect(back).toEqual(DEFAULT_LOVATO_RULES)
  })

  it("una regola di tipo sconosciuto non è componibile: si scelgono solo i tipi e i pezzi noti", () => {
    render(<RulesEditor ruleSet={DEFAULT_LOVATO_RULES} onSave={async () => ({ ok: true })} />)
    const kinds = within(screen.getByLabelText("Tipo della nuova regola")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)
    expect(kinds).toEqual([...RULE_KINDS])
    const minSection = DEFAULT_LOVATO_RULES.rules.find((r) => r.kind === "min-section")!
    const pieceSelect = screen.getByLabelText(`Tipo di pezzo della regola ${minSection.name}`) as HTMLSelectElement
    expect([...pieceSelect.options].map((o) => o.value)).toEqual([...PIECE_TYPES])
    // un valore estraneo non entra nella select
    fireEvent.change(pieceSelect, { target: { value: "astronave" } })
    expect(PIECE_TYPES as readonly string[]).toContain(pieceSelect.value)
  })

  it("interasse modificato e regola aggiunta: il salvataggio chiama l'action su `rules` con un set valido", async () => {
    const saveAction = vi.fn(async () => ({ ok: true as const, data: status }))
    render(
      <DraftProvider status={status} saveAction={saveAction}>
        <RulesEditor ruleSet={DEFAULT_LOVATO_RULES} />
      </DraftProvider>,
    )
    const spacing = screen.getByRole("region", { name: "Interasse massimo dei travetti" })
    const input = within(spacing).getByLabelText("Interasse massimo")
    fireEvent.change(input, { target: { value: "abc" } })
    expect(within(spacing).getByRole("alert").textContent).toBe("inserire un numero maggiore o uguale a 1")
    expect((screen.getByRole("button", { name: "Salva nella bozza" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: "700" } })
    fireEvent.change(screen.getByLabelText("Tipo della nuova regola"), { target: { value: "min-clear-height" } })
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi regola" }))
    fireEvent.click(screen.getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    const { changes } = (saveAction.mock.calls[0] as unknown as [{ changes: { path: string; value: unknown[] }[] }])[0]
    expect(changes[0]!.path).toBe("rules")
    const saved = loadRuleSet({ id: DEFAULT_LOVATO_RULES.id, rules: changes[0]!.value })
    expect(saved.rules.find((r) => r.kind === "max-joist-spacing")).toMatchObject({ max: 700 })
    expect(saved.rules.filter((r) => r.kind === "min-clear-height")).toHaveLength(2)
  })

  it("id duplicato ⇒ errore del dominio con l'id e salvataggio bloccato", () => {
    render(<RulesEditor ruleSet={DEFAULT_LOVATO_RULES} onSave={async () => ({ ok: true })} />)
    const spacing = DEFAULT_LOVATO_RULES.rules.find((r) => r.kind === "max-joist-spacing")!
    const other = DEFAULT_LOVATO_RULES.rules.find((r) => r.kind === "max-overhang")!
    fireEvent.change(screen.getByLabelText(`Id della regola ${other.name}`), { target: { value: spacing.id } })
    expect(screen.getByRole("alert").textContent).toMatch(new RegExp(`regola "${spacing.id}": id duplicato`))
    expect((screen.getByRole("button", { name: "Salva nella bozza" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
