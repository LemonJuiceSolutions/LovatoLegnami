import { describe, expect, it } from "vitest";
import { DEFAULT_LAYERS, LAYER_LABELS, createViewerStore } from "./viewer-store";

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

  it("livello ferramenta attivo di default e disattivabile", () => {
    const store = createViewerStore();
    expect(store.getState().layers.ferramenta).toBe(true);
    expect(LAYER_LABELS.ferramenta).toBe("Ferramenta");
    store.getState().toggleLayer("ferramenta");
    expect(store.getState().layers).toEqual({ ...DEFAULT_LAYERS, ferramenta: false });
  });

  it("non cambia riferimento se il valore è già quello richiesto", () => {
    const store = createViewerStore();
    const before = store.getState().layers;
    store.getState().setLayer("ingombro", true);
    expect(store.getState().layers).toBe(before);
  });

  it("cambia vista e richiede l'inquadratura", () => {
    const store = createViewerStore();
    expect(store.getState().view).toBe("prospettica");
    store.getState().setView("pianta");
    expect(store.getState()).toMatchObject({ view: "pianta", frameRequest: 1 });
    store.getState().frameAll();
    expect(store.getState()).toMatchObject({ view: "pianta", frameRequest: 2 });
  });
});
