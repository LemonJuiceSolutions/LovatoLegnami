"use client"

import * as React from "react"
import { Box, ClipboardList, SlidersHorizontal } from "lucide-react"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { configuratoreStore } from "@/stores/use-configuratore"
import { KernelStatusBadge } from "./kernel-status"
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
}

export function ConfiguratoreLayout({ params, results, exports, toolbar }: ConfiguratoreProps) {
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

      <Tabs
        value={tab}
        onValueChange={setTab}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3",
          "lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-4",
          "min-[1760px]:grid-cols-[340px_minmax(0,1fr)_380px] min-[1760px]:grid-rows-[minmax(0,1fr)]"
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
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 min-[1760px]:grid-cols-1 min-[1760px]:grid-rows-[minmax(0,1fr)_auto]">
            <Panel title="Esiti" icon={ClipboardList}>
              {results}
            </Panel>
            <Panel title="Esportazioni" icon={Box}>
              {exports}
            </Panel>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Pagina completa: avvia il kernel geometrico al mount (il worker parte solo qui). */
export function Configuratore() {
  React.useEffect(() => {
    configuratoreStore.getState().startKernel()
    return () => configuratoreStore.getState().stopKernel()
  }, [])

  return <ConfiguratoreLayout />
}
