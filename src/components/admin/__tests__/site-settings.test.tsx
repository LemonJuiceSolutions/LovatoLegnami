import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { defaultTypologySettings } from "@/domain/site/typology-settings"
import { PRESET_CATALOG } from "@/domain/presets/catalog"
import type { DatasetStatusInfo } from "../types"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/admin/tipologie" }))
const { TypologiesEditor } = await import("../siti/typologies-editor")
const { PresetsEditor } = await import("../siti/presets-editor")
const { DraftProvider } = await import("../draft-context")

const settings = defaultTypologySettings()
const status = (dataset: DatasetStatusInfo["dataset"]): DatasetStatusInfo => ({ dataset, active: null, draft: { id: "d", version: 2, effectiveFrom: "2026-01-01", notes: null, updatedAt: "2026-10-15T08:00:00.000Z", by: null, at: "" } })
const presets = PRESET_CATALOG.map((p) => ({ id: p.id, name: p.name, typologySlug: p.typologySlug }))

describe("tipologie sul sito (9.7)", () => {
  it("nascondere una tipologia aggiorna la bozza (documento intero, ordine dell'elenco)", async () => {
    const saveAction = vi.fn(async () => ({ ok: true as const, data: status("tipologie") }))
    render(
      <DraftProvider status={status("tipologie")} saveAction={saveAction}>
        <TypologiesEditor settings={settings} presets={presets} startingPrices={{}} />
      </DraftProvider>,
    )
    const toggle = screen.getByRole("switch", { name: "Visibile sul sito: addossata-monofalda" })
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    const { changes } = (saveAction.mock.calls[0] as unknown as [{ changes: { path: string; value: { slug: string; visible: boolean; order: number }[] }[] }])[0]
    expect(changes[0]!.path).toBe("")
    const value = changes[0]!.value
    expect(value.find((t) => t.slug === "addossata-monofalda")!.visible).toBe(false)
    expect(value.find((t) => t.slug === "autoportante-bifalda")!.visible).toBe(true)
    expect(value.map((t) => t.order)).toEqual(value.map((_, i) => i))
  })

  it("slug SEO duplicato ⇒ errore del campo e salvataggio bloccato; prezzo 'a partire da' del preset scelto", () => {
    const ref = presets.find((p) => p.typologySlug === "autoportante-bifalda")!
    render(<TypologiesEditor settings={settings} presets={presets} startingPrices={{ [ref.id]: "a partire da 6.470,00 €" }} onSave={async () => ({ ok: true })} />)
    const seo = screen.getAllByLabelText("Indirizzo della pagina")
    fireEvent.change(seo[1]!, { target: { value: settings[0]!.seoSlug } })
    expect(screen.getByRole("alert").textContent).toMatch(/slug SEO duplicato/)
    expect((screen.getByRole("button", { name: "Salva nella bozza" }) as HTMLButtonElement).disabled).toBe(true)
    const bifalda = settings.findIndex((t) => t.slug === "autoportante-bifalda")
    fireEvent.change(screen.getAllByLabelText("Preset di riferimento")[bifalda]!, { target: { value: ref.id } })
    expect(screen.getByText("a partire da 6.470,00 €")).toBeTruthy()
  })

  it("immagine caricata: testo alternativo obbligatorio prima del salvataggio", async () => {
    const upload = vi.fn(async () => ({ ok: true as const, src: "/api/immagini/abc" }))
    const onSave = vi.fn(async () => ({ ok: true as const }))
    render(<TypologiesEditor settings={settings.slice(0, 1)} presets={presets} startingPrices={{}} onSave={onSave} upload={upload} />)
    fireEvent.change(screen.getByLabelText(`File per Immagine principale di ${settings[0]!.slug}`), { target: { files: [new File(["x"], "foto.jpg", { type: "image/jpeg" })] } })
    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect((await screen.findByRole("alert")).textContent).toMatch(/testo alternativo obbligatorio/)
    fireEvent.change(screen.getByLabelText(`Testo alternativo immagine 1 (Immagine principale di ${settings[0]!.slug})`), { target: { value: "Pergola addossata in larice" } })
    fireEvent.click(screen.getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const [saved] = (onSave.mock.calls[0] as unknown as [{ heroImage?: unknown }[]])[0]
    expect(saved!.heroImage).toEqual({ src: "/api/immagini/abc", alt: "Pergola addossata in larice" })
  })
})

describe("preset (9.7)", () => {
  it("nome, descrizione e visibilità; parametri in sola lettura con 'Apri nel configuratore'", async () => {
    const saveAction = vi.fn(async () => ({ ok: true as const, data: status("preset") }))
    const two = PRESET_CATALOG.slice(0, 2)
    render(
      <DraftProvider status={status("preset")} saveAction={saveAction}>
        <PresetsEditor presets={two} typologyTitles={{}} />
      </DraftProvider>,
    )
    expect(screen.getAllByRole("link", { name: "Apri nel configuratore" })[0]!.getAttribute("href")).toBe(`/configuratore?preset=${two[0]!.id}`)
    fireEvent.change(screen.getByLabelText("Descrizione riga 1"), { target: { value: "La più richiesta" } })
    fireEvent.click(screen.getByRole("switch", { name: "Visibile riga 2" }))
    fireEvent.click(screen.getByRole("button", { name: "Salva nella bozza" }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    const { changes } = (saveAction.mock.calls[0] as unknown as [{ changes: { path: string; value: Record<string, unknown>[] }[] }])[0]
    expect(changes[0]!.path).toBe("")
    expect(changes[0]!.value[0]).toEqual({ ...two[0], description: "La più richiesta" })
    expect(changes[0]!.value[1]).toEqual({ ...two[1], visible: false })
  })
})
