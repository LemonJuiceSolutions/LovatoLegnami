"use client"

import * as React from "react"
import { Box, Calculator, ClipboardList, SlidersHorizontal } from "lucide-react"
import { CommercialForm } from "@/components/preventivo/commercial-form"
import { PricingPanel, QuoteTotalBadge } from "@/components/preventivo/pricing-panel"
import { RequestHeader, RequestNotice, type RequestHeaderData } from "@/components/preventivo/request-header"
import { parseConfigFile } from "@/stores/config-file"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { configuratoreStore } from "@/stores/use-configuratore"
import { KernelStatusBadge } from "./kernel-status"
import { ConfigToolbar } from "./config-toolbar"
import { EnvelopeForm } from "./envelope-form"
import { ParamsPanel } from "./params-panel"
import { ExportPanel } from "./export-panel"
import { ResultsPanel } from "./results-panel"
import { ViewerSlot } from "./viewer-slot"

/**
 * Contenitore della pagina `/configuratore` (spec `configuratore-ui`,
 * "Layout a tre zone"). Una sola istanza per pannello:
 * - < 1024 px: schede (Parametri / 3D / Esiti), una visibile alla volta;
 * - 1024–1759 px: parametri a sinistra, viewer in alto al centro, esiti ed
 *   esportazioni sotto il viewer (il viewer resta oltre il 50% della larghezza);
 * - ≥ 1760 px: tre colonne (parametri | viewer | esiti).
 * Le schede usano `forceMount`, quindi il viewer non viene smontato al cambio
 * di scheda o di breakpoint.
 */

/** Scheda: nascosta se inattiva solo sotto `lg`. */
const panelClass =
  "mt-0 flex min-h-0 flex-col data-[state=inactive]:hidden lg:data-[state=inactive]:flex"

