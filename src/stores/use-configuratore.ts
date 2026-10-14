import { useStore } from "zustand";
import { createPersistentConfiguratoreStore, type ConfiguratoreState } from "./configuratore-store";

/**
 * Istanza dell'app dello store del configuratore, persistita in
 * `localStorage` (`lovato-configuratore-v1`). Lato server (nessun `window`)
 * il ripristino è saltato; nel browser avviene alla creazione del modulo.
 */
export const configuratoreStore = createPersistentConfiguratoreStore({
  skipHydration: typeof window === "undefined",
});

/** Hook React: `useConfiguratore((s) => s.derived.violations)`. I selettori devono restituire riferimenti stabili. */
export function useConfiguratore<T>(selector: (state: ConfiguratoreState) => T): T {
  return useStore(configuratoreStore, selector);
}
