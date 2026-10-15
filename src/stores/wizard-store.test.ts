import { afterEach, describe, expect, it, vi } from "vitest"
import { browserSessionStorage, createWizardStore } from "./wizard-store"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("store del wizard sul server (prerender)", () => {
  it("senza sessionStorage (Node < 25) lo store ha comunque `persist` e non scrive nulla", async () => {
    vi.stubGlobal("sessionStorage", undefined)
    const storage = browserSessionStorage()
    expect(storage.getItem("x")).toBeNull()
    const store = createWizardStore()
    expect(typeof store.persist.hasHydrated).toBe("function")
    await store.persist.rehydrate()
    expect(store.persist.hasHydrated()).toBe(true)
    store.getState().setContacts({ cap: "31100" })
    expect(store.getState().answers.contatti.cap).toBe("31100")
  })
})