export function Panel({
  title,
  icon: Icon,
  actions,
  className,
  children,
}: {
  title: string
  icon?: React.ElementType
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn("flex min-h-0 flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </CardTitle>
        {actions}
      </CardHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </Card>
  )
}

export interface ConfiguratoreProps {
  /** Contenuto del pannello parametri (11.3–11.4). */
  params?: React.ReactNode
  /** Contenuto del pannello esiti (11.5). */
  results?: React.ReactNode
  /** Contenuto del pannello esportazioni (11.6). */
  exports?: React.ReactNode
  /** Barra salva/carica/esempi (11.7). */
  toolbar?: React.ReactNode
  /** Pannello "Preventivo" (sito-preventivi 10.2). */
  quote?: React.ReactNode
  /** Totale del preventivo nell'intestazione del pannello. */
  quoteActions?: React.ReactNode
  /** Intestazione sopra il layout (richiesta aperta, 10.4). */
  banner?: React.ReactNode
}

export function ConfiguratoreLayout({ params, results, exports, toolbar, quote, quoteActions, banner }: ConfiguratoreProps) {
  const [tab, setTab] = React.useState("parametri")

  return (
    <div className="flex min-h-full flex-col gap-4 lg:h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Configuratore pergole</h1>
          <p className="text-sm text-muted-foreground">
            Tipologia, parametri e ingombro del cliente: regole, collisioni ed export CNC in tempo reale.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KernelStatusBadge />
          {toolbar}
        </div>
      </div>

      {banner}

      <Tabs
        value={tab}
        onValueChange={setTab}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3",
          "lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-4",
          quote
            ? "min-[1760px]:grid-cols-[340px_minmax(0,1fr)_440px] min-[1760px]:grid-rows-[minmax(0,1fr)]"
            : "min-[1760px]:grid-cols-[340px_minmax(0,1fr)_380px] min-[1760px]:grid-rows-[minmax(0,1fr)]"
        )}
      >
        <TabsList className="grid w-full grid-cols-3 lg:hidden">
          <TabsTrigger value="parametri">Parametri</TabsTrigger>
          <TabsTrigger value="viewer">3D</TabsTrigger>
          <TabsTrigger value="esiti">Esiti</TabsTrigger>
        </TabsList>

        <TabsContent
          value="parametri"
          forceMount
          className={cn(panelClass, "lg:col-start-1 lg:row-span-2 lg:row-start-1 min-[1760px]:row-span-1")}
        >
          <Panel title="Parametri" icon={SlidersHorizontal} className="flex-1">
            {params}
          </Panel>
        </TabsContent>

        <TabsContent
          value="viewer"
          forceMount
          className={cn(panelClass, "h-[60vh] lg:col-start-2 lg:row-start-1 lg:h-auto")}
        >
          <div className="relative min-h-0 flex-1">
            <ViewerSlot />
          </div>
        </TabsContent>

        <TabsContent
          value="esiti"
          forceMount
          className={cn(
            panelClass,
            "lg:col-start-2 lg:row-start-2 min-[1760px]:col-start-3 min-[1760px]:row-start-1"
          )}
        >
          {quote ? (
            // Esiti ed esportazioni impilati, preventivo accanto (lg) o in mezzo (≥ 1760 px).
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] min-[1760px]:grid-cols-1 min-[1760px]:grid-rows-[minmax(0,0.8fr)_minmax(0,2.2fr)_minmax(0,0.8fr)]">
              <Panel title="Esiti" icon={ClipboardList} className="lg:col-start-1 lg:row-start-1">
                {results}
              </Panel>
              <Panel
                title="Preventivo"
                icon={Calculator}
                actions={quoteActions}
                className="lg:col-start-2 lg:row-span-2 lg:row-start-1 min-[1760px]:col-start-1 min-[1760px]:row-span-1 min-[1760px]:row-start-2"
              >
                {quote}
              </Panel>
              <Panel title="Esportazioni" icon={Box} className="lg:col-start-1 lg:row-start-2 min-[1760px]:row-start-3">
                {exports}
              </Panel>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 min-[1760px]:grid-cols-1 min-[1760px]:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
              <Panel title="Esiti" icon={ClipboardList}>
                {results}
              </Panel>
              <Panel title="Esportazioni" icon={Box}>
                {exports}
              </Panel>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Richiesta passata dalla pagina server con `?richiesta=<id>` (10.4). */
export type ConfiguratoreRequest =
  | { readonly kind: "ok"; readonly request: RequestHeaderData & { readonly config: unknown | null } }
  | { readonly kind: "missing"; readonly message: string }

/**
 * Configurazione della richiesta nello store (una sola volta per richiesta): quella del
 * cliente se leggibile, altrimenti la predefinita.
 */
function useRequestConfig(request: ConfiguratoreRequest | undefined) {
  const key = request ? (request.kind === "ok" ? request.request.id : "missing") : null
  React.useEffect(() => {
    if (!request) return
    const store = configuratoreStore.getState()
    if (request.kind === "ok" && request.request.config) {
      try {
        store.loadConfig(parseConfigFile(request.request.config, { keepInvalidParams: true }))
        return
      } catch {
        // configurazione salvata illeggibile: si parte dalla predefinita
      }
    }
    store.resetConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

/** Pagina completa: avvia il kernel geometrico al mount (il worker parte solo qui). */
export function Configuratore({ request, canSaveFinal = false }: { request?: ConfiguratoreRequest; canSaveFinal?: boolean } = {}) {
  useRequestConfig(request)
  React.useEffect(() => {
    // listino e regole della versione attiva (ripiego sui default con avviso)
    void configuratoreStore.getState().loadCatalog()
    configuratoreStore.getState().startKernel()
    return () => configuratoreStore.getState().stopKernel()
  }, [])

  return (
    <ConfiguratoreLayout
      params={<ParamsPanel envelope={<EnvelopeForm />} commercial={<CommercialForm />} />}
      results={<ResultsPanel />}
      quote={<PricingPanel />}
      quoteActions={<QuoteTotalBadge />}
      banner={
        request?.kind === "ok" ? (
          <RequestHeader request={request.request} canSave={canSaveFinal} />
        ) : request?.kind === "missing" ? (
          <RequestNotice message={request.message} />
        ) : undefined
      }
      exports={<ExportPanel />}
      toolbar={<ConfigToolbar />}
    />
  )
}
