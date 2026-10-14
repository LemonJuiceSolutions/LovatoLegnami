import { describe, expect, it } from "vitest";
import { DEFAULT_LAYERS, createViewerStore } from "./viewer-store";

describe("viewer store", () => {
  it("parte con i livelli di default", () => {
    expect(createViewerStore().getState().layers).toEqual(DEFAULT_LAYERS);
    expect(createViewerStore({ quote: true }).getState().layers.quote).toBe(true);
  });

  it("mostra e nasconde un livello senza toccare gli altri", () => {
    const store = createViewerStore();
    store.getState().toggleLayer("ostacoli");
    expect(store.getState().layers).toEqual({ ...DEFAULT_LAYERS, ostacoli: false });
    store.getState().setLayer("ostacoli", true);
    expect(store.getState().layers).toEqual(DEFAULT_LAYERS);
  });

  it("non cambia riferimento se il valore è già quello richiesto", () => {
    const store = createViewerStore();
    const before = store.getState().layers;
    store.getState().setLayer("ingombro", true);
    expect(store.getState().layers).toBe(before);
  });
});
