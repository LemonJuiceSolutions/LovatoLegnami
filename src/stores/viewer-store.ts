import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * Stato d'interfaccia del visualizzatore 3D (spec `visualizzatore-3d`):
 * livelli visibili. Separato dallo store del configuratore perché non fa parte
 * della configurazione e non è persistito né salvato nel JSON.
 */

export const VIEWER_LAYERS = ["ingombro", "ostacoli", "pavimento", "quote"] as const;
export type ViewerLayer = (typeof VIEWER_LAYERS)[number];

export const LAYER_LABELS: Readonly<Record<ViewerLayer, string>> = {
  ingombro: "Ingombro",
  ostacoli: "Ostacoli",
  pavimento: "Pavimento",
  quote: "Quote",
};

export type LayerVisibility = Readonly<Record<ViewerLayer, boolean>>;

export const DEFAULT_LAYERS: LayerVisibility = { ingombro: true, ostacoli: true, pavimento: true, quote: false };

export interface ViewerState {
  readonly layers: LayerVisibility;
  setLayer(layer: ViewerLayer, visible: boolean): void;
  toggleLayer(layer: ViewerLayer): void;
}

export type ViewerStore = StoreApi<ViewerState>;

export function createViewerStore(initial: Partial<LayerVisibility> = {}): ViewerStore {
  return createStore<ViewerState>()((set, get) => ({
    layers: { ...DEFAULT_LAYERS, ...initial },
    setLayer(layer, visible) {
      if (get().layers[layer] === visible) return;
      set({ layers: { ...get().layers, [layer]: visible } });
    },
    toggleLayer(layer) {
      get().setLayer(layer, !get().layers[layer]);
    },
  }));
}

/** Istanza dell'app (una sola scena per pagina). */
export const viewerStore = createViewerStore();

/** Hook React: `useViewer((s) => s.layers.ostacoli)`. */
export function useViewer<T>(selector: (state: ViewerState) => T): T {
  return useStore(viewerStore, selector);
}
