import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { serializeConfig } from "@/stores/config-file"
import { exampleConfig } from "@/stores/examples"
import { configuratoreStore } from "@/stores/use-configuratore"
import { ConfigToolbar, loadConfigText } from "./config-toolbar"

const state = () => configuratoreStore.getState()

describe("ConfigToolbar", () => {
  beforeEach(() => state().resetConfig("addossata-monofalda"))

  it("salva → ricarica restituisce la stessa configurazione", () => {
    act(() => {
      state().loadConfig(exampleConfig("monofalda-grondaia"))
      state().setParam("pendenza", 12)
    })
    const saved = serializeConfig(state().config)
    act(() => state().resetConfig("autoportante-bifalda"))
    expect(loadConfigText(saved)).toEqual({ ok: true })
    expect(serializeConfig(state().config)).toBe(saved)
  })

  it("un file non valido non altera lo store", () => {
    act(() => state().setParam("larghezza", 5500))
    const before = state().config
    const outcome = loadConfigText(JSON.stringify({ schemaVersion: 99, typology: "addossata-monofalda" }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.issues[0]).toMatchObject({ path: "schemaVersion" })
    expect(loadConfigText("{ non json").ok).toBe(false)
    expect(state().config).toBe(before)
  })

  it("caricando un file non valido dal pulsante mostra il dettaglio degli errori", async () => {
    render(<ConfigToolbar />)
    const before = state().config
    const bad = new File([JSON.stringify({ schemaVersion: 1, typology: "addossata-monofalda", envelope: { box: { width: -1, depth: 10, height: 10 } } })], "rotto.json", { type: "application/json" })
    fireEvent.change(screen.getByLabelText("File di configurazione"), { target: { files: [bad] } })
    await waitFor(() => expect(screen.getByText("Configurazione non caricata")).toBeTruthy())
    expect(screen.getByTestId("load-errors").textContent).toContain("envelope.box.width")
    expect(state().config).toBe(before)
  })
})
