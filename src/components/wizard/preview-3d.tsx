"use client"

import * as React from "react"
import { useStore } from "zustand"
import { Box, Loader2, Sparkles } from "lucide-react"
import type { Assembly } from "@/domain/components/types"
import type { Envelope } from "@/domain/envelope/types"
import type { WizardKernel } from "./kernel-store"
import { SPECIES_COPY } from "./finishes"
import { useWizardContext } from "./wizard-context"

/**
 * Anteprima 3D del riepilogo (12.6): sempre in **modalità box** (nessun kernel); il
 * pulsante "Mostra dettagli" carica il kernel geometrico solo su richiesta, su schermi
 * grandi e mai con il risparmio dati attivo. Se il kernel non è disponibile la scena resta
 * a box e il resto del riepilogo (prezzo compreso) funziona comunque.
 */

const WizardViewer = React.lazy(() => import("./wizard-viewer"))

class ViewerBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return c?.saveData === true
}

function useIsDark(): boolean {
  const [dark, setDark] = React.useState(false)
  React.useEffect(() => {
    const el = document.querySelector(".theme-site")
    const read = () => setDark(!!el?.classList.contains("dark"))
    read()
    if (!el) return
    const o = new MutationObserver(read)
    o.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => o.disconnect()
  }, [])
  return dark
}

export function Preview3D({ assembly, envelope, species, title }: { assembly: Assembly; envelope: Envelope; species: string; title: string }) {
  const { kernelFactory } = useWizardContext()
  const dark = useIsDark()
  const [kernel, setKernel] = React.useState<WizardKernel | null>(null)
  const [canDetail, setCanDetail] = React.useState(false)
  React.useEffect(() => {
    setCanDetail(!saveData() && (window.matchMedia?.("(min-width: 1024px)").matches ?? true))
  }, [])

  const start = async () => {
    if (kernel) return
    const { createWizardKernel } = await import("./kernel-store")
    const k = createWizardKernel(kernelFactory)
    k.getState().setAssembly(assembly)
    k.getState().actions.startKernel()
    setKernel(k)
  }
  React.useEffect(() => {
    kernel?.getState().setAssembly(assembly)
  }, [kernel, assembly])
  React.useEffect(() => () => kernel?.getState().actions.stopKernel(), [kernel])

  const fallback = (
    <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">
      <p>
        <Box className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
        La vista 3D non è disponibile su questo dispositivo.
      </p>
    </div>
  )
  return (
    <div>
      <div className="site-drafting relative aspect-[4/3] overflow-hidden rounded-2xl border border-border" data-viewer-mode={kernel ? "dettaglio" : "box"}>
        <ViewerBoundary fallback={fallback}>
          <React.Suspense
            fallback={
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Preparo la vista 3D…
              </div>
            }
          >
            <KernelAwareViewer kernel={kernel} assembly={assembly} envelope={envelope} woodColor={SPECIES_COPY[species]?.swatch ?? "#C8A27A"} dark={dark} label={`Vista 3D di ${title}`} />
          </React.Suspense>
        </ViewerBoundary>
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1 text-sm text-muted-foreground">Trascina per girarla · rotella o due dita per lo zoom</p>
      </div>
      {canDetail && <KernelControls kernel={kernel} onStart={start} />}
    </div>
  )
}

function KernelAwareViewer({ kernel, ...props }: { kernel: WizardKernel | null } & Omit<React.ComponentProps<typeof WizardViewer>, "results">) {
  return kernel ? <WithKernel kernel={kernel} {...props} /> : <WizardViewer {...props} results={EMPTY} />
}
const EMPTY = {}

function WithKernel({ kernel, ...props }: { kernel: WizardKernel } & Omit<React.ComponentProps<typeof WizardViewer>, "results">) {
  const results = useStore(kernel, (s) => s.kernel.results)
  return <WizardViewer {...props} results={results} />
}

function KernelControls({ kernel, onStart }: { kernel: WizardKernel | null; onStart: () => void }) {
  if (!kernel)
    return (
      <button type="button" onClick={onStart} className="site-btn site-btn-quiet mt-3">
        <Sparkles className="h-5 w-5" aria-hidden="true" /> Mostra dettagli
      </button>
    )
  return <KernelStatus kernel={kernel} />
}

function KernelStatus({ kernel }: { kernel: WizardKernel }) {
  const status = useStore(kernel, (s) => s.kernel.status)
  const building = useStore(kernel, (s) => s.kernel.building)
  return (
    <p role="status" className="mt-3 text-muted-foreground">
      {status === "unavailable"
        ? "Il dettaglio delle lavorazioni non è disponibile su questo dispositivo: vedi la pergola semplificata."
        : status === "ready" && !building
          ? "Dettagli delle lavorazioni caricati."
          : "Carico i dettagli delle lavorazioni…"}
    </p>
  )
}
