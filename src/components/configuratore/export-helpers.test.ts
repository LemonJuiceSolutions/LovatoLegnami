import { describe, expect, it } from "vitest"
import { createConfiguratoreStore } from "@/stores/configuratore-store"
import { satFromState } from "./export-helpers"

describe("satFromState", () => {
  it("rifiuta l'export se i solidi del kernel non sono quelli dell'assieme corrente", () => {
    const store = createConfiguratoreStore()
    expect(store.getState().derived.assembly).not.toBeNull()
    expect(() => satFromState(store.getState())).toThrow(/solidi non aggiornati/)
  })
})
