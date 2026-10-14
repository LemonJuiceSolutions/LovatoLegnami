"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useConfiguratore } from "@/stores/use-configuratore"

/** Stato del kernel geometrico (init → pronto, costruzione in corso, non disponibile). */
export function KernelStatusBadge() {
  const status = useConfiguratore((s) => s.kernel.status)
  const building = useConfiguratore((s) => s.kernel.building)
  const error = useConfiguratore((s) => s.kernel.error)

  if (status === "unavailable") {
    return (
      <Badge variant="destructive" className="gap-1" title={error ?? undefined}>
        <AlertTriangle className="h-3 w-3" />
        Kernel non disponibile
      </Badge>
    )
  }
  if (status === "idle" || status === "init") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Avvio kernel...
      </Badge>
    )
  }
  if (building) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Costruzione solidi...
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1" title={error ?? undefined}>
      <CheckCircle2 className="h-3 w-3" />
      Kernel pronto
    </Badge>
  )
}
