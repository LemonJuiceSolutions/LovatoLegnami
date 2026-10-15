import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_PRICE_LIST_DATA, formatEuro } from "@/domain"
import { DEFAULT_CATALOG, catalogFromResponse } from "@/stores/catalog"
import { configuratoreStore } from "@/stores/use-configuratore"
import { PricingPanel } from "./pricing-panel"
import { groupBars, lineDetail } from "./pricing-helpers"

const state = () => configuratoreStore.getState()
const norm = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ")
const totalText = () => norm(state().derived.quote && formatEuro(state().derived.quote!.totals.totalCents))

describe("PricingPanel (10.2)", () => {
  beforeEach(() => {
    state().setCatalog(DEFAULT_CATALOG)
    state().resetConfig("addossata-monofalda")
  })

  it("larghezza 5000 → 6000: nuovo totale e righe del legno aggiornate", () => {
    act(() => state().setParam("larghezza", 5000))
    render(<PricingPanel />)
    const before = totalText()
    expect(norm(document.body.textContent)).toContain(before)
    fireEvent.click(screen.getByRole("button", { name: /^Legno/ }))
    const woodBefore = [...document.querySelectorAll('[data-group="legno"] [data-line]')].map((el) => norm(el.textContent))
    expect(woodBefore.length).toBeGreaterThan(0)

    act(() => state().setParam("larghezza", 6000))
    const after = totalText()
    expect(after).not.toBe(before)
    expect(norm(document.body.textContent)).toContain(after)
    const woodAfter = [...document.querySelectorAll('[data-group="legno"] [data-line]')].map((el) => norm(el.textContent))
    expect(woodAfter).not.toEqual(woodBefore)
  })

  it("dettaglio legno: barre con i tagli e sfrido percentuale per sezione", () => {
    render(<PricingPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Dettaglio legno e piano di taglio" }))
    const plan = screen.getByTestId("cut-plan")
    const groups = plan.querySelectorAll("[data-cut-group]")
    expect(groups.length).toBe(state().derived.quote!.cutPlan.groups.length)
    expect(plan.querySelectorAll("[data-bar]").length).toBeGreaterThan(0)
    expect(within(plan).getAllByTestId("waste-pct")[0].textContent).toMatch(/sfrido \d+(,\d)?%/)
    expect(plan.textContent).toMatch(/barra 6\.000 mm|barra \d\.\d{3} mm/)
  })

  it("versione del listino, margini, complicazioni e anteprima cliente", () => {
    act(() =>
      state().setCatalog(
        catalogFromResponse({
          listino: { id: "l5", version: 5, effectiveFrom: "2026-06-01", data: DEFAULT_PRICE_LIST_DATA },
          regole: null,
        })
      )
    )
    render(<PricingPanel />)
    expect(screen.getByTestId("price-list-version").textContent).toBe("Listino v5 (dal 01/06)")
    expect(screen.getByText(/in uso le regole di default/)).toBeTruthy()
    expect(norm(screen.getByTestId("margin").textContent)).toBe(norm(formatEuro(state().derived.quote!.totals.marginCents)))
    fireEvent.click(screen.getByRole("button", { name: /Cantiere e complicazioni/ }))
    // monofalda di default: lavoro in quota (altezza oltre soglia)
    expect(screen.getByRole("list", { name: "Complicazioni scattate" }).children.length).toBe(state().derived.quote!.firedRules.length)

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Anteprima cliente" }))
    const preview = screen.getByTestId("customer-preview")
    expect(norm(within(preview).getByTestId("customer-total").textContent)).toBe(totalText())
    expect(preview.textContent).not.toMatch(/margine|sfrido/i)
  })
})

describe("pricing-helpers", () => {
  it("lineDetail e groupBars", () => {
    expect(lineDetail({ quantity: 15, unit: "%", unitPriceCents: 123_400 }).replace(/ /g, " ")).toBe("15% di 1.234,00 €")
    expect(lineDetail({ quantity: 0.5125, unit: "m³", unitPriceCents: 65_000 }).replace(/ /g, " ")).toBe("0,513 m³ × 650,00 €")
    expect(lineDetail({ quantity: 3, unit: "pz", unitPriceCents: 0 })).toBe("3 pz")
    const bar = (l: number, cuts: number[]) => ({ length: l, cuts: cuts.map((c, i) => ({ id: `P${i}`, length: c })), offcut: 10, reusable: false })
    const rows = groupBars([bar(6000, [2900, 2900]), bar(6000, [2900, 2900]), bar(4000, [3900])])
    expect(rows.map((r) => [r.length, r.count])).toEqual([
      [6000, 2],
      [4000, 1],
    ])
  })
})
