// Setup dei test di rendering (progetto vitest `dom`, ambiente jsdom).
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Senza `globals` RTL non registra da sé la pulizia del DOM tra un test e l'altro.
afterEach(() => cleanup())

// API del browser assenti in jsdom e usate dai componenti Radix.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const g = globalThis as Record<string, unknown>
g.ResizeObserver ??= ResizeObserverStub
const proto = Element.prototype as unknown as Record<string, unknown>
proto.hasPointerCapture ??= () => false
proto.releasePointerCapture ??= () => {}
proto.scrollIntoView ??= () => {}

// Node ≥ 22 espone un `localStorage` globale (senza file è inutilizzabile) che
// prevale su quello di jsdom: lo sostituiamo con uno storage in memoria.
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}
let usable = false
try {
  usable = typeof globalThis.localStorage?.setItem === "function"
} catch {
  usable = false
}
if (!usable) Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true, writable: true })
